
import { Plan, Product } from '../models.js';

export const createPlan = async (req, res) => {
  try {
    const { products = [] } = req.body;

    if (products.length) {
      const count = await Product.countDocuments({
        _id: { $in: products },
        active: true
      });

      if (count !== products.length) {
        return res.status(400).json({ message: 'One or more products are invalid or inactive.' });
      }
    }

    const plan = await Plan.create(req.body);
    res.status(201).json({ message: 'Plan created.', plan });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().populate('products').sort({ createdAt: -1 });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id).populate('products');
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ plan });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('products');

    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ message: 'Plan updated.', plan });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );

    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ message: 'Plan deactivated.', plan });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
