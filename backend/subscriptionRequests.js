export const customerRequestTypes = ['pause', 'cancel', 'renew'];

export function requestEligibility(subscription, type, now = new Date(), stage = 'submit') {
  const plan = subscription.plan;
  if (!customerRequestTypes.includes(type)) return 'Choose a valid request type.';
  if (!plan) return 'The subscription plan is unavailable.';

  if (type === 'pause') {
    if (!plan.allowPause) return 'Pausing is not allowed for this plan.';
    if (subscription.status !== 'active') return 'Only active subscriptions can be paused.';
  }

  if (type === 'cancel') {
    if (!['active', 'paused'].includes(subscription.status)) return 'Only active or paused subscriptions can be cancelled.';
    const canCloseNow = plan.allowEarlyClose || (subscription.expiryDate && subscription.expiryDate <= now);
    if (stage === 'approve' && !canCloseNow) return 'This plan does not allow cancellation before its expiry date.';
  }

  if (type === 'renew') {
    if (!plan.allowRenewal) return 'Renewal is not allowed for this plan.';
    if (!['closed', 'expired'].includes(subscription.status)) return 'Only closed or expired subscriptions can be renewed.';
  }

  return null;
}

export function approvedRequestUpdate(subscription, type, now = new Date()) {
  const error = requestEligibility(subscription, type, now, 'approve');
  if (error) return { error };
  if (type === 'pause') return { update: { status: 'paused' } };
  if (type === 'cancel') return { update: { status: 'closed' } };
  return { update: { status: 'active', nextBillingDate: now } };
}

export function requestResponseMessage(type) {
  if (type === 'pause') return 'Pause request submitted. Your subscription stays active until the request is approved.';
  if (type === 'cancel') return 'Cancellation request submitted. Your subscription stays unchanged until the request is approved.';
  return 'Renewal request submitted for your closed or expired subscription.';
}
