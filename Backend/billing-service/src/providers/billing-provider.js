'use strict';

class BillingProvider {
  constructor(id) {
    if (new.target === BillingProvider) throw new TypeError('BillingProvider es abstracto');
    this.id = id;
  }

  async healthCheck() { throw new Error('Not implemented'); }
  async createCustomer() { throw new Error('Not implemented'); }
  async createCheckout() { throw new Error('Not implemented'); }
  async createSubscription() { throw new Error('Not implemented'); }
  async getSubscription() { throw new Error('Not implemented'); }
  async changePlan() { throw new Error('Not implemented'); }
  async cancelSubscription() { throw new Error('Not implemented'); }
  async refundPayment() { throw new Error('Not implemented'); }
  async verifyWebhook() { throw new Error('Not implemented'); }
}

module.exports = { BillingProvider };
