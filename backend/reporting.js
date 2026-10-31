import express from 'express';
import { z } from 'zod';
import { AuditEvent, Invoice, Payment, Subscription, User } from './models.js';
import { authenticate, allow } from './middleware/auth.js';
import { escapeSearch, pageResult, round } from './utils.js';
import { flushAudit } from './audit.js';
import { syncPaymentHistory } from './payments.js';

export function reportRange(query) {
  const range = {};
  for (const key of ['from', 'to']) {
    if (!query[key]) continue;
    const value = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.').parse(query[key]);
    const date = new Date(value + 'T00:00:00.000+05:30');
    if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 19800000).toISOString().slice(0, 10) !== value) throw Object.assign(new Error('Choose a valid report date.'), { status: 400 });
    range[key === 'from' ? '$gte' : '$lt'] = key === 'to' ? new Date(date.getTime() + 86400000) : date;
  }
  if (range.$gte && range.$lt && range.$gte >= range.$lt) throw Object.assign(new Error('The start date must be before the end date.'), { status: 400 });
  return range;
}

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

const router = express.Router();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(authenticate, allow('admin', 'staff'));

router.get('/reports/summary', route(async (req, res) => {
  await syncPaymentHistory();
  const range = reportRange(req.query);
  const paymentFilter = { status: 'successful', ...(Object.keys(range).length ? { paidAt: range } : {}) };
  const invoiceFilter = Object.keys(range).length ? { invoiceDate: range } : {};
  const [payments, invoices, balances, activeSubscriptions, revenueByMonth, topCustomers, statuses] = await Promise.all([
    Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { ...invoiceFilter, status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { status: { $in: ['confirmed', 'partial'] } } }, { $group: { _id: null, total: { $sum: '$outstanding' }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, '$outstanding', 0] } } } }]),
    Subscription.countDocuments({ status: 'active' }),
    Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: '$customer', revenue: { $sum: '$amount' }, payments: { $sum: 1 } } }, { $sort: { revenue: -1 } }, { $limit: 10 }, { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'customer' } }, { $set: { customer: { $arrayElemAt: ['$customer', 0] } } }, { $project: { revenue: 1, payments: 1, name: '$customer.name', email: '$customer.email' } }]),
    Invoice.aggregate([{ $match: invoiceFilter }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }, { $sort: { _id: 1 } }])
  ]);
  res.json({
    metrics: {
      revenue: round(payments[0]?.total || 0), paymentCount: payments[0]?.count || 0,
      invoiced: round(invoices[0]?.total || 0), invoiceCount: invoices[0]?.count || 0,
      outstanding: round(balances[0]?.total || 0), overdue: round(balances[0]?.overdue || 0), activeSubscriptions
    }, revenueByMonth, topCustomers, statuses
  });
}));

router.get('/reports/export', route(async (req, res) => {
  await syncPaymentHistory();
  const kind = z.enum(['invoices', 'payments']).parse(req.query.kind);
  const range = reportRange(req.query);
  const filter = Object.keys(range).length ? { [kind === 'invoices' ? 'invoiceDate' : 'paidAt']: range } : {};
  const Model = kind === 'invoices' ? Invoice : Payment;
  if (await Model.countDocuments(filter) > 50000) return res.status(400).json({ message: 'Choose a smaller date range to export at most 50,000 records.' });
  const query = Model.find(filter).populate('customer', 'name email').sort({ _id: 1 });
  if (kind === 'payments') query.populate('invoice', 'number');
  const items = await query;
  const headers = kind === 'invoices'
    ? ['Invoice', 'Customer', 'Email', 'Issued', 'Due', 'Total INR', 'Paid INR', 'Outstanding INR', 'Status']
    : ['Invoice', 'Customer', 'Email', 'Paid at', 'Amount INR', 'Method', 'Reference', 'Status'];
  const rows = items.map((item) => kind === 'invoices'
    ? [item.number, item.customer?.name, item.customer?.email, item.invoiceDate?.toISOString(), item.dueDate?.toISOString(), item.total.toFixed(2), item.paidAmount.toFixed(2), item.outstanding.toFixed(2), item.status]
    : [item.invoice?.number, item.customer?.name, item.customer?.email, item.paidAt?.toISOString(), item.amount.toFixed(2), item.method, item.reference, item.status]);
  res.type('text/csv').attachment('subsight-' + kind + '.csv').send('\ufeff' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
}));

router.get('/audit/events', route(async (req, res) => {
  await flushAudit();
  const filter = req.query.search ? { action: { $regex: escapeSearch(req.query.search), $options: 'i' } } : {};
  const { page, limit } = pageResult(req.query);
  const [items, total] = await Promise.all([
    AuditEvent.find(filter).populate('actor', 'name role').sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    AuditEvent.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/audit/checks', route(async (req, res) => {
  const results = await Invoice.aggregate([
    { $lookup: { from: Payment.collection.name, let: { invoiceId: '$_id' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$invoice', '$$invoiceId'] }, { $eq: ['$status', 'successful'] }] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ], as: 'payments' } },
    { $set: { recorded: { $round: [{ $ifNull: [{ $arrayElemAt: ['$payments.total', 0] }, 0] }, 2] } } },
    { $match: { $expr: { $or: [
      { $gt: [{ $abs: { $subtract: ['$recorded', '$paidAmount'] } }, 0.009] },
      { $gt: [{ $abs: { $subtract: [{ $subtract: ['$total', '$paidAmount'] }, '$outstanding'] } }, 0.009] },
      { $and: [{ $eq: ['$status', 'paid'] }, { $gt: ['$outstanding', 0] }] },
      { $and: [{ $eq: ['$status', 'cancelled'] }, { $gt: ['$paidAmount', 0] }] }
    ] } } },
    { $facet: { count: [{ $count: 'total' }], items: [{ $limit: 100 }, { $project: { number: 1, paidAmount: 1, recorded: 1, outstanding: 1, total: 1, status: 1 } }] } }
  ]);
  const pendingPayments = await Invoice.countDocuments({ paymentEntries: { $elemMatch: { synced: false } } });
  res.json({ checkedAt: new Date(), checkedInvoices: await Invoice.countDocuments(), issues: results[0]?.items || [], issueCount: results[0]?.count[0]?.total || 0, pendingPayments });
}));

router.post('/audit/reconcile', route(async (req, res) => res.json({ ...await syncPaymentHistory(), message: 'Saved payment entries synchronized with payment history.' })));

export default router;
