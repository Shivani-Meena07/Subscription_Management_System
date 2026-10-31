import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app, generateDueInvoices } from './server.js';
import { Discount, Invoice, Payment, Plan, Product, Quotation, Subscription, Tax, User } from './models.js';
import { recordPayment, syncPaymentHistory } from './payments.js';
import { flushAudit } from './audit.js';

describe('backend API with an isolated MongoDB database', { skip: !process.env.TEST_MONGODB_URI }, () => {
  const databaseName = `subsight_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  let baseUrl;
  let admin;
  let staff;
  let customer;
  let adminToken;
  let staffToken;
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
    await flushAudit();
    await Promise.all(Object.values(mongoose.models).map((Model) => Model.deleteMany({})));
    [admin, staff, customer] = await User.create([
      { name: 'Test Admin', email: 'admin@example.test', password, role: 'admin' },
      { name: 'Test Staff', email: 'staff@example.test', password, role: 'staff' },
      { name: 'Test Customer', email: 'customer@example.test', password, role: 'customer' }
    ]);
    adminToken = sign(admin);
    staffToken = sign(staff);
    customerToken = sign(customer);
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await flushAudit();
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

  test('customers can submit requests once and customer request history stays isolated', async () => {
    const subscription = await subscriptionFor();
    const request = await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken);
    assert.equal(request.status, 201);
    assert.match(request.body.message, /stays active until the request is approved/);
    assert.equal(request.body.request.status, 'pending');
    assert.ok(request.body.request.requestedAt);
    assert.equal((await Subscription.findById(subscription._id)).status, 'active');
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken)).status, 409);
    const adminList = await call('GET', '/subscriptions');
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.items[0].requests[0].status, 'pending');
    assert.equal(adminList.body.items[0].customer.email, customer.email);
    assert.equal(adminList.body.items[0].plan.name, 'Monthly plan');

    const other = await User.create({ name: 'Other Customer', email: 'other-requests@example.test', password });
    const otherToken = sign(other);
    const list = await call('GET', '/subscriptions', undefined, otherToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 0);
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'cancel-request' }, otherToken)).status, 404);
  });

  test('concurrent duplicate customer requests create only one pending request', async () => {
    const subscription = await subscriptionFor();
    const submit = () => call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken);
    const results = await Promise.all([submit(), submit()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await Subscription.countDocuments({ _id: subscription._id, 'requests.type': 'pause', 'requests.status': 'pending' }), 1);
  });

  test('admin and staff can approve requests once, while customers cannot review them', async () => {
    const subscription = await subscriptionFor();
    const submitted = await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken);
    const path = `/subscriptions/${subscription.id}/requests/${submitted.body.request._id}`;
    assert.equal((await call('PATCH', path, { status: 'approved' }, customerToken)).status, 403);
    const approved = await call('PATCH', path, { status: 'approved' }, staffToken);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.item.status, 'paused');
    assert.equal(approved.body.request.status, 'approved');
    assert.ok(approved.body.request.reviewedAt);
    assert.equal(approved.body.request.reviewedBy._id, staff.id);
    assert.equal(approved.body.request.reviewedBy.name, staff.name);
    assert.equal((await call('PATCH', path, { status: 'approved' }, adminToken)).status, 409);
  });

  test('rejecting a request retains its history without changing subscription status', async () => {
    const subscription = await subscriptionFor();
    const submitted = await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken);
    const path = `/subscriptions/${subscription.id}/requests/${submitted.body.request._id}`;
    const rejected = await call('PATCH', path, { status: 'rejected' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.item.status, 'active');
    assert.equal(rejected.body.request.status, 'rejected');
    assert.ok(rejected.body.request.reviewedAt);
    assert.equal((await Subscription.findById(subscription._id)).requests.length, 1);
    assert.equal((await call('PATCH', path, { status: 'approved' })).status, 409);
  });

  test('request review validates types, IDs and pending states', async () => {
    const subscription = await subscriptionFor();
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/requests/not-an-id`, { status: 'approved' })).status, 400);
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/requests/${new mongoose.Types.ObjectId()}`, { status: 'approved' })).status, 404);
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'unknown-request' }, customerToken)).status, 403);
    const submitted = await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken);
    const reviewPath = `/subscriptions/${subscription.id}/requests/${submitted.body.request._id}`;
    assert.equal((await call('PATCH', reviewPath, { status: 'pending' })).status, 400);
  });

  test('cancellation approval follows early-close and expiry rules', async () => {
    const subscription = await subscriptionFor({ expiryDate: new Date(Date.now() + 86400000) });
    await Plan.updateOne({ _id: subscription.plan }, { $set: { allowEarlyClose: false } });
    const submitted = await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'cancel-request' }, customerToken);
    assert.equal(submitted.status, 201);
    const path = `/subscriptions/${subscription.id}/requests/${submitted.body.request._id}`;
    assert.equal((await call('PATCH', path, { status: 'approved' })).status, 409);

    await Subscription.updateOne({ _id: subscription._id }, { $set: { expiryDate: new Date(Date.now() - 86400000) } });
    const approved = await call('PATCH', path, { status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.item.status, 'closed');
  });

  test('renewal requires an enabled plan and closed or expired subscription', async () => {
    const active = await subscriptionFor();
    assert.equal((await call('PATCH', `/subscriptions/${active.id}/action`, { action: 'renew-request' }, customerToken)).status, 400);

    await Subscription.updateOne({ _id: active._id }, { $set: { status: 'closed' } });
    await Plan.updateOne({ _id: active.plan }, { $set: { allowRenewal: false } });
    assert.equal((await call('PATCH', `/subscriptions/${active.id}/action`, { action: 'renew-request' }, customerToken)).status, 400);

    await Plan.updateOne({ _id: active.plan }, { $set: { allowRenewal: true } });
    const submitted = await call('PATCH', `/subscriptions/${active.id}/action`, { action: 'renew-request' }, customerToken);
    assert.equal(submitted.status, 201);
    const path = `/subscriptions/${active.id}/requests/${submitted.body.request._id}`;
    const before = Date.now();
    const approved = await call('PATCH', path, { status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.item.status, 'active');
    assert.ok(new Date(approved.body.item.nextBillingDate).getTime() >= before);
  });

  test('pause requests require pause-enabled plans and current active status', async () => {
    const subscription = await subscriptionFor();
    await Plan.updateOne({ _id: subscription.plan }, { $set: { allowPause: false } });
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken)).status, 400);
    await Plan.updateOne({ _id: subscription.plan }, { $set: { allowPause: true } });
    await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'paused' } });
    assert.equal((await call('PATCH', `/subscriptions/${subscription.id}/action`, { action: 'pause-request' }, customerToken)).status, 400);
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

  test('a failed payment history write retains a durable payment and can be recovered', async (context) => {
    const invoice = await invoiceFor();
    const create = context.mock.method(Payment, 'create', async () => { throw new Error('Payment write failed'); });
    const result = await recordPayment({ invoice: invoice.id, amount: 40, method: 'upi' });
    assert.equal(result.pending, true);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 40);
    assert.equal(saved.outstanding, 60);
    assert.equal(saved.status, 'partial');
    assert.equal(saved.paymentEntries.length, 1);
    create.mock.restore();
    assert.equal((await syncPaymentHistory()).synced, 1);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal((await Invoice.findById(invoice._id)).paidAmount, 40);
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

  test('a failed history write cannot undo a different successful concurrent payment', async (context) => {
    const invoice = await invoiceFor();
    const create = Payment.create.bind(Payment);
    let finishSuccessfulPayment;
    const successfulPayment = new Promise((resolve) => { finishSuccessfulPayment = resolve; });
    const mockedCreate = context.mock.method(Payment, 'create', async (data) => {
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
    assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
    const saved = await Invoice.findById(invoice._id);
    assert.equal(saved.paidAmount, 100);
    assert.equal(saved.outstanding, 0);
    assert.equal(saved.status, 'paid');
    assert.equal(await Payment.countDocuments(), 1);
    mockedCreate.mock.restore();
    assert.equal((await syncPaymentHistory()).synced, 1);
    assert.equal(await Payment.countDocuments(), 2);
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

  test('registration cannot choose an internal role and returns an authenticated customer session', async () => {
    const registration = await call('POST', '/auth/register', {
      name: 'New Customer', email: 'new@example.test', password: 'NewCustomer!42', role: 'admin'
    }, null);
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.role, 'customer');
    assert.equal((await call('GET', '/auth/me', undefined, registration.body.token)).status, 200);
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

  test('payment request keys make simultaneous retries safe and reject changed details', async () => {
    const invoice = await invoiceFor();
    const data = { invoice: invoice.id, amount: 40, requestKey: 'same-payment-request' };
    const results = await Promise.all([call('POST', '/payments', data), call('POST', '/payments', data)]);
    assert.deepEqual(results.map((result) => result.status), [201, 201]);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal((await Invoice.findById(invoice._id)).paidAmount, 40);
    assert.equal((await call('POST', '/payments', { ...data, amount: 50 })).status, 409);
    const other = await invoiceFor();
    assert.equal((await call('POST', '/payments', { ...data, invoice: other.id })).status, 409);
    assert.equal((await Invoice.findById(other._id)).paidAmount, 0);
  });

  test('a failed atomic invoice write cannot create a payment history record', async (context) => {
    const invoice = await invoiceFor();
    context.mock.method(Invoice, 'findOneAndUpdate', async () => { throw new Error('Invoice write failed'); });
    await assert.rejects(recordPayment({ invoice: invoice.id, amount: 40 }), /Invoice write failed/);
    assert.equal(await Payment.countDocuments(), 0);
    assert.equal((await Invoice.findById(invoice._id)).paidAmount, 0);
  });

  test('customer management creates login accounts that can subscribe and keeps financial history', async () => {
    const created = await call('POST', '/customers', {
      name: 'Managed Customer', email: 'managed@example.test', password, company: 'Example Ltd', role: 'admin'
    }, staffToken);
    assert.equal(created.status, 201);
    assert.equal(created.body.item.role, 'customer');
    assert.equal('password' in created.body.item, false);
    const login = await call('POST', '/auth/login', { email: 'managed@example.test', password }, null);
    assert.equal(login.status, 200);
    const plan = await planFor();
    assert.equal((await call('POST', '/portal/subscriptions', { plan: plan.id, quantity: 1 }, login.body.token)).status, 201);
    assert.equal((await call('PATCH', '/customers/' + created.body.item._id, { company: 'Updated Ltd', role: 'admin' })).status, 200);
    assert.equal((await User.findById(created.body.item._id)).role, 'customer');
    assert.equal((await call('DELETE', '/customers/' + created.body.item._id)).status, 200);
    assert.equal(await Subscription.countDocuments({ customer: created.body.item._id }), 1);
    assert.equal((await call('GET', '/auth/me', undefined, login.body.token)).status, 401);
    assert.equal((await call('GET', '/customers', undefined, customerToken)).status, 403);
  });

  test('catalog editing validates promotional rules and preserves internal usage counters', async () => {
    assert.equal((await call('POST', '/discounts', { name: 'Invalid promo', kind: 'percentage', value: 150 })).status, 400);
    const discount = await call('POST', '/discounts', { name: 'Welcome', kind: 'percentage', value: 10, usageCount: 999 });
    assert.equal(discount.status, 201);
    assert.equal(discount.body.item.usageCount, 0);
    assert.equal((await call('PATCH', '/discounts/' + discount.body.item._id, { value: 200 })).status, 400);
    assert.equal((await call('PATCH', '/discounts/' + discount.body.item._id, { value: 20 })).status, 200);
    assert.equal((await call('POST', '/plans', { name: 'Bad dates', price: 100, startDate: '2026-12-01', endDate: '2026-01-01' })).status, 400);
    assert.equal((await call('POST', '/products', { name: 'Forbidden', salesPrice: 10 }, staffToken)).status, 403);
  });

  test('reports and CSV exports use actual payments, date ranges and safe customer text', async () => {
    const invoice = await invoiceFor();
    await call('POST', '/payments', { invoice: invoice.id, amount: 40 });
    const report = await call('GET', '/reports/summary');
    assert.equal(report.status, 200);
    assert.equal(report.body.metrics.revenue, 40);
    assert.equal(report.body.metrics.invoiced, 100);
    assert.equal(report.body.metrics.outstanding, 60);
    assert.equal(report.body.topCustomers[0].name, customer.name);
    assert.equal((await call('GET', '/reports/summary?from=2026-02-31')).status, 400);
    assert.equal((await call('GET', '/reports/summary?from=2026-12-31&to=2026-01-01')).status, 400);
    assert.equal((await call('GET', '/reports/summary', undefined, customerToken)).status, 403);
    await User.updateOne({ _id: customer._id }, { $set: { name: '=SUM(1,2)' } });
    for (const kind of ['invoices', 'payments']) {
      const response = await fetch(baseUrl + '/api/reports/export?kind=' + kind, { headers: { Authorization: 'Bearer ' + adminToken } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/csv/);
      const csv = await response.text();
      assert.ok(csv.includes(invoice.number));
      assert.ok(csv.includes("'=SUM(1,2)"));
    }
  });

  test('audit history records actors without secrets and consistency checks find ledger mismatches', async () => {
    const product = await call('POST', '/products', { name: 'Audited product', salesPrice: 100 });
    assert.equal(product.status, 201);
    const events = await call('GET', '/audit/events');
    assert.equal(events.status, 200);
    assert.equal(events.body.items[0].actor.name, admin.name);
    assert.equal(events.body.items[0].action, 'POST /api/products');
    assert.equal(events.body.items[0].recordId, product.body.item._id);
    assert.equal(JSON.stringify(events.body).includes(password), false);
    const invoice = await invoiceFor();
    await call('POST', '/payments', { invoice: invoice.id, amount: 40 });
    assert.equal((await call('GET', '/audit/checks')).body.issueCount, 0);
    await Invoice.updateOne({ _id: invoice._id }, { $set: { paidAmount: 50, outstanding: 50 } });
    const checks = await call('GET', '/audit/checks');
    assert.equal(checks.body.issueCount, 1);
    assert.equal(checks.body.issues[0].recorded, 40);
    assert.equal((await call('GET', '/audit/events', undefined, customerToken)).status, 403);
  });

  test('quotation documents expose printable customer and line-item details', async () => {
    const quote = await call('POST', '/quotations', { customer: customer.id, items: [{ description: 'Consulting', unitPrice: 50, quantity: 2 }] });
    const detail = await call('GET', '/quotations/' + quote.body.item._id);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.item.total, 100);
    assert.equal(detail.body.item.customer.email, customer.email);
    assert.equal((await call('GET', '/quotations/' + quote.body.item._id, undefined, customerToken)).status, 403);
  });

  test('renewal advances an old expiry and resuming skips paused billing dates', async () => {
    const subscription = await subscriptionFor({ status: 'closed', expiryDate: new Date(Date.now() - 86400000) });
    const renewed = await call('PATCH', '/subscriptions/' + subscription.id + '/action', { action: 'renew' });
    assert.equal(renewed.status, 200);
    assert.ok(new Date(renewed.body.item.expiryDate) > new Date());
    await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'paused', nextBillingDate: new Date(Date.now() - 86400000) } });
    const before = new Date();
    const resumed = await call('PATCH', '/subscriptions/' + subscription.id + '/action', { action: 'resume' });
    assert.equal(resumed.status, 200);
    assert.ok(new Date(resumed.body.item.nextBillingDate) >= before);
  });

  test('one billing run catches up missed periods without generating duplicates', async () => {
    const overdue = new Date();
    overdue.setDate(overdue.getDate() - 3);
    overdue.setHours(0, 0, 0, 0);
    const subscription = await subscriptionFor({ frequency: 'daily', nextBillingDate: overdue });
    const result = await generateDueInvoices();
    assert.equal(result.created, 4);
    assert.equal(result.remaining, 0);
    assert.equal(await Invoice.countDocuments({ subscription: subscription._id }), 4);
    assert.equal((await generateDueInvoices()).created, 0);
  });

  test('API pagination stays stable when catalogue records have equal timestamps', async () => {
    const createdAt = new Date();
    await Product.insertMany(Array.from({ length: 120 }, (_, index) => ({ name: 'Page product ' + index, salesPrice: index, createdAt })));
    const first = await call('GET', '/products?page=1&limit=100');
    const second = await call('GET', '/products?page=2&limit=100');
    assert.equal(first.body.pages, 2);
    assert.equal(first.body.items.length, 100);
    assert.equal(second.body.items.length, 20);
    assert.equal(new Set([...first.body.items, ...second.body.items].map((item) => item._id)).size, 120);
  });

  test('JWT subjects are validated and permissions use database roles rather than token role claims', async () => {
    const invalid = jwt.sign({ sub: 'not-an-id' }, process.env.JWT_SECRET);
    assert.equal((await call('GET', '/auth/me', undefined, invalid)).status, 401);
    const customerClaimingAdmin = jwt.sign({ sub: customer.id, role: 'admin', ver: 0 }, process.env.JWT_SECRET);
    assert.equal((await call('GET', '/reports/summary', undefined, customerClaimingAdmin)).status, 403);
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
