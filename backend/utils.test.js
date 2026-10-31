import test from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, escapeSearch, makeNumber, pageResult, passwordValid, quantityFor } from './utils.js';
import { prepareLocalConfig } from './config/localSetup.js';
import { csvCell, reportRange } from './reporting.js';
import { approvedRequestUpdate, requestEligibility, requestResponseMessage } from './subscriptionRequests.js';
import { Subscription } from './models.js';

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

test('local setup creates private random credentials and keeps valid existing configuration', () => {
  const template = 'MONGODB_URI=mongodb://127.0.0.1:27017/subsight\nJWT_SECRET=replace-with-secret\nADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=\n';
  const first = prepareLocalConfig(template);
  assert.ok(first.config.JWT_SECRET.length >= 32);
  assert.equal(passwordValid(first.config.ADMIN_PASSWORD), true);
  const second = prepareLocalConfig(template, first.content);
  assert.equal(second.content, first.content);
  const third = prepareLocalConfig(template);
  assert.notEqual(first.config.JWT_SECRET, third.config.JWT_SECRET);
  assert.notEqual(first.config.ADMIN_PASSWORD, third.config.ADMIN_PASSWORD);
});

test('CSV escapes spreadsheet formulas, quotes and separators', () => {
  assert.equal(csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"');
  assert.equal(csvCell('A "quoted", value'), '"A ""quoted"", value"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell('  =SUM(1,2)'), '"\'  =SUM(1,2)"');
});

test('report dates include the selected final day in Indian time', () => {
  const range = reportRange({ from: '2026-10-31', to: '2026-10-31' });
  assert.equal(range.$gte.toISOString(), '2026-10-30T18:30:00.000Z');
  assert.equal(range.$lt.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.throws(() => reportRange({ from: '2026-02-31' }), { status: 400 });
});

test('pause requests require an eligible active subscription and plan', () => {
  const subscription = { status: 'active', plan: { allowPause: true } };
  assert.equal(requestEligibility(subscription, 'pause'), null);
  assert.match(requestEligibility({ ...subscription, status: 'paused' }, 'pause'), /Only active/);
  assert.match(requestEligibility({ status: 'active', plan: { allowPause: false } }, 'pause'), /not allowed/);
  assert.deepEqual(approvedRequestUpdate(subscription, 'pause').update, { status: 'paused' });
});

test('cancellation requests respect plan closure and subscription state', () => {
  const subscription = { status: 'active', plan: { allowEarlyClose: false }, expiryDate: new Date('2027-01-01') };
  const now = new Date('2026-01-01');
  assert.equal(requestEligibility(subscription, 'cancel', now), null);
  assert.match(approvedRequestUpdate(subscription, 'cancel', now).error, /before its expiry/);
  assert.equal(requestEligibility({ ...subscription, expiryDate: new Date('2025-01-01') }, 'cancel', new Date('2026-01-01')), null);
  assert.deepEqual(approvedRequestUpdate({ status: 'paused', plan: { allowEarlyClose: true } }, 'cancel').update, { status: 'closed' });
});

test('renewal is limited to enabled plans and closed or expired subscriptions', () => {
  const active = { status: 'active', plan: { allowRenewal: true, active: true } };
  assert.match(requestEligibility(active, 'renew'), /Only closed or expired/);
  const disabled = { status: 'closed', plan: { allowRenewal: false, active: true } };
  assert.match(requestEligibility(disabled, 'renew'), /not allowed/);
  const expired = { status: 'expired', plan: { allowRenewal: true, active: true } };
  const now = new Date('2026-10-31T00:00:00Z');
  assert.equal(requestEligibility(expired, 'renew', now), null);
  assert.deepEqual(approvedRequestUpdate(expired, 'renew', now).update, { status: 'active', nextBillingDate: now });
});

test('unsupported requests and request confirmations are explicit', () => {
  assert.match(requestEligibility({ status: 'active', plan: {} }, 'archive'), /valid request type/);
  assert.match(requestResponseMessage('pause'), /stays active/);
  assert.match(requestResponseMessage('cancel'), /stays unchanged/);
  assert.match(requestResponseMessage('renew'), /closed or expired/);
});

test('subscription request subdocuments retain status, timestamps, reviewer and stable IDs', () => {
  const subscription = new Subscription({
    number: 'SUB-schema-test',
    customer: '507f1f77bcf86cd799439011',
    plan: '507f191e810c19729de860ea',
    frequency: 'monthly',
    total: 100,
    requests: [{ type: 'pause' }]
  });
  const request = subscription.requests[0];
  assert.ok(request.id);
  assert.equal(request.status, 'pending');
  assert.ok(request.requestedAt instanceof Date);
  request.status = 'approved';
  request.reviewedAt = new Date();
  request.reviewedBy = '507f1f77bcf86cd799439012';
  assert.equal(request.validateSync(), undefined);
});
