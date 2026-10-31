
import { Tax } from '../models.js';

export const createTax = async (req, res) => {
  try {
    const tax = await Tax.create(req.body);
    res.status(201).json({ message: 'Tax created.', tax });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getTaxes = async (req, res) => {
  try {
    const taxes = await Tax.find().sort({ createdAt: -1 });
    res.json({ taxes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTax = async (req, res) => {
  try {
    const tax = await Tax.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!tax) return res.status(404).json({ message: 'Tax not found.' });
    res.json({ message: 'Tax updated.', tax });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteTax = async (req, res) => {
  try {
    const tax = await Tax.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );

    if (!tax) return res.status(404).json({ message: 'Tax not found.' });
    res.json({ message: 'Tax deactivated.', tax });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
