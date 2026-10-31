import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './models.js';
import { passwordValid } from './utils.js';

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env before seeding.');
await mongoose.connect(process.env.MONGODB_URI);
const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
if (!email || !passwordValid(password)) throw new Error('Set ADMIN_EMAIL and a password over 8 characters with uppercase, lowercase and a special character in backend/.env.');
const existing = await User.findOne({ email });
if (existing) {
  console.log(`Admin already exists: ${email}`);
} else {
  await User.create({ name: process.env.ADMIN_NAME || 'SubSight Admin', email, password, role: 'admin' });
  console.log(`Created admin account: ${email}`);
}
await mongoose.disconnect();
