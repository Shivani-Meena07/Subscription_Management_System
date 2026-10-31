import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Create Product
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, category, price, currency } = req.body;

    if (!name || price === undefined || price < 0) {
      return res.status(400).json({
        message: 'Valid product name and price are required'
      });
    }

    const product = await Product.create({
      userId: req.user.id,
      name,
      description,
      category,
      price,
      currency
    });

    res.status(201).json({
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Products
router.get('/', authenticate, async (req, res) => {
  try {
    const products = await Product.find({
      userId: req.user.id
    }).sort({ createdAt: -1 });

    res.json({ products });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Product By ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Product
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const allowedFields = [
      'name',
      'description',
      'category',
      'price',
      'currency',
      'isActive'
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id
      },
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Product (Soft Delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id
      },
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      message: 'Product deactivated successfully',
      product
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;