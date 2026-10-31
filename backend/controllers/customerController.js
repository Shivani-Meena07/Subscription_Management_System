import { z } from 'zod';
import { User } from '../models.js';
import { escapeSearch, pageResult, passwordValid } from '../utils.js';

const customerFields = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(1000).optional(),
  active: z.boolean().optional()
});

export async function createCustomer(req, res) {
  const data = customerFields.extend({ password: z.string().refine(passwordValid, 'Use more than 8 characters, uppercase, lowercase and a special character.') }).parse(req.body);
  const customer = await User.create({ ...data, role: 'customer' });
  res.status(201).json({ item: await User.findById(customer._id), message: 'Customer created.' });
}

export async function getCustomers(req, res) {
  const filter = { role: 'customer' };
  if (req.query.search) {
    const search = { $regex: escapeSearch(req.query.search), $options: 'i' };
    filter.$or = [{ name: search }, { email: search }, { company: search }];
  }
  const { page, limit } = pageResult(req.query);
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function getCustomerById(req, res) {
  const customer = await User.findOne({ _id: req.params.id, role: 'customer' });
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });
  res.json({ item: customer });
}

export async function updateCustomer(req, res) {
  const data = customerFields.partial().parse(req.body);
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Choose customer fields to update.' });
  const customer = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'customer' }, { $set: data }, { new: true, runValidators: true }
  );
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });
  res.json({ item: customer, message: 'Customer updated.' });
}

export async function deleteCustomer(req, res) {
  req.body = { active: false };
  return updateCustomer(req, res);
}
