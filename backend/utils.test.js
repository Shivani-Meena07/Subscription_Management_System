import test from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, escapeSearch, makeNumber, pageResult, passwordValid, quantityFor } from './utils.js';

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

test('monthly and yearly billing clamp dates to the target month', () => {
  assert.equal(addPeriod('2026-01-31T12:00:00.000Z', 'monthly').toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(addPeriod('2024-01-31T12:00:00.000Z', 'monthly').toISOString(), '2024-02-29T12:00:00.000Z');
  assert.equal(addPeriod('2024-02-29T12:00:00.000Z', 'yearly').toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(addPeriod('2026-12-31T12:00:00.000Z', 'monthly').toISOString(), '2027-01-31T12:00:00.000Z');
  assert.throws(() => addPeriod('invalid', 'monthly'), RangeError);
  assert.throws(() => addPeriod('2026-01-15', 'invalid'), RangeError);
});

test('seat quantities reject fractional, negative and non-finite inputs', () => {
  assert.equal(quantityFor(), 1);
  assert.equal(quantityFor('3'), 3);
  for (const value of [0, -1, 1.5, '', null, true, [3], Infinity, 'not a number']) {
    assert.throws(() => quantityFor(value), { status: 400 });
  }
});

test('pagination always uses bounded positive integer values', () => {
  assert.deepEqual(pageResult({ page: '2', limit: '200' }), { page: 2, limit: 100 });
  assert.deepEqual(pageResult({ page: 'Infinity', limit: '1.5' }), { page: 1, limit: 50 });
  assert.deepEqual(pageResult({ page: '-3', limit: '0' }), { page: 1, limit: 50 });
});

test('catalog searches treat regex characters as literal text', () => {
  for (const value of ['[', '.*', '(plan)', 'price$5', 'a\\b', '^test+?']) {
    const search = new RegExp(escapeSearch(value));
    assert.equal(search.test(value), true);
    assert.equal(search.test('unrelated'), false);
  }
});
