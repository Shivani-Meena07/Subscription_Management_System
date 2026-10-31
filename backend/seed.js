import './config/env.js';
import mongoose from 'mongoose';
import { User } from './models.js';
import { passwordValid } from './utils.js';

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env before seeding.');
const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
if (!email || !passwordValid(password)) throw new Error('Set ADMIN_EMAIL and a password over 8 characters with uppercase, lowercase and a special character in backend/.env.');
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await User.init();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin' || !existing.active) throw new Error('ADMIN_EMAIL belongs to a non-admin or inactive account. Choose another admin email; existing accounts are not overwritten.');
    console.log(`Admin already exists: ${email}. Its password was not changed.`);
  } else {
    await User.create({ name: process.env.ADMIN_NAME || 'SubSight Admin', email, password, role: 'admin' });
    console.log(`Created admin account: ${email}`);
  }
} finally {
  await mongoose.disconnect();
}
