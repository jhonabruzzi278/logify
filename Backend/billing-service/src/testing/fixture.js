'use strict';

const { BillingService } = require('../services/billing-service');
const { FakeBillingProvider } = require('../providers/fake-provider');
const { ProviderRegistry } = require('../providers/provider-registry');
const { MetricsRegistry } = require('../observability/metrics');

class MemoryRepository {
  constructor() {
    this.idempotency = new Map();
    this.subscriptions = new Map();
    this.audits = [];
    this.outbox = [];
    this.resources = [];
  }
  key(tenantId, operation, key) { return `${tenantId}:${operation}:${key}`; }
  async getPlan(_db, planId, provider) {
    return planId === 'plan_sandbox_monthly' ? { id: planId, provider_plan_id: `${provider}_monthly` } : null;
  }
  async findIdempotency(_db, tenantId, operation, key) { return this.idempotency.get(this.key(tenantId, operation, key)); }
  async reserveIdempotency(_db, value) {
    const key = this.key(value.tenantId, value.operation, value.key);
    if (this.idempotency.has(key)) return false;
    this.idempotency.set(key, { request_hash: value.requestHash, status: 'processing' });
    return true;
  }
  async completeIdempotency(_db, value) {
    const key = this.key(value.tenantId, value.operation, value.key);
    this.idempotency.set(key, {
      request_hash: this.idempotency.get(key).request_hash,
      status: 'completed', response_status: value.responseStatus, response_body: value.responseBody,
    });
  }
  async releaseIdempotency(_db, value) {
    this.idempotency.delete(this.key(value.tenantId, value.operation, value.key));
  }
  async upsertCustomer(_db, value) { return { id: `customer-${value.tenantId}`, provider_customer_id: value.providerCustomerId }; }
  async createSubscription(_db, value) {
    const item = {
      id: `subscription_${this.subscriptions.size + 1}`,
      tenantId: value.tenantId,
      planId: value.planId,
      provider: value.provider,
      providerSubscriptionId: value.providerSubscriptionId,
      status: value.status,
      checkoutUrl: value.checkoutUrl,
    };
    this.subscriptions.set(`${value.tenantId}:${item.id}`, item);
    return item;
  }
  async getSubscription(_db, value) { return this.subscriptions.get(`${value.tenantId}:${value.subscriptionId}`) || null; }
  async markSubscriptionCanceled(_db, value) {
    const item = this.subscriptions.get(`${value.tenantId}:${value.subscriptionId}`);
    if (!item) return null;
    item.status = 'canceled'; item.canceledAt = value.canceledAt; return item;
  }
  async addProviderResource(_db, value) { this.resources.push(value); }
  async appendAudit(_db, value) { this.audits.push(value); }
  async enqueueOutbox(_db, value) { this.outbox.push(value); }
}

function fixture() {
  const repository = new MemoryRepository();
  const providers = new ProviderRegistry({ providers: [new FakeBillingProvider()], defaultProvider: 'fake' });
  const metrics = new MetricsRegistry();
  return {
    repository, metrics, providers,
    service: new BillingService({ repository, providers, metrics, environment: 'sandbox' }),
    context: { tenantId: 7, actorType: 'user', actorId: 'user_1', requestId: 'req_1' },
  };
}

module.exports = { MemoryRepository, fixture };
