import { randomBytes } from 'node:crypto';

export const makeNumber = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
export function addPeriod(value, frequency) {
  const date = new Date(value);
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
  return date;
}
export function passwordValid(password) {
  return typeof password === 'string' && password.length > 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
