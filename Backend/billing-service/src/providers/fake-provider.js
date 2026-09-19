'use strict';

const crypto = require('node:crypto');
const { BillingProvider } = require('./billing-provider');

function stableId(prefix, idempotencyKey) {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

class FakeBillingProvider extends BillingProvider {
  constructor({ checkoutBaseUrl = 'https://billing-sandbox.logify.invalid' } = {}) {
    super('fake');
    this.checkoutBaseUrl = checkoutBaseUrl;
  }

  async healthCheck() { return { ok: true, environment: 'sandbox' }; }

  async createCustomer({ idempotencyKey }) {
    return { providerCustomerId: stableId('cus', idempotencyKey) };
  }

  async createCheckout({ idempotencyKey }) {
    const providerCheckoutId = stableId('chk', idempotencyKey);
    return { providerCheckoutId, checkoutUrl: `${this.checkoutBaseUrl}/${providerCheckoutId}` };
  }

  async createSubscription({ idempotencyKey, providerCustomerId }) {
    const providerSubscriptionId = stableId('sub', idempotencyKey);
    return {
      providerSubscriptionId,
      providerCustomerId,
      status: 'incomplete',
      checkoutUrl: `${this.checkoutBaseUrl}/${providerSubscriptionId}`,
    };
  }

  async getSubscription({ providerSubscriptionId }) {
    return { providerSubscriptionId, status: 'incomplete' };
  }

  async changePlan({ providerSubscriptionId }) {
    return { providerSubscriptionId, status: 'active' };
  }

  async cancelSubscription({ providerSubscriptionId }) {
    return { providerSubscriptionId, status: 'canceled', canceledAt: new Date().toISOString() };
  }

  async refundPayment({ providerPaymentId }) {
    return { providerPaymentId, status: 'refunded' };
  }

  async verifyWebhook({ payload }) {
    return { verified: true, event: payload };
  }
}

module.exports = { FakeBillingProvider, stableId };
