import express from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Create Payment Record
router.post('/', authenticate, async (req, res) => {
  try {
    const { invoiceId, amount, paymentMethod } = req.body;

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }

    if (!amount || amount <= 0 || !paymentMethod) {
      return res.status(400).json({
        message: 'Valid amount and payment method are required'
      });
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      userId: req.user.id
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (['paid', 'cancelled'].includes(invoice.status)) {
      return res.status(400).json({
        message: 'Payment cannot be recorded for this invoice'
      });
    }

    const completedPayments = await Payment.aggregate([
      {
        $match: {
          invoiceId: invoice._id,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const paidAmount = completedPayments[0]?.total || 0;
    const remainingAmount = invoice.totalAmount - paidAmount;

    if (amount > remainingAmount) {
      return res.status(400).json({
        message: 'Payment exceeds the remaining invoice amount'
      });
    }

    const payment = await Payment.create({
      userId: req.user.id,
      invoiceId,
      customerId: invoice.customerId,
      amount,
      paymentMethod
    });

    res.status(201).json({
      message: 'Payment record created successfully',
      payment
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Payments
router.get('/', authenticate, async (req, res) => {
  try {
    const payments = await Payment.find({
      userId: req.user.id
    })
      .populate('invoiceId', 'invoiceNumber totalAmount')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 });

    res.json({ payments });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Payment By ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid payment ID' });
    }

    const payment = await Payment.findOne({
      _id: req.params.id,
      userId: req.user.id
    })
      .populate('invoiceId')
      .populate('customerId', 'name email');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({ payment });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Payment Status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status, transactionId, failureReason } = req.body;

    const allowedStatuses = ['completed', 'failed', 'refunded'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const payment = await Payment.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({
        message: 'Only pending payments can be updated'
      });
    }

    payment.status = status;
    payment.transactionId = transactionId;
    payment.failureReason = failureReason || '';

    if (status === 'completed') {
      payment.paymentDate = new Date();
    }

    await payment.save();

    const invoice = await Invoice.findById(payment.invoiceId);

    if (invoice) {
      const completedPayments = await Payment.aggregate([
        {
          $match: {
            invoiceId: invoice._id,
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      const paidAmount = completedPayments[0]?.total || 0;

      invoice.status =
        paidAmount >= invoice.totalAmount ? 'paid' : 'pending';

      await invoice.save();
    }

    res.json({
      message: 'Payment status updated successfully',
      payment
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;