import test from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, makeNumber, passwordValid } from './utils.js';

test('password policy requires length, case, and a special character', () => {
  assert.equal(passwordValid('GoodPass!42'), true);
  assert.equal(passwordValid('short!A1'), false);
  assert.equal(passwordValid('lowercase!42'), false);
  assert.equal(passwordValid('NoSpecial42'), false);
});

test('billing period advances according to supported frequency', () => {
  assert.equal(addPeriod('2026-01-15T00:00:00.000Z', 'weekly').toISOString(), '2026-01-22T00:00:00.000Z');
  assert.equal(addPeriod('2026-01-15T00:00:00.000Z', 'monthly').toISOString(), '2026-02-15T00:00:00.000Z');
  assert.equal(addPeriod('2026-01-15T00:00:00.000Z', 'yearly').toISOString(), '2027-01-15T00:00:00.000Z');
});

test('generated business numbers include a record type and unique suffix', () => {
  const first = makeNumber('INV');
  const second = makeNumber('INV');
  assert.match(first, /^INV-/);
  assert.notEqual(first, second);
});
