
import mongoose from 'mongoose';
import { Quotation, User, Plan, Product } from '../models.js';

const calculateItems = (items = []) => {
  return items.map(item => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = Number(item.unitPrice);
    const taxRate = Number(item.taxRate || 0);
    const discountAmount = Number(item.discountAmount || 0);

    if (
      !Number.isFinite(quantity) || quantity < 1 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 ||
      !Number.isFinite(taxRate) || taxRate < 0 ||
      !Number.isFinite(discountAmount) || discountAmount < 0
    ) {
      throw new Error('Invalid quotation item values.');
    }

    const base = quantity * unitPrice;
    if (discountAmount > base) throw new Error('Discount cannot exceed item value.');

    const taxAmount = (base - discountAmount) * taxRate / 100;

    return {
      ...item,
      quantity,
      unitPrice,
      taxRate,
      discountAmount,
      taxAmount,
      amount: base - discountAmount + taxAmount
    };
  });
};

export const createQuotation = async (req, res) => {
  try {
    const { customer, plan, items = [], validUntil, number } = req.body;

    if (!mongoose.isValidObjectId(customer)) {
      return res.status(400).json({ message: 'Valid customer ID is required.' });
    }

    const customerUser = await User.findOne({ _id: customer, role: 'customer', active: true });
    if (!customerUser) return res.status(404).json({ message: 'Customer not found.' });

    if (plan && !await Plan.findOne({ _id: plan, active: true })) {
      return res.status(404).json({ message: 'Plan not found or inactive.' });
    }

    const calculatedItems = calculateItems(items);

    for (const item of calculatedItems) {
      if (item.product && !await Product.findOne({ _id: item.product, active: true })) {
        return res.status(400).json({ message: 'Invalid or inactive product in quotation.' });
      }
    }

    const subtotal = calculatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountTotal = calculatedItems.reduce((sum, item) => sum + item.discountAmount, 0);
    const taxTotal = calculatedItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const total = subtotal - discountTotal + taxTotal;

    const quotation = await Quotation.create({
      number,
      customer,
      plan,
      items: calculatedItems,
      subtotal,
      discountTotal,
      taxTotal,
      total,
      validUntil,
      status: 'sent'
    });

    res.status(201).json({ message: 'Quotation created.', quotation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getQuotations = async (req, res) => {
  try {
    const filter = req.user.role === 'customer' ? { customer: req.user.id } : {};
    const quotations = await Quotation.find(filter)
      .populate('customer', 'name email')
      .populate('plan')
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.json({ quotations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getQuotationById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'customer') filter.customer = req.user.id;

    const quotation = await Quotation.findOne(filter)
      .populate('customer', 'name email')
      .populate('plan')
      .populate('items.product');

    if (!quotation) return res.status(404).json({ message: 'Quotation not found.' });
    res.json({ quotation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateQuotationStatus = async (req, res) => {
  try {
    const allowed = ['accepted', 'rejected'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid quotation status.' });
    }

    const filter = { _id: req.params.id, status: 'sent' };
    if (req.user.role === 'customer') filter.customer = req.user.id;

    const quotation = await Quotation.findOneAndUpdate(
      filter,
      { status: req.body.status },
      { new: true, runValidators: true }
    );

    if (!quotation) return res.status(404).json({ message: 'Pending quotation not found.' });
    res.json({ message: 'Quotation status updated.', quotation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOneAndDelete({
      _id: req.params.id,
      status: 'draft'
    });

    if (!quotation) return res.status(404).json({ message: 'Draft quotation not found.' });
    res.json({ message: 'Quotation deleted.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
