import express from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Generate Invoice Number
const generateInvoiceNumber = () => {
  return 'INV-' + Date.now();
};

// Create Invoice
router.post('/', authenticate, async (req, res) => {
  try {
    const { customerId, subscriptionId, items, tax, dueDate } = req.body;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Valid customer ID is required' });
    }

    if (!items || !items.length || !dueDate) {
      return res.status(400).json({ message: 'Items and due date are required' });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.price * (item.quantity || 1), 0
    );

    const invoiceTax = tax || 0;
    const totalAmount = subtotal + invoiceTax;

    const invoice = await Invoice.create({
      invoiceNumber: generateInvoiceNumber(),
      userId: req.user.id,
      customerId,
      subscriptionId,
      items,
      subtotal,
      tax: invoiceTax,
      totalAmount,
      dueDate
    });

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Invoices
router.get('/', authenticate, async (req, res) => {
  try {
    const invoices = await Invoice.find({ userId: req.user.id })
      .populate('customerId', 'name email company')
      .sort({ createdAt: -1 });

    res.json({ invoices });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Invoice By ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('customerId', 'name email company');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({ invoice });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Invoice
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({
        message: 'Only draft invoices can be edited'
      });
    }

    const { items, tax, dueDate } = req.body;

    if (items) {
      if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ message: 'At least one item is required' });
      }

      invoice.items = items;
      invoice.subtotal = items.reduce(
        (sum, item) => sum + item.price * (item.quantity || 1), 0
      );
    }

    if (tax !== undefined) invoice.tax = tax;
    if (dueDate) invoice.dueDate = dueDate;

    invoice.totalAmount = invoice.subtotal + invoice.tax;

    await invoice.save();

    res.json({
      message: 'Invoice updated successfully',
      invoice
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Invoice Status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid invoice status' });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    invoice.status = status;
    await invoice.save();

    res.json({
      message: 'Invoice status updated successfully',
      invoice
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Draft Invoice
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({
        message: 'Only draft invoices can be deleted'
      });
    }

    await invoice.deleteOne();

    res.json({ message: 'Invoice deleted successfully' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;