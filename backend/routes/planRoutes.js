import express from 'express';
import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Create Plan
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      billingCycle,
      features,
      trialDays
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        message: 'Plan name and price are required'
      });
    }

    const plan = await Plan.create({
      userId: req.user.id,
      name,
      description,
      price,
      billingCycle,
      features,
      trialDays
    });

    res.status(201).json({
      message: 'Plan created successfully',
      plan
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Plans
router.get('/', authenticate, async (req, res) => {
  try {
    const plans = await Plan.find({
      userId: req.user.id
    }).sort({ createdAt: -1 });

    res.json({ plans });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Plan By ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    const plan = await Plan.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({ plan });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Plan
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    const plan = await Plan.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({
      message: 'Plan updated successfully',
      plan
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Plan
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    const plan = await Plan.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id
      },
      { isActive: false },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({
      message: 'Plan deactivated successfully',
      plan
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;