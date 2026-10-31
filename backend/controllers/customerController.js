
import { User } from '../models.js';

export const createCustomer = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const customer = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: 'customer'
    });

    res.status(201).json({
      message: 'Customer created successfully.',
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        role: customer.role
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ customers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer'
    }).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    res.json({ customer });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { name, email, active } = req.body;

    const customer = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'customer' },
      { $set: { name, email: email?.toLowerCase().trim(), active } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    res.json({ message: 'Customer updated.', customer });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'customer' },
      { active: false },
      { new: true }
    ).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    res.json({ message: 'Customer deactivated.', customer });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
