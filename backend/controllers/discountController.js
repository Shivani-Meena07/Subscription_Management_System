
import { Discount, Product } from '../models.js';

export const createDiscount = async (req, res) => {
  try {
    const { products = [], startsAt, endsAt, usageLimit } = req.body;

    if (products.length) {
      const count = await Product.countDocuments({
        _id: { $in: products },
        active: true
      });

      if (count !== products.length) {
        return res.status(400).json({ message: 'One or more products are invalid or inactive.' });
      }
    }

    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      return res.status(400).json({ message: 'End date cannot be before start date.' });
    }

    if (usageLimit !== undefined && usageLimit < 0) {
      return res.status(400).json({ message: 'Usage limit cannot be negative.' });
    }

    const discount = await Discount.create(req.body);
    res.status(201).json({ message: 'Discount created.', discount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getDiscounts = async (req, res) => {
  try {
    const discounts = await Discount.find()
      .populate('products')
      .sort({ createdAt: -1 });

    res.json({ discounts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDiscount = async (req, res) => {
  try {
    const discount = await Discount.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('products');

    if (!discount) return res.status(404).json({ message: 'Discount not found.' });
    res.json({ message: 'Discount updated.', discount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDiscount = async (req, res) => {
  try {
    const discount = await Discount.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );

    if (!discount) return res.status(404).json({ message: 'Discount not found.' });
    res.json({ message: 'Discount deactivated.', discount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
