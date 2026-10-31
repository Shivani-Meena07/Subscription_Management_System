import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Invoice, Payment } from './models.js';
import { round } from './utils.js';

function paymentRecord(invoice, entry) {
  return {
    _id: entry._id, customer: invoice.customer, invoice: invoice._id, amount: entry.amount,
    method: entry.method, reference: entry.reference, notes: entry.notes, paidAt: entry.paidAt, status: 'successful'
  };
}

async function syncEntry(invoice, entry) {
  const record = paymentRecord(invoice, entry);
  let payment;
  try {
    payment = await Payment.create(record);
  } catch (error) {
    if (error.code !== 11000) throw error;
    payment = await Payment.findById(entry._id);
    if (!payment || String(payment.invoice) !== invoice.id || payment.amount !== entry.amount) throw error;
  }
  await Invoice.updateOne(
    { _id: invoice._id, 'paymentEntries._id': entry._id },
    { $set: { 'paymentEntries.$.synced': true } }
  );
  return payment;
}

export async function syncPaymentHistory() {
  const invoices = await Invoice.find({ paymentEntries: { $elemMatch: { synced: false } } }).limit(500);
  let synced = 0;
  let pending = 0;
  for (const invoice of invoices) {
    for (const entry of invoice.paymentEntries.filter((payment) => !payment.synced)) {
      try {
        await syncEntry(invoice, entry);
        synced += 1;
      } catch {
        pending += 1;
      }
    }
  }
  return { synced, pending };
}

export async function recordPayment(data) {
  const amount = round(data.amount);
  if (!Number.isFinite(amount) || amount < 0.01) throw Object.assign(new Error('Enter a positive payment amount.'), { status: 400 });
  const method = data.method || 'upi';
  const requestKey = data.requestKey || randomUUID();
  if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 120) throw Object.assign(new Error('Invalid payment request key.'), { status: 400 });
  const entry = {
    _id: new mongoose.Types.ObjectId(), requestKey, amount, method,
    reference: data.reference || '', notes: data.notes || '', paidAt: new Date(), synced: false
  };
  let invoice;
  try {
    invoice = await Invoice.findOneAndUpdate(
      { _id: data.invoice, status: { $in: ['confirmed', 'partial'] }, outstanding: { $gte: amount }, 'paymentEntries.requestKey': { $ne: requestKey } },
      [
        { $set: {
          paidAmount: { $round: [{ $add: ['$paidAmount', amount] }, 2] },
          paymentEntries: { $concatArrays: [{ $ifNull: ['$paymentEntries', []] }, { $literal: [entry] }] }
        } },
        { $set: { outstanding: { $round: [{ $subtract: ['$total', '$paidAmount'] }, 2] } } },
        { $set: { status: { $cond: [{ $eq: ['$outstanding', 0] }, 'paid', 'partial'] } } }
      ],
      { new: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const replayed = !invoice;
  if (!invoice) invoice = await Invoice.findOne({ 'paymentEntries.requestKey': requestKey });
  if (!invoice) throw Object.assign(new Error('Open invoice not found or payment exceeds the outstanding balance.'), { status: 400 });
  const savedEntry = invoice.paymentEntries.find((payment) => payment.requestKey === requestKey);
  if (invoice.id !== String(data.invoice) || savedEntry.amount !== amount || savedEntry.method !== method ||
      (savedEntry.reference || '') !== (data.reference || '') || (savedEntry.notes || '') !== (data.notes || '')) {
    throw Object.assign(new Error('This payment request key was already used with different details.'), { status: 409 });
  }
  let payment;
  let pending = false;
  try {
    payment = await syncEntry(invoice, savedEntry);
  } catch {
    pending = true;
    payment = new Payment(paymentRecord(invoice, savedEntry)).toObject();
  }
  return {
    item: payment, invoice: await Invoice.findById(invoice._id), replayed, pending,
    message: pending ? 'Payment recorded securely. Payment history will synchronize automatically.' : replayed ? 'This payment was already recorded.' : 'Payment recorded and invoice balance updated.'
  };
}
