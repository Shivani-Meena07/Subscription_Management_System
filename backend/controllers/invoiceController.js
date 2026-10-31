
import mongoose from 'mongoose';
import { Invoice, User, Subscription } from '../models.js';

export const createInvoice = async (req, res) => {
  try {
    const {
      customer, subscription, items = [], dueDate, number,
      taxTotal = 0, discountTotal = 0
    } = req.body;

    if (!mongoose.isValidObjectId(customer)) {
      return res.status(400).json({ message: 'Valid customer ID is required.' });
    }

    const customerUser = await User.findOne({ _id: customer, role: 'customer', active: true });
    if (!customerUser) return res.status(404).json({ message: 'Customer not found.' });

    if (subscription) {
      const existingSubscription = await Subscription.findOne({
        _id: subscription,
        customer
      });
      if (!existingSubscription) {
        return res.status(404).json({ message: 'Subscription not found for this customer.' });
      }
    }

    const subtotal = items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Invalid invoice item.');
      }
      return sum + quantity * unitPrice;
    }, 0);

    const tax = Number(taxTotal);
    const discount = Number(discountTotal);

    if (!Number.isFinite(tax) || tax < 0 || !Number.isFinite(discount) || discount < 0 || discount > subtotal) {
      return res.status(400).json({ message: 'Invalid tax or discount amount.' });
    }

    const total = subtotal + tax - discount;

    const invoice = await Invoice.create({
      number,
      customer,
      subscription,
      items,
      subtotal,
      taxTotal: tax,
      discountTotal: discount,
      total,
      paidAmount: 0,
      outstanding: total,
      dueDate,
      status: 'confirmed'
    });

    res.status(201).json({ message: 'Invoice created.', invoice });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const filter = req.user.role === 'customer' ? { customer: req.user.id } : {};
    const invoices = await Invoice.find(filter)
      .populate('customer', 'name email')
      .populate('subscription')
      .sort({ createdAt: -1 });

    res.json({ invoices });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getInvoiceById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'customer') filter.customer = req.user.id;

    const invoice = await Invoice.findOne(filter)
      .populate('customer', 'name email')
      .populate('subscription');

    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    res.json({ invoice });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateInvoiceStatus = async (req, res) => {
  try {
    if (!['draft', 'confirmed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid invoice status.' });
    }

    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, paidAmount: 0 },
      { status: req.body.status },
      { new: true, runValidators: true }
    );

    if (!invoice) return res.status(404).json({ message: 'Editable invoice not found.' });
    res.json({ message: 'Invoice status updated.', invoice });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
