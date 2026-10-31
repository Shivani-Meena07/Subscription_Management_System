import express from 'express';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Plan from '../models/Plan.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Calculate Next Billing Date
const calculateNextBillingDate = (date, cycle) => {
  const nextDate = new Date(date);

  if (cycle === 'monthly') {
    const day = nextDate.getDate();
    nextDate.setDate(1);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const lastDay = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0
    ).getDate();
    nextDate.setDate(Math.min(day, lastDay));
  } else if (cycle === 'quarterly') {
    const day = nextDate.getDate();
    nextDate.setDate(1);
    nextDate.setMonth(nextDate.getMonth() + 3);
    const lastDay = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0
    ).getDate();
    nextDate.setDate(Math.min(day, lastDay));
  } else if (cycle === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  }

  return nextDate;
};

// Create Subscription
router.post('/', authenticate, async (req, res) => {
  try {
    const { customerId, productId, planId, startDate, autoRenew } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(customerId) ||
      !mongoose.Types.ObjectId.isValid(productId) ||
      !mongoose.Types.ObjectId.isValid(planId)
    ) {
      return res.status(400).json({
        message: 'Valid customer, product and plan IDs are required'
      });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      userId: req.user.id
    });

    const product = await Product.findOne({
      _id: productId,
      userId: req.user.id,
      isActive: true
    });

    const plan = await Plan.findOne({
      _id: planId,
      userId: req.user.id,
      isActive: true
    });

    if (!customer || !product || !plan) {
      return res.status(404).json({
        message: 'Customer, product or active plan not found'
      });
    }

    const start = startDate ? new Date(startDate) : new Date();

    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Invalid start date' });
    }

    const trialDays = plan.trialDays || 0;
    const trialEndDate = trialDays > 0
      ? new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    const subscription = await Subscription.create({
      userId: req.user.id,
      customerId,
      productId,
      planId,
      startDate: start,
      nextBillingDate: trialEndDate || calculateNextBillingDate(
        start,
        plan.billingCycle
      ),
      billingCycle: plan.billingCycle,
      amount: plan.price,
      status: trialDays > 0 ? 'trial' : 'active',
      trialEndDate,
      autoRenew: autoRenew !== undefined ? autoRenew : true
    });

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Subscriptions
router.get('/', authenticate, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({
      userId: req.user.id
    })
      .populate('customerId', 'name email company')
      .populate('productId', 'name price')
      .populate('planId', 'name price billingCycle')
      .sort({ createdAt: -1 });

    res.json({ subscriptions });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Subscription By ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid subscription ID'
      });
    }

    const subscription = await Subscription.findOne({
      _id: req.params.id,
      userId: req.user.id
    })
      .populate('customerId')
      .populate('productId')
      .populate('planId');

    if (!subscription) {
      return res.status(404).json({
        message: 'Subscription not found'
      });
    }

    res.json({ subscription });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Change Subscription Plan
router.patch('/:id/plan', authenticate, async (req, res) => {
  try {
    const { planId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id) ||
        !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        message: 'Valid subscription and plan IDs are required'
      });
    }

    const subscription = await Subscription.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!subscription) {
      return res.status(404).json({
        message: 'Subscription not found'
      });
    }

    if (['cancelled', 'expired'].includes(subscription.status)) {
      return res.status(400).json({
        message: 'Cannot change the plan of an inactive subscription'
      });
    }

    const plan = await Plan.findOne({
      _id: planId,
      userId: req.user.id,
      isActive: true
    });

    if (!plan) {
      return res.status(404).json({
        message: 'Active plan not found'
      });
    }

    subscription.planId = plan._id;
    subscription.amount = plan.price;
    subscription.billingCycle = plan.billingCycle;

    await subscription.save();

    res.json({
      message: 'Subscription plan updated successfully',
      subscription
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel Subscription
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid subscription ID'
      });
    }

    const subscription = await Subscription.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!subscription) {
      return res.status(404).json({
        message: 'Subscription not found'
      });
    }

    if (['cancelled', 'expired'].includes(subscription.status)) {
      return res.status(400).json({
        message: 'Subscription is already inactive'
      });
    }

    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    subscription.endDate = new Date();

    await subscription.save();

    res.json({
      message: 'Subscription cancelled successfully',
      subscription
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Subscription
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid subscription ID'
      });
    }

    const subscription = await Subscription.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
      status: { $in: ['cancelled', 'expired'] }
    });

    if (!subscription) {
      return res.status(404).json({
        message: 'Inactive subscription not found'
      });
    }

    res.json({
      message: 'Subscription deleted successfully'
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;