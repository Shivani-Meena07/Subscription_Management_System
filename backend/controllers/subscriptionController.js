
import mongoose from 'mongoose';
import { Subscription, User, Plan, Product, Quotation } from '../models.js';

const getNextBillingDate = (date, frequency) => {
  const next = new Date(date);

  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);

  return next;
};

export const createSubscription = async (req, res) => {
  try {
    const { customer, plan, quotation, quantity = 1, startDate } = req.body;

    if (!mongoose.isValidObjectId(customer) || !mongoose.isValidObjectId(plan)) {
      return res.status(400).json({ message: 'Valid customer and plan IDs are required.' });
    }

    const customerUser = await User.findOne({ _id: customer, role: 'customer', active: true });
    const selectedPlan = await Plan.findOne({ _id: plan, active: true }).populate('products');

    if (!customerUser) return res.status(404).json({ message: 'Customer not found.' });
    if (!selectedPlan) return res.status(404).json({ message: 'Plan not found or inactive.' });

    if (!Number.isInteger(Number(quantity)) || Number(quantity) < selectedPlan.minimumQuantity) {
      return res.status(400).json({ message: 'Quantity is below the plan minimum.' });
    }

    let selectedQuotation = null;

    if (quotation) {
      selectedQuotation = await Quotation.findOne({
        _id: quotation,
        customer,
        status: 'accepted'
      });

      if (!selectedQuotation) {
        return res.status(400).json({ message: 'An accepted quotation for this customer is required.' });
      }
    }

    const items = selectedQuotation?.items?.length
      ? selectedQuotation.items
      : selectedPlan.products.map(product => ({
          product: product._id,
          description: product.name,
          quantity: Number(quantity),
          unitPrice: product.salesPrice,
          taxRate: 0,
          discountAmount: 0,
          taxAmount: 0,
          amount: product.salesPrice * Number(quantity)
        }));

    const total = selectedQuotation
      ? selectedQuotation.total
      : selectedPlan.price * Number(quantity);

    const start = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Invalid start date.' });
    }

    const subscription = await Subscription.create({
      customer,
      plan,
      quotation: selectedQuotation?._id,
      items,
      quantity: Number(quantity),
      total,
      frequency: selectedPlan.frequency,
      startDate: start,
      nextBillingDate: getNextBillingDate(start, selectedPlan.frequency),
      status: 'active'
    });

    res.status(201).json({ message: 'Subscription created.', subscription });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getSubscriptions = async (req, res) => {
  try {
    const filter = req.user.role === 'customer' ? { customer: req.user.id } : {};
    const subscriptions = await Subscription.find(filter)
      .populate('customer', 'name email')
      .populate('plan')
      .populate('quotation')
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.json({ subscriptions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSubscriptionById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'customer') filter.customer = req.user.id;

    const subscription = await Subscription.findOne(filter)
      .populate('customer', 'name email')
      .populate('plan')
      .populate('quotation')
      .populate('items.product');

    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    res.json({ subscription });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateSubscriptionStatus = async (req, res) => {
  try {
    const allowed = ['paused', 'active', 'closed'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid subscription status.' });
    }

    const filter = { _id: req.params.id };
    if (req.user.role === 'customer') filter.customer = req.user.id;

    const subscription = await Subscription.findOneAndUpdate(
      filter,
      { status: req.body.status },
      { new: true, runValidators: true }
    );

    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    res.json({ message: 'Subscription status updated.', subscription });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
