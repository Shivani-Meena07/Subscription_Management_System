import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'staff', 'customer'], default: 'customer' },
  active: { type: Boolean, default: true },
  resetToken: { type: String, select: false },
  resetExpires: { type: Date, select: false },
  tokenVersion: { type: Number, default: 0, select: false }
}, { timestamps: true });
userSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.verifyPassword = function (password) { return bcrypt.compare(password, this.password); };

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: ['software', 'addon', 'service'], default: 'software' },
  salesPrice: { type: Number, min: 0, required: true },
  costPrice: { type: Number, min: 0, default: 0 },
  variants: [{ name: String, additionalPrice: { type: Number, default: 0 } }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

const planSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  price: { type: Number, min: 0, required: true },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: 'monthly' },
  minimumQuantity: { type: Number, min: 1, default: 1, validate: Number.isSafeInteger },
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  startDate: Date,
  endDate: Date,
  autoClose: { type: Boolean, default: true },
  allowEarlyClose: { type: Boolean, default: true },
  allowPause: { type: Boolean, default: true },
  allowRenewal: { type: Boolean, default: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const itemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  description: { type: String, required: true },
  variant: String,
  quantity: { type: Number, min: 1, default: 1, validate: Number.isSafeInteger },
  unitPrice: { type: Number, min: 0, required: true },
  taxRate: { type: Number, min: 0, max: 100, default: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  taxAmount: { type: Number, min: 0, default: 0 },
  amount: { type: Number, min: 0, required: true }
});

const quotationSchema = new Schema({
  number: { type: String, unique: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: Schema.Types.ObjectId, ref: 'Plan' },
  items: [itemSchema],
  subtotal: Number,
  taxTotal: Number,
  discountTotal: Number,
  total: Number,
  validUntil: Date,
  status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'sent' },
  subscription: { type: Schema.Types.ObjectId, ref: 'Subscription' }
}, { timestamps: true });

const subscriptionSchema = new Schema({
  number: { type: String, unique: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation', unique: true, sparse: true },
  items: [itemSchema],
  quantity: { type: Number, min: 1, default: 1, validate: Number.isSafeInteger },
  total: { type: Number, min: 0, required: true },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  startDate: { type: Date, default: Date.now },
  expiryDate: Date,
  nextBillingDate: { type: Date, index: true },
  status: { type: String, enum: ['draft', 'confirmed', 'active', 'paused', 'closed', 'expired'], default: 'active', index: true },
  requests: [{ type: { type: String, enum: ['pause', 'cancel', 'renew'] }, requestedAt: { type: Date, default: Date.now }, status: { type: String, default: 'pending' } }]
}, { timestamps: true });

const invoiceSchema = new Schema({
  number: { type: String, unique: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subscription: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  billingKey: { type: String, unique: true, sparse: true },
  items: [itemSchema],
  subtotal: Number,
  taxTotal: Number,
  discountTotal: Number,
  total: { type: Number, min: 0, required: true },
  paidAmount: { type: Number, default: 0, min: 0 },
  outstanding: { type: Number, min: 0, required: true },
  invoiceDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true, index: true },
  status: { type: String, enum: ['draft', 'confirmed', 'partial', 'paid', 'cancelled'], default: 'confirmed', index: true }
}, { timestamps: true });
invoiceSchema.index({ subscription: 1, billingPeriodStart: 1, billingPeriodEnd: 1 }, { unique: true, sparse: true });

const paymentSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  amount: { type: Number, min: 0.01, required: true },
  method: { type: String, enum: ['cash', 'bank transfer', 'upi', 'card', 'other'], default: 'upi' },
  reference: String,
  notes: String,
  status: { type: String, enum: ['successful', 'failed'], default: 'successful' },
  paidAt: { type: Date, default: Date.now }
}, { timestamps: true });

const taxSchema = new Schema({ name: { type: String, required: true }, rate: { type: Number, min: 0, max: 100, required: true }, active: { type: Boolean, default: true } }, { timestamps: true });
const discountSchema = new Schema({
  name: { type: String, required: true },
  kind: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, min: 0, required: true },
  minimumPurchase: { type: Number, default: 0 },
  minimumQuantity: { type: Number, min: 1, default: 1, validate: Number.isSafeInteger },
  startsAt: Date,
  endsAt: Date,
  usageLimit: { type: Number, min: 1, validate: Number.isSafeInteger },
  usageCount: { type: Number, default: 0 },
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const User = model('User', userSchema);
export const Product = model('Product', productSchema);
export const Plan = model('Plan', planSchema);
export const Quotation = model('Quotation', quotationSchema);
export const Subscription = model('Subscription', subscriptionSchema);
export const Invoice = model('Invoice', invoiceSchema);
export const Payment = model('Payment', paymentSchema);
export const Tax = model('Tax', taxSchema);
export const Discount = model('Discount', discountSchema);
