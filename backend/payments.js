import { Invoice, Payment } from './models.js';

function balanceUpdate(amount) {
  return [
    { $set: { paidAmount: { $round: [{ $add: ['$paidAmount', amount] }, 2] } } },
    { $set: { outstanding: { $round: [{ $subtract: ['$total', '$paidAmount'] }, 2] } } },
    { $set: { status: { $cond: [{ $eq: ['$outstanding', 0] }, 'paid', { $cond: [{ $eq: ['$paidAmount', 0] }, 'confirmed', 'partial'] }] } } }
  ];
}

export async function recordPayment(data) {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: data.invoice, status: { $in: ['confirmed', 'partial'] }, outstanding: { $gte: data.amount } },
    balanceUpdate(data.amount),
    { new: true }
  );
  if (!invoice) throw Object.assign(new Error('Open invoice not found or payment exceeds the outstanding balance.'), { status: 400 });
  let payment;
  try {
    payment = await Payment.create({ ...data, customer: invoice.customer });
  } catch (error) {
    await Invoice.updateOne({ _id: invoice._id }, balanceUpdate(-data.amount));
    throw error;
  }
  return { item: payment, invoice: await Invoice.findById(invoice._id) };
}
