import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { z } from 'zod';

import connectDB from './config/db.js';
import customerRoutes from './routes/customerRoutes.js';
import { authenticate, allow } from './middleware/auth.js';
import { Discount, Invoice, Payment, Plan, Product, Quotation, Subscription, Tax, User } from './models.js';
import { addPeriod, escapeSearch, makeNumber, pageResult, passwordValid, quantityFor, round } from './utils.js';
import { recordPayment } from './payments.js';
import { approvedRequestUpdate, customerRequestTypes, requestEligibility, requestResponseMessage } from './subscriptionRequests.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN?.split(',') ?? 'http://localhost:5173'
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const objectId = (value) => mongoose.isObjectIdOrHexString(value);

const passwordSchema = z.string().refine(passwordValid, 'Use more than 8 characters with uppercase, lowercase, and a special character.');

const tokenFor = (user) => jwt.sign({ sub: user.id, role: user.role, ver: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });

const userView = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

const scopeCustomer = (query, user) => user.role === 'customer' ? { ...query, customer: user.id } : query;

const fail = (res, status, message) => res.status(status).json({ message });

app.param('id', (req, res, next, value) => objectId(value) ? next() : fail(res, 400, 'Invalid record ID.'));
app.use('/api', (req, res, next) => {
  if (req.body === undefined) req.body = {};
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 400, 'Send a JSON object.');
  if (Object.values(req.query).some((value) => typeof value !== 'string')) return fail(res, 400, 'Query parameters must be plain values.');
  for (const field of ['customer', 'plan', 'product', 'invoice']) {
    if (req.body[field] !== undefined && !objectId(req.body[field])) return fail(res, 400, `Invalid ${field} ID.`);
  }
  next();
});


app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));



app.post('/api/auth/register', asyncRoute(async (req, res) => {

  const parsed = z.object({ name: z.string().trim().min(2), email: z.string().email(), password: passwordSchema }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const email = parsed.data.email.toLowerCase();

  if (await User.exists({ email })) return fail(res, 409, 'An account already uses this email.');

  const user = await User.create({ ...parsed.data, email, role: 'customer' });

  res.status(201).json({ token: tokenFor(user), user: userView(user) });

}));



app.post('/api/auth/login', asyncRoute(async (req, res) => {

  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, 'Enter a valid email and password.');

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select('+password +tokenVersion');

  if (!user || !user.active || !(await user.verifyPassword(parsed.data.password))) return fail(res, 401, 'Email or password is incorrect.');

  res.json({ token: tokenFor(user), user: userView(user) });

}));

app.post('/api/auth/logout', authenticate, asyncRoute(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ message: 'Signed out on all devices.' });
}));

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: userView(req.user) }));



app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {

  if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) return fail(res, 503, 'Password-reset email delivery is not configured.');

  const email = String(req.body.email || '').toLowerCase();

  const user = await User.findOne({ email });

  const response = { message: 'If that account exists, reset instructions are available.' };

  if (!user) return res.json(response);

  const rawToken = randomBytes(32).toString('hex');

  user.resetToken = createHash('sha256').update(rawToken).digest('hex');

  user.resetExpires = new Date(Date.now() + 30 * 60 * 1000);

  await user.save();

  if (process.env.NODE_ENV !== 'production') response.developmentResetToken = rawToken;

  else if (process.env.SMTP_HOST) {

    const nodemailer = await import('nodemailer');

    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });

    await transport.sendMail({ from: process.env.SMTP_FROM, to: email, subject: 'Reset your SubSight password', text: `Reset token (30 minutes): ${rawToken}` });

  }

  res.json(response);

}));

app.post('/api/auth/reset-password', asyncRoute(async (req, res) => {

  const parsed = z.object({ token: z.string().min(1), password: passwordSchema }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const hashed = createHash('sha256').update(parsed.data.token).digest('hex');

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(
    { resetToken: hashed, resetExpires: { $gt: new Date() } },
    { $set: { password: hashedPassword }, $unset: { resetToken: 1, resetExpires: 1 }, $inc: { tokenVersion: 1 } },
    { new: true, runValidators: true }
  );

  if (!user) return fail(res, 400, 'Reset token is invalid or expired.');

  res.json({ message: 'Password updated. You can now sign in.' });
}));



app.get('/api/users', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  const role = req.query.role ? { role: z.enum(['admin', 'staff', 'customer']).parse(req.query.role) } : {};

  const { page, limit } = pageResult(req.query);

  const [items, total] = await Promise.all([User.find(role).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(role)]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });

}));

app.post('/api/users/staff', authenticate, allow('admin'), asyncRoute(async (req, res) => {

  if (!passwordValid(req.body.password)) return fail(res, 400, 'Password must be over 8 characters and contain uppercase, lowercase and a special character.');

  const parsed = z.object({ name: z.string().trim().min(2), email: z.string().email(), password: z.string(), role: z.enum(['staff', 'admin']).default('staff') }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const user = await User.create({ ...parsed.data, email: parsed.data.email.toLowerCase() });

  res.status(201).json({ user: userView(user) });

}));

app.patch('/api/users/:id', authenticate, allow('admin'), asyncRoute(async (req, res) => {

  if (!objectId(req.params.id)) return fail(res, 400, 'Invalid user ID.');

  const user = await User.findByIdAndUpdate(req.params.id, { $set: { name: req.body.name, active: req.body.active } }, { new: true, runValidators: true }).select('-password');

  if (!user) return fail(res, 404, 'User not found.');

  res.json({ user });

}));

app.get('/api/profile', authenticate, (req, res) => res.json({ user: userView(req.user) }));

app.patch('/api/profile', authenticate, asyncRoute(async (req, res) => {

  const parsed = z.object({ name: z.string().trim().min(2) }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, 'Name must contain at least two characters.');

  req.user.name = parsed.data.name;

  await req.user.save();

  res.json({ user: userView(req.user) });

}));



function registerCatalog(path, Model, roles, searchable = 'name') {

  app.get(`/api/${path}`, authenticate, asyncRoute(async (req, res) => {

    const filter = req.user.role === 'customer' ? { active: true } : {};

    const searchText = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter[searchable] = { $regex: searchText, $options: 'i' };

    const { page, limit } = pageResult(req.query);

    const [items, total] = await Promise.all([Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Model.countDocuments(filter)]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });

  }));

  app.post(`/api/${path}`, authenticate, allow(...roles), asyncRoute(async (req, res) => res.status(201).json({ item: await Model.create(req.body) })));

  app.patch(`/api/${path}/:id`, authenticate, allow(...roles), asyncRoute(async (req, res) => {

    if (!objectId(req.params.id)) return fail(res, 400, 'Invalid record ID.');

    const item = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });

    if (!item) return fail(res, 404, 'Record not found.');

    res.json({ item });

  }));

}

registerCatalog('products', Product, ['admin']);

registerCatalog('plans', Plan, ['admin']);

registerCatalog('taxes', Tax, ['admin']);

registerCatalog('discounts', Discount, ['admin']);



async function buildItems(inputItems = [], preservePrices = false) {

  if (!Array.isArray(inputItems) || !inputItems.length) throw Object.assign(new Error('Add at least one product or plan item.'), { status: 400 });

  const tax = await Tax.findOne({ active: true }).sort({ rate: -1 });

  return Promise.all(inputItems.map(async (row) => {

    const product = row.product ? await Product.findById(row.product) : null;

    if (row.product && !product) throw Object.assign(new Error('A selected product was not found.'), { status: 400 });

    const variant = product?.variants.find((item) => item.name === row.variant);

    if (product && row.variant && !variant && !preservePrices) throw Object.assign(new Error('The selected product variant is unavailable.'), { status: 400 });

    const quantity = Math.max(1, Number(row.quantity) || 1);

    const unitPrice = product && !preservePrices ? product.salesPrice + (variant?.additionalPrice || 0) : Number(row.unitPrice ?? product?.salesPrice);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw Object.assign(new Error('Item price must be zero or more.'), { status: 400 });

    const rate = Number(row.taxRate ?? tax?.rate ?? 0);

    const subtotal = round(unitPrice * quantity);

    const discountAmount = round(Math.min(subtotal, Number(row.discountAmount) || 0));

    const taxAmount = round((subtotal - discountAmount) * rate / 100);

    return { product: product?._id, description: row.description || product?.name || 'Subscription plan', variant: row.variant, quantity, unitPrice, taxRate: rate, discountAmount, taxAmount, amount: round(subtotal - discountAmount + taxAmount) };

  }));

}

const totalsFor = (items) => ({

  subtotal: round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)),

  taxTotal: round(items.reduce((sum, item) => sum + item.taxAmount, 0)),

  discountTotal: round(items.reduce((sum, item) => sum + item.discountAmount, 0)),

  total: round(items.reduce((sum, item) => sum + item.amount, 0))

});



app.get('/api/quotations', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  const filter = {};

  if (req.query.status) filter.status = req.query.status;

  const { page, limit } = pageResult(req.query);

  const [items, total] = await Promise.all([Quotation.find(filter).populate('customer', 'name email').populate('plan', 'name frequency').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Quotation.countDocuments(filter)]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });

}));

app.post('/api/quotations', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  if (!await User.exists({ _id: req.body.customer, role: 'customer', active: true })) return fail(res, 400, 'Select an active customer.');

  const items = await buildItems(req.body.items);

  const totals = totalsFor(items);

  const quote = await Quotation.create({ ...totals, items, number: makeNumber('QUO'), customer: req.body.customer, plan: req.body.plan || undefined, validUntil: new Date(Date.now() + Math.max(1, Number(req.body.validityDays) || 30) * 86400000) });

  res.status(201).json({ item: quote });

}));

app.patch('/api/quotations/:id/status', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  if (!['sent', 'accepted', 'rejected'].includes(req.body.status)) return fail(res, 400, 'Invalid quotation status.');

  const quote = await Quotation.findById(req.params.id);

  if (!quote) return fail(res, 404, 'Quotation not found.');

  if (quote.validUntil < new Date() && req.body.status === 'accepted') return fail(res, 400, 'This quotation has expired.');

  quote.status = req.body.status;

  if (req.body.status === 'accepted' && !quote.subscription) {

    if (!quote.plan) return fail(res, 400, 'Choose a plan before converting this quotation.');

    const plan = await Plan.findById(quote.plan);

    if (!plan?.active) return fail(res, 400, 'The selected plan is unavailable.');

    const subscription = await Subscription.create({

      number: makeNumber('SUB'), customer: quote.customer, quotation: quote._id, plan: plan._id,

      items: quote.items, total: quote.total, frequency: plan.frequency, quantity: quote.items[0]?.quantity || plan.minimumQuantity,

      nextBillingDate: new Date(), status: 'active'

    });

    quote.subscription = subscription._id;

  }

  await quote.save();

  res.json({ item: quote });

}));



app.get('/api/subscriptions', authenticate, asyncRoute(async (req, res) => {

  const filter = scopeCustomer({}, req.user);

  if (req.query.status) filter.status = req.query.status;

  const { page, limit } = pageResult(req.query);
  const [items, total] = await Promise.all([Subscription.find(filter).populate('customer', 'name email').populate('plan', 'name frequency allowPause allowRenewal allowEarlyClose autoClose').populate('requests.reviewedBy', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Subscription.countDocuments(filter)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });

}));

app.post('/api/subscriptions', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  const plan = await Plan.findById(req.body.plan);

  if (!plan?.active) return fail(res, 400, 'Select an active plan.');

  if (!await User.exists({ _id: req.body.customer, role: 'customer', active: true })) return fail(res, 400, 'Select an active customer.');

  const now = new Date();

  if (plan.startDate && now < plan.startDate || plan.endDate && now > plan.endDate) return fail(res, 400, 'This plan is outside its availability dates.');

  const quantity = Math.max(1, Number(req.body.quantity) || 1);

  if (quantity < plan.minimumQuantity) return fail(res, 400, `The plan requires at least ${plan.minimumQuantity} seats.`);

  const items = await buildItems(req.body.items?.length ? req.body.items : [{ description: plan.name, unitPrice: plan.price, quantity }]);

  const totals = totalsFor(items);

  const subscription = await Subscription.create({

    number: makeNumber('SUB'), customer: req.body.customer, plan: plan._id, items, total: totals.total, quantity,

    frequency: plan.frequency, startDate: now, nextBillingDate: now, expiryDate: req.body.expiryDate || undefined, status: 'active'

  });

  res.status(201).json({ item: subscription });

}));

app.post('/api/portal/subscriptions', authenticate, allow('customer'), asyncRoute(async (req, res) => {

  const plan = await Plan.findById(req.body.plan);

  if (!plan?.active) return fail(res, 400, 'This plan is currently unavailable.');

  const now = new Date();

  if (plan.startDate && now < plan.startDate || plan.endDate && now > plan.endDate) return fail(res, 400, 'This plan is outside its availability dates.');

  const quantity = Math.max(1, Number(req.body.quantity) || 1);

  if (quantity < plan.minimumQuantity) return fail(res, 400, `This plan requires at least ${plan.minimumQuantity} seats.`);

  const items = await buildItems([{ description: plan.name, unitPrice: plan.price, quantity }]);

  const totals = totalsFor(items);

  const subscription = await Subscription.create({

    number: makeNumber('SUB'), customer: req.user.id, plan: plan._id, items, total: totals.total,

    quantity, frequency: plan.frequency, nextBillingDate: now, status: 'active'

  });

  res.status(201).json({ item: subscription, message: 'Your subscription is active.' });

}));



app.patch('/api/subscriptions/:id/action', authenticate, asyncRoute(async (req, res) => {

  const subscription = await Subscription.findOne(scopeCustomer({ _id: req.params.id }, req.user)).populate('plan');

  if (!subscription) return fail(res, 404, 'Subscription not found.');

  const action = req.body.action;

  const plan = subscription.plan;

  if (req.user.role === 'customer') {
    if (!customerRequestTypes.some((type) => `${type}-request` === action)) return fail(res, 403, 'Customers can submit requests only.');
    const type = action.replace('-request', '');
    const eligibilityError = requestEligibility(subscription, type);
    if (eligibilityError) return fail(res, 400, eligibilityError);
    const updated = await Subscription.findOneAndUpdate(
      {
        _id: subscription._id,
        customer: req.user._id,
        status: subscription.status,
        requests: { $not: { $elemMatch: { type, status: 'pending' } } }
      },
      { $push: { requests: { type } } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      const current = await Subscription.findOne({ _id: subscription._id, customer: req.user._id });
      if (!current) return fail(res, 404, 'Subscription not found.');
      if (current.requests.some((request) => request.type === type && request.status === 'pending')) {
        return fail(res, 409, `A ${type} request is already pending for this subscription.`);
      }
      return fail(res, 409, 'The subscription changed. Refresh and try again.');
    }
    const request = updated.requests[updated.requests.length - 1];
    return res.status(201).json({
      item: updated,
      request,
      message: requestResponseMessage(type)
    });
  } else if (action === 'pause' && plan?.allowPause && subscription.status === 'active') subscription.status = 'paused';
  else if (action === 'resume' && subscription.status === 'paused') subscription.status = 'active';
  else if (action === 'close' && (plan?.allowEarlyClose || (subscription.expiryDate && subscription.expiryDate <= new Date()))) subscription.status = 'closed';
  else if (action === 'activate' && ['draft', 'confirmed'].includes(subscription.status)) subscription.status = 'active';

  else if (action === 'renew' && plan?.allowRenewal && ['closed', 'expired'].includes(subscription.status)) {

    subscription.status = 'active';

    subscription.nextBillingDate = new Date();

  } else return fail(res, 400, 'That action is not available for this subscription or plan.');

  await subscription.save();

  res.json({ item: subscription, message: req.user.role === 'customer' ? 'Your request has been sent for review.' : 'Subscription updated.' });

}));

app.patch('/api/subscriptions/:id/requests/:requestId', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.requestId)) return fail(res, 400, 'Invalid request ID.');
  const parsed = z.object({ status: z.enum(['approved', 'rejected']) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Request status must be approved or rejected.');

  const subscription = await Subscription.findById(req.params.id).populate('plan');
  if (!subscription) return fail(res, 404, 'Subscription not found.');
  const request = subscription.requests.id(req.params.requestId);
  if (!request) return fail(res, 404, 'Customer request not found.');
  if (request.status !== 'pending') return fail(res, 409, 'This customer request has already been processed.');

  const update = {};
  if (parsed.data.status === 'approved') {
    const result = approvedRequestUpdate(subscription, request.type);
    if (result.error) return fail(res, 409, result.error);
    Object.assign(update, result.update);
  }
  const reviewedAt = new Date();
  const updated = await Subscription.findOneAndUpdate(
    {
      _id: subscription._id,
      ...(parsed.data.status === 'approved' ? { status: subscription.status } : {}),
      requests: { $elemMatch: { _id: request._id, type: request.type, status: 'pending' } }
    },
    {
      $set: {
        ...update,
        'requests.$.status': parsed.data.status,
        'requests.$.reviewedAt': reviewedAt,
        'requests.$.reviewedBy': req.user._id
      }
    },
    { new: true, runValidators: true }
  )
    .populate('customer', 'name email')
    .populate('plan', 'name frequency allowPause allowRenewal allowEarlyClose autoClose active startDate endDate')
    .populate('requests.reviewedBy', 'name');
  if (!updated) return fail(res, 409, 'This customer request was processed by another team member. Refresh the page.');
  const reviewedRequest = updated.requests.id(req.params.requestId);
  res.json({
    item: updated,
    request: reviewedRequest,
    message: `The ${request.type} request was ${parsed.data.status}.`
  });
}));



export async function generateDueInvoices() {

  const due = await Subscription.find({ status: 'active', nextBillingDate: { $lte: new Date() } }).populate('plan');

  let created = 0;

  for (const subscription of due) {

    const periodStart = new Date(subscription.nextBillingDate);

    const periodEnd = addPeriod(periodStart, subscription.frequency);

    if (subscription.expiryDate && periodStart > subscription.expiryDate && subscription.plan?.autoClose) {

      subscription.status = 'expired';

      await subscription.save();

      continue;

    }

    let items;

    try { items = await buildItems(subscription.items.map((item) => item.toObject()), true); }

    catch (error) { console.error('Skipping invalid subscription during billing:', subscription.id, error.message); continue; }

    let discount = (await Discount.find({ active: true }).sort({ value: -1 })).find((candidate) =>

      (!candidate.startsAt || candidate.startsAt <= new Date()) &&

      (!candidate.endsAt || candidate.endsAt >= new Date()) &&

      (!candidate.usageLimit || candidate.usageCount < candidate.usageLimit) &&

      subscription.quantity >= candidate.minimumQuantity &&

      totalsFor(items).subtotal >= candidate.minimumPurchase &&

      items.some((item) => !candidate.products.length || candidate.products.some((id) => String(id) === String(item.product)))

    );

    let discountClaimed = false;

    if (discount) {

      const claimFilter = { _id: discount._id, active: true };

      if (discount.usageLimit) claimFilter.usageCount = { $lt: discount.usageLimit };

      const claim = await Discount.updateOne(claimFilter, { $inc: { usageCount: 1 } });

      discountClaimed = claim.modifiedCount === 1;

      if (!discountClaimed) discount = null;

    }

    if (discount) {

      const eligible = items.filter((item) => !discount.products.length || discount.products.some((id) => String(id) === String(item.product)));

      const base = eligible.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      const remaining = discount.kind === 'percentage' ? base * discount.value / 100 : discount.value;

      for (const item of eligible) {

        const share = base ? remaining * (item.unitPrice * item.quantity) / base : 0;

        item.discountAmount = round(Math.min(item.unitPrice * item.quantity, share));

        item.taxAmount = round((item.unitPrice * item.quantity - item.discountAmount) * item.taxRate / 100);

        item.amount = round(item.unitPrice * item.quantity - item.discountAmount + item.taxAmount);

      }

    }

    const totals = totalsFor(items);

    try {
            await Invoice.create({

        number: makeNumber('INV'), customer: subscription.customer, subscription: subscription._id,

        billingPeriodStart: periodStart, billingPeriodEnd: periodEnd, billingKey: `${subscription.id}:${periodStart.toISOString()}`,

        items, ...totals, total: totals.total, outstanding: totals.total, dueDate: addPeriod(new Date(), 'monthly')

      });

      subscription.nextBillingDate = periodEnd;

      await subscription.save();

      created += 1;

    } catch (error) {

      if (discountClaimed) await Discount.updateOne({ _id: discount._id }, { $inc: { usageCount: -1 } });

      if (error.code !== 11000) throw error;

      subscription.nextBillingDate = periodEnd;

      await subscription.save();

    }

  }

  return { created, checked: due.length };

}

app.post('/api/invoices/generate-due', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => res.json(await generateDueInvoices())));

app.get('/api/invoices', authenticate, asyncRoute(async (req, res) => {

  const filter = scopeCustomer({}, req.user);

  if (req.query.status) filter.status = req.query.status;

  if (req.query.overdue === 'true') filter.dueDate = { $lt: new Date() }, filter.status = { $in: ['confirmed', 'partial'] };

  const { page, limit } = pageResult(req.query);

  const [items, total] = await Promise.all([Invoice.find(filter).populate('customer', 'name email').populate('subscription', 'number').sort({ invoiceDate: -1 }).skip((page - 1) * limit).limit(limit), Invoice.countDocuments(filter)]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });

}));

app.get('/api/invoices/:id', authenticate, asyncRoute(async (req, res) => {

  const invoice = await Invoice.findOne(scopeCustomer({ _id: req.params.id }, req.user)).populate('customer', 'name email').populate('subscription', 'number').populate('items.product', 'name');

  if (!invoice) return fail(res, 404, 'Invoice not found.');

  res.json({ item: invoice });

}));

app.patch('/api/invoices/:id/status', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  if (!['confirmed', 'cancelled'].includes(req.body.status)) return fail(res, 400, 'Invalid invoice status.');

  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) return fail(res, 404, 'Invoice not found.');

  if (req.body.status === 'cancelled' && invoice.paidAmount > 0) return fail(res, 400, 'An invoice with recorded payments cannot be cancelled.');

  invoice.status = req.body.status;

  await invoice.save();

  res.json({ item: invoice });

}));

app.post('/api/invoices', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  if (!await User.exists({ _id: req.body.customer, role: 'customer' })) return fail(res, 400, 'Select a customer.');

  const items = await buildItems(req.body.items);

  const totals = totalsFor(items);

  const invoice = await Invoice.create({ ...totals, items, number: makeNumber('INV'), customer: req.body.customer, dueDate: req.body.dueDate || addPeriod(new Date(), 'monthly'), outstanding: totals.total });

  res.status(201).json({ item: invoice });

}));



app.get('/api/payments', authenticate, asyncRoute(async (req, res) => {

  const filter = scopeCustomer({}, req.user);

  const { page, limit } = pageResult(req.query);

  const [items, total] = await Promise.all([Payment.find(filter).populate('customer', 'name email').populate('invoice', 'number total').sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit), Payment.countDocuments(filter)]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });

}));

app.post('/api/payments', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  const parsed = z.object({ invoice: z.string(), amount: z.coerce.number().positive(), method: z.enum(['cash', 'bank transfer', 'upi', 'card', 'other']).default('upi'), reference: z.string().optional(), notes: z.string().optional() }).safeParse(req.body);

  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const amount = round(parsed.data.amount);

  if (amount < 0.01) return fail(res, 400, 'Payment must be at least ₹0.01.');

  const invoice = await Invoice.findOneAndUpdate(

    { _id: parsed.data.invoice, status: { $in: ['confirmed', 'partial'] }, outstanding: { $gte: amount } },

    { $inc: { paidAmount: amount, outstanding: -amount } },

    { new: true }

  );

  if (!invoice) return fail(res, 400, 'Open invoice not found or payment exceeds the outstanding balance.');

  let payment;

  try {

    payment = await Payment.create({ ...parsed.data, amount, customer: invoice.customer });

    await Invoice.updateOne({ _id: invoice._id, outstanding: 0 }, { $set: { status: 'paid' } });

    await Invoice.updateOne({ _id: invoice._id, outstanding: { $gt: 0 } }, { $set: { status: 'partial' } });

  } catch (error) {

    await Invoice.updateOne({ _id: invoice._id }, { $inc: { paidAmount: -amount, outstanding: amount } });

    throw error;

  }

  invoice.status = invoice.outstanding === 0 ? 'paid' : 'partial';

  res.status(201).json({ item: payment, invoice });

}));



app.get('/api/dashboard/summary', authenticate, allow('admin', 'staff'), asyncRoute(async (req, res) => {

  const [activeSubscriptions, customers, payments, invoices, subscriptions, recentInvoices, recentPayments] = await Promise.all([

    Subscription.countDocuments({ status: 'active' }), User.countDocuments({ role: 'customer', active: true }),

    Payment.aggregate([{ $match: { status: 'successful' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),

    Invoice.aggregate([

      { $match: { status: { $in: ['confirmed', 'partial'] } } },

      { $group: {

        _id: null,

        outstanding: { $sum: '$outstanding' },

        overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, 1, 0] } }

      } }

    ]),

    Subscription.find({ status: { $in: ['active', 'paused'] } }).populate('plan', 'frequency'),

    Invoice.find().populate('customer', 'name').sort({ createdAt: -1 }).limit(5),

    Payment.find().populate('customer', 'name').populate('invoice', 'number').sort({ paidAt: -1 }).limit(5)

  ]);

  const mrr = round(subscriptions.reduce((sum, sub) => {

    if (sub.status !== 'active') return sum;

    const recurringBeforeTax = sub.items.reduce((amount, item) => amount + item.unitPrice * item.quantity - item.discountAmount, 0);

    const monthly = sub.frequency === 'yearly' ? recurringBeforeTax / 12 : sub.frequency === 'weekly' ? recurringBeforeTax * 52 / 12 : sub.frequency === 'daily' ? recurringBeforeTax * 365 / 12 : recurringBeforeTax;

    return sum + monthly;

  }, 0));

  const revenueByMonth = await Payment.aggregate([

    { $match: { status: 'successful', paidAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) } } },

    { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, revenue: { $sum: '$amount' } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }

  ]);

  const statusCounts = await Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

  res.json({

    metrics: { activeSubscriptions, customers, revenueReceived: round(payments[0]?.total || 0), outstanding: round(invoices[0]?.outstanding || 0), overdueInvoices: invoices[0]?.overdue || 0, mrr },

    revenueByMonth, statusCounts, recentInvoices, recentPayments

  });

}));



app.get('/api/portal/dashboard', authenticate, allow('customer'), asyncRoute(async (req, res) => {

  const [activeSubscriptions, upcoming, balances, invoices, payments] = await Promise.all([

    Subscription.countDocuments({ customer: req.user.id, status: 'active' }),

    Subscription.findOne({ customer: req.user.id, status: 'active' }).sort({ nextBillingDate: 1 }).select('nextBillingDate number'),

    Invoice.aggregate([{ $match: { customer: req.user._id, status: { $in: ['confirmed', 'partial'] } } }, { $group: { _id: null, total: { $sum: '$outstanding' } } }]),

    Invoice.find({ customer: req.user.id }).sort({ invoiceDate: -1 }).limit(5).select('number total outstanding status dueDate invoiceDate'),

    Payment.find({ customer: req.user.id }).sort({ paidAt: -1 }).limit(5).populate('invoice', 'number')

  ]);

  res.json({ metrics: { activeSubscriptions, upcomingBilling: upcoming?.nextBillingDate || null, outstanding: round(balances[0]?.total || 0) }, invoices, payments });

}));

app.use('/api/customers', customerRoutes);

app.use((req, res) => res.status(404).json({ message: 'API route not found.' }));

app.use((error, req, res, next) => {

  if (res.headersSent) return next(error);

  if (error.code === 11000) return res.status(409).json({ message: 'That record already exists.' });

  if (error instanceof mongoose.Error.ValidationError || error instanceof z.ZodError) return res.status(400).json({ message: error.message });

  const status = error.status || 500;

  if (status >= 500) console.error(error);

  res.status(status).json({ message: status >= 500 ? 'A server error occurred.' : error.message });

});



const PORT = Number(process.env.PORT || 4000);

export { app };

async function startServer() {
  try {
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
      throw new Error('PORT must be a valid TCP port between 1 and 65535.');
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with-')) {
      throw new Error('Set JWT_SECRET to a private random value of at least 32 characters in backend/.env.');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing from backend/.env.');
    }

    await connectDB();

    await new Promise((resolve, reject) => {
      const listeningServer = app.listen(PORT, '0.0.0.0', () => resolve(listeningServer));
      listeningServer.once('error', reject);
    });

    console.log(`SubSight API running on http://127.0.0.1:${PORT}`);

    cron.schedule('0 2 * * *', async () => {
      try {
        console.info('Scheduled billing run:', await generateDueInvoices());
      } catch (error) {
        console.error('Scheduled billing run failed:', error);
      }
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('MongoDB cleanup after startup failure failed:', disconnectError.message);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();