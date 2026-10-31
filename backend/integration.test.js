import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app, generateDueInvoices } from './server.js';
import { Discount, Invoice, Payment, Plan, Product, Quotation, Subscription, Tax, User } from './models.js';
import { recordPayment } from './payments.js';

describe('backend API with an isolated MongoDB database', { skip: !process.env.TEST_MONGODB_URI }, () => {
  const databaseName = `subsight_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  let baseUrl;
  let admin;
  let customer;
  let adminToken;
  let customerToken;
  const password = 'TestPassword!42';

  const sign = (user) => jwt.sign({ sub: user.id, ver: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const call = async (method, path, body, token = adminToken) => {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  };
  const invoiceFor = (total = 100) => Invoice.create({
    number: `INV-${randomUUID()}`, customer: customer._id, total, outstanding: total,
    dueDate: new Date(), status: 'confirmed'
  });
  const planFor = () => Plan.create({ name: 'Monthly plan', price: 100, frequency: 'monthly' });
  const subscriptionFor = async (extra = {}) => {
    const plan = await planFor();
    return Subscription.create({
      number: `SUB-${randomUUID()}`, customer: customer._id, plan: plan._id, frequency: 'monthly',
      items: [{ description: 'Monthly plan', unitPrice: 100, quantity: 1, taxRate: 18, taxAmount: 18, amount: 118 }],
      total: 118, nextBillingDate: new Date(), ...extra
    });
  };

  before(async () => {
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.NODE_ENV = 'test';
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
    await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.models).map((Model) => Model.deleteMany({})));
    [admin, customer] = await User.create([
      { name: 'Test Admin', email: 'admin@example.test', password, role: 'admin' },
      { name: 'Test Customer', email: 'customer@example.test', password, role: 'customer' }
    ]);
    adminToken = sign(admin);
    customerToken = sign(customer);
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('invalid IDs, nested query values and malformed dates return 400', async () => {
    assert.equal((await call('GET', '/invoices/not-an-id')).status, 400);
    assert.equal((await call('GET', '/users?role[$ne]=customer')).status, 400);
    assert.equal((await call('POST', '/invoices', { customer: { $ne: null } })).status, 400);
    assert.equal((await call('POST', '/invoices', {
      customer: customer.id, items: [{ description: 'Test', unitPrice: 100 }], dueDate: 'invalid'
    })).status, 400);
  });

  test('invalid seat quantities and tax rates cannot create billing records', async () => {
    const plan = await planFor();
    for (const quantity of [0, -1, 1.5]) {
      assert.equal((await call('POST', '/portal/subscriptions', { plan: plan.id, quantity }, customerToken)).status, 400);
    }
    for (const item of [null, { description: 'Test', unitPrice: 100, taxRate: 101 }, { description: 'Test', unitPrice: 100, discountAmount: -1 }]) {
      assert.equal((await call('POST', '/invoices', { customer: customer.id, items: [item] })).status, 400);
    }
    assert.equal(await Subscription.countDocuments(), 0);
    assert.equal(await Invoice.countDocuments(), 0);
  });

  test('literal catalog searches and malformed pagination remain usable', async () => {
    await Product.create({ name: 'Plan [Basic]', salesPrice: 100 });
    const result = await call('GET', '/products?search=%5B&page=Infinity&limit=1.5');
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.page, 1);
  });

  test('quotation POST/PATCH conversion is repeatable without duplicate subscriptions', async () => {
    const plan = await planFor();
    const quote = await call('POST', '/quotations', {
      customer: customer.id, plan: plan.id, items: [{ description: plan.name, unitPrice: plan.price }]
    });
    assert.equal(quote.status, 201);
    const path = `/quotations/${quote.body.item._id}/status`;
    const results = await Promise.all([call('POST', path, { status: 'accepted' }), call('PATCH', path, { status: 'accepted' })]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    assert.equal(await Subscription.countDocuments({ quotation: quote.body.item._id }), 1);
    assert.equal((await call('PATCH', path, { status: 'rejected' })).status, 409);
  });

  test('quotation conversion enforces current plan minimum quantities', async () => {
    const plan = await planFor();
    plan.minimumQuantity = 3;
    await plan.save();
    const quote = await Quotation.create({
      number: 'QUO-minimum', customer: customer._id, plan: plan._id, total: 100,
      validUntil: new Date(Date.now() + 86400000), items: [{ description: 'Plan', quantity: 1, unitPrice: 100, amount: 100 }]
    });
    assert.equal((await call('POST', `/quotations/${quote.id}/status`, { status: 'accepted' })).status, 400);
    assert.equal(await Subscription.countDocuments(), 0);
  });

  test('concurrent payments preserve exact balances and reject overpayment', async () => {
    const invoice = await invoiceFor(0.3);
    const results = await Promise.all([0.1, 0.2].map((amount) => call('POST', '/payments', { invoice: invoice.id, amount })));
    assert.deepEqual(results.map((result) => result.status), [201, 201]);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 0.3);
    assert.equal(saved.outstanding, 0);
    assert.equal(saved.status, 'paid');
    assert.equal((await call('POST', '/payments', { invoice: invoice.id, amount: 0.01 })).status, 400);
    assert.equal((await call('PATCH', `/invoices/${invoice.id}/status`, { status: 'confirmed' })).status, 400);
  });

  test('a failed payment record restores the invoice balance and status', async (context) => {
    const invoice = await invoiceFor();
    context.mock.method(Payment, 'create', async () => { throw new Error('Payment write failed'); });
    await assert.rejects(recordPayment({ invoice: invoice.id, amount: 40, method: 'upi' }), /Payment write failed/);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 0);
    assert.equal(saved.outstanding, 100);
    assert.equal(saved.status, 'confirmed');
  });

  test('simultaneous payments cannot exceed the remaining invoice balance', async () => {
    const invoice = await invoiceFor();
    const results = await Promise.all([1, 2].map(() => call('POST', '/payments', { invoice: invoice.id, amount: 80 })));
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 400]);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 80);
    assert.equal(saved.outstanding, 20);
    assert.equal(await Payment.countDocuments(), 1);
  });

  test('payment rollback preserves a different successful concurrent payment', async (context) => {
    const invoice = await invoiceFor();
    const create = Payment.create.bind(Payment);
    let finishSuccessfulPayment;
    const successfulPayment = new Promise((resolve) => { finishSuccessfulPayment = resolve; });
    context.mock.method(Payment, 'create', async (data) => {
      if (data.amount === 30) {
        await successfulPayment;
        throw new Error('Payment write failed');
      }
      const payment = await create(data);
      finishSuccessfulPayment();
      return payment;
    });
    const results = await Promise.allSettled([
      recordPayment({ invoice: invoice.id, amount: 30 }), recordPayment({ invoice: invoice.id, amount: 70 })
    ]);
    assert.deepEqual(results.map((result) => result.status), ['rejected', 'fulfilled']);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 70);
    assert.equal(saved.outstanding, 30);
    assert.equal(saved.status, 'partial');
    assert.equal(await Payment.countDocuments(), 1);
  });

  test('simultaneous payment and cancellation cannot leave a cancelled paid invoice', async () => {
    const invoice = await invoiceFor();
    const results = await Promise.all([
      call('POST', '/payments', { invoice: invoice.id, amount: 50 }),
      call('PATCH', `/invoices/${invoice.id}/status`, { status: 'cancelled' })
    ]);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(results.filter((result) => result.status < 300).length, 1);
    assert.ok((saved.status === 'cancelled' && saved.paidAmount === 0) || (saved.status === 'partial' && saved.paidAmount === 50));
  });

  test('zero-value invoices are settled immediately', async () => {
    const result = await call('POST', '/invoices', { customer: customer.id, items: [{ description: 'Free plan', unitPrice: 0 }] });
    assert.equal(result.status, 201);
    assert.equal(result.body.item.status, 'paid');
    assert.equal(result.body.item.outstanding, 0);
  });

  test('recurring billing keeps the captured product price and tax after catalog deletion', async () => {
    const product = await Product.create({ name: 'Original product', salesPrice: 100 });
    const subscription = await subscriptionFor({
      items: [{ product: product._id, description: product.name, unitPrice: 100, quantity: 1, taxRate: 18, taxAmount: 18, amount: 118 }]
    });
    await Product.deleteOne({ _id: product._id });
    await Tax.create({ name: 'New rate', rate: 28 });
    assert.equal((await generateDueInvoices()).created, 1);
    const invoice = await Invoice.findOne({ subscription: subscription._id });
    assert.equal(invoice.total, 118);
    assert.equal(invoice.items[0].taxRate, 18);
    assert.equal(String(invoice.items[0].product), product.id);
    assert.equal((await generateDueInvoices()).created, 0);
  });

  test('a billing retry preserves discount usage after a subscription update failure', async (context) => {
    await subscriptionFor();
    const discount = await Discount.create({ name: 'Ten percent', kind: 'percentage', value: 10, usageLimit: 10 });
    const update = context.mock.method(Subscription, 'updateOne', async () => { throw new Error('Subscription write failed'); });
    await assert.rejects(generateDueInvoices(), /Subscription write failed/);
    assert.equal(await Invoice.countDocuments(), 1);
    assert.equal((await Discount.findById(discount._id)).usageCount, 1);
    update.mock.restore();
    assert.equal((await generateDueInvoices()).created, 0);
    assert.equal((await Discount.findById(discount._id)).usageCount, 1);
    assert.equal(await Invoice.countDocuments(), 1);
  });

  test('parallel billing runs create one invoice and consume the discount once', async () => {
    await subscriptionFor();
    const discount = await Discount.create({ name: 'Ten percent', kind: 'percentage', value: 10, usageLimit: 10 });
    const results = await Promise.all([generateDueInvoices(), generateDueInvoices()]);
    assert.equal(results.reduce((total, result) => total + result.created, 0), 1);
    assert.equal(await Invoice.countDocuments(), 1);
    assert.equal((await Discount.findById(discount._id)).usageCount, 1);
  });

  test('unrelated duplicate-key errors cannot skip an unbilled period', async (context) => {
    const subscription = await subscriptionFor();
    context.mock.method(Invoice, 'create', async () => { throw Object.assign(new Error('Duplicate invoice number'), { code: 11000 }); });
    await assert.rejects(generateDueInvoices(), /Duplicate invoice number/);
    assert.equal((await Subscription.findById(subscription._id)).nextBillingDate.getTime(), subscription.nextBillingDate.getTime());
    assert.equal(await Invoice.countDocuments(), 0);
  });

  test('logout invalidates the old token and login issues a usable replacement', async () => {
    assert.equal((await call('POST', '/auth/logout', {}, customerToken)).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, customerToken)).status, 401);
    const login = await call('POST', '/auth/login', { email: customer.email, password }, null);
    assert.equal(login.status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, login.body.token)).status, 200);
  });

  test('password reset tokens are single-use, private and invalidate old sessions', async () => {
    const forgot = await call('POST', '/auth/forgot-password', { email: customer.email }, null);
    const token = forgot.body.developmentResetToken;
    assert.ok(token);
    const users = await call('GET', '/users?role=customer');
    for (const field of ['password', 'resetToken', 'resetExpires', 'tokenVersion']) assert.equal(field in users.body.items[0], false);
    const results = await Promise.all([
      call('POST', '/auth/reset-password', { token, password: 'ChangedPassword!42' }, null),
      call('POST', '/auth/reset-password', { token, password: 'ChangedPassword!42' }, null)
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
    assert.equal((await call('GET', '/auth/me', undefined, customerToken)).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: customer.email, password }, null)).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: customer.email, password: 'ChangedPassword!42' }, null)).status, 200);
  });

  test('customer access stays scoped to their own invoices', async () => {
    const other = await User.create({ name: 'Other Customer', email: 'other@example.test', password });
    const invoice = await invoiceFor();
    invoice.customer = other._id;
    await invoice.save();
    assert.equal((await call('GET', `/invoices/${invoice.id}`, undefined, customerToken)).status, 404);
    assert.equal((await call('POST', '/payments', { invoice: invoice.id, amount: 1 }, customerToken)).status, 403);
  });

  test('expired password reset tokens cannot change a password or delete the user', async () => {
    const forgot = await call('POST', '/auth/forgot-password', { email: customer.email }, null);
    await User.updateOne({ _id: customer._id }, { $set: { resetExpires: new Date(Date.now() - 1000) } });
    const reset = await call('POST', '/auth/reset-password', {
      token: forgot.body.developmentResetToken, password: 'ChangedPassword!42'
    }, null);
    assert.equal(reset.status, 400);
    assert.ok(await User.exists({ _id: customer._id }));
    assert.equal((await call('POST', '/auth/login', { email: customer.email, password }, null)).status, 200);
  });
});
