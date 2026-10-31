
import mongoose from 'mongoose';
import { Payment, Invoice } from '../models.js';

export const createPayment = async (req, res) => {
  try {
    const { invoice, amount, method, reference, notes } = req.body;

    if (!mongoose.isValidObjectId(invoice)) {
      return res.status(400).json({ message: 'Valid invoice ID is required.' });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    const invoiceRecord = await Invoice.findById(invoice);

    if (!invoiceRecord) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    if (invoiceRecord.status === 'cancelled' || invoiceRecord.status === 'draft') {
      return res.status(400).json({ message: 'This invoice cannot receive payments.' });
    }

    if (paymentAmount > invoiceRecord.outstanding) {
      return res.status(400).json({ message: 'Payment exceeds outstanding amount.' });
    }

    const payment = await Payment.create({
      customer: invoiceRecord.customer,
      invoice,
      amount: paymentAmount,
      method,
      reference,
      notes,
      status: 'successful'
    });

    invoiceRecord.paidAmount += paymentAmount;
    invoiceRecord.outstanding = Math.max(0, invoiceRecord.total - invoiceRecord.paidAmount);
    invoiceRecord.status = invoiceRecord.outstanding === 0 ? 'paid' : 'partial';

    await invoiceRecord.save();

    res.status(201).json({
      message: 'Payment recorded.',
      payment,
      invoice: invoiceRecord
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getPayments = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === 'customer') {
      filter.customer = req.user.id;
    }

    const payments = await Payment.find(filter)
      .populate('customer', 'name email')
      .populate('invoice')
      .sort({ createdAt: -1 });

    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };

    if (req.user.role === 'customer') {
      filter.customer = req.user.id;
    }

    const payment = await Payment.findOne(filter)
      .populate('customer', 'name email')
      .populate('invoice');

    if (!payment) return res.status(404).json({ message: 'Payment not found.' });

    res.json({ payment });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
