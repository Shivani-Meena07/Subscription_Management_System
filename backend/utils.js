import { randomBytes } from 'node:crypto';

export const makeNumber = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
export function addPeriod(value, frequency) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid billing date.');
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) throw new RangeError('Invalid billing frequency.');
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  if (frequency === 'monthly' || frequency === 'yearly') {
    const day = date.getDate();
    date.setDate(1);
    if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
    else date.setFullYear(date.getFullYear() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  return date;
}
export const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function quantityFor(value = 1) {
  const quantity = Number(value);
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(quantity) || quantity < 1) throw Object.assign(new Error('Quantity must be a positive whole number.'), { status: 400 });
  return quantity;
}
export function pageResult(query) {
  const page = Number(query.page);
  const limit = Number(query.limit);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(100, limit) : 50
  };
}
export const escapeSearch = (value) => String(value).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function passwordValid(password) {
  return typeof password === 'string' && password.length > 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
