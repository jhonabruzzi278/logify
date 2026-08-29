'use strict';

const crypto = require('crypto');
const {
  BillingError, TERMINAL_SUBSCRIPTION_STATES, normalizeEmail, requireId,
} = require('../domain/billing');
const { ensureFound } = require('../repositories/billing-repository');

function requestHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

class BillingService {
  constructor({ repository, providers, metrics, environment = 'sandbox' }) {
    this.repository = repository;
    this.providers = providers;
    this.metrics = metrics;
    this.environment = environment;
  }

  async idempotent(db, context, operation, key, input, handler) {
    const hash = requestHash(input);
    const existing = await this.repository.findIdempotency(db, context.tenantId, operation, key);
    if (existing) return this.resolveExistingIdempotency(existing, hash);

    const reserved = await this.repository.reserveIdempotency(db, {
      tenantId: context.tenantId, operation, key, requestHash: hash,
    });
    if (!reserved) {
      const raced = await this.repository.findIdempotency(db, context.tenantId, operation, key);
      return this.resolveExistingIdempotency(raced, hash);
    }

    try {
      const result = await handler();
      await this.repository.completeIdempotency(db, {
        tenantId: context.tenantId,
        operation,
        key,
        responseStatus: result.status,
        responseBody: result.body,
      });
      return result;
    } catch (error) {
      await this.repository.releaseIdempotency(db, { tenantId: context.tenantId, operation, key });
      throw error;
    }
  }

  resolveExistingIdempotency(existing, hash) {
    if (!existing || existing.request_hash !== hash) {
      throw new BillingError('La clave de idempotencia ya fue usada con otra solicitud', {
        code: 'idempotency_conflict', status: 409,
      });
    }
    if (existing.status !== 'completed') {
      throw new BillingError('La solicitud con esta clave aun esta en proceso', {
        code: 'idempotency_in_progress', status: 409,
      });
    }
    return { status: Number(existing.response_status), body: existing.response_body, replayed: true };
  }

  async createSubscription({ db, context, idempotencyKey, input }) {
    const normalized = {
      planId: requireId(input.planId, 'planId'),
      customer: {
        email: normalizeEmail(input.customer?.email),
        name: String(input.customer?.name || '').trim().slice(0, 200) || null,
      },
    };

    return this.idempotent(db, context, 'subscription.create', idempotencyKey, normalized, async () => {
      const provider = this.providers.get();
      const plan = ensureFound(
        await this.repository.getPlan(db, normalized.planId, provider.id),
        'El plan no existe o no esta disponible para el proveedor activo'
      );
      const providerCustomer = await provider.createCustomer({
        email: normalized.customer.email,
        name: normalized.customer.name,
        idempotencyKey: `${idempotencyKey}:customer`,
      });
      const customer = await this.repository.upsertCustomer(db, {
        tenantId: context.tenantId,
        ...normalized.customer,
        provider: provider.id,
        providerCustomerId: providerCustomer.providerCustomerId,
      });
      const providerResult = await provider.createSubscription({
        providerCustomerId: customer.provider_customer_id,
        providerPlanId: plan.provider_plan_id,
        idempotencyKey,
      });
      const subscription = await this.repository.createSubscription(db, {
        tenantId: context.tenantId,
        billingCustomerId: customer.id,
        planId: plan.id,
        provider: provider.id,
        providerSubscriptionId: providerResult.providerSubscriptionId,
        status: providerResult.status,
        checkoutUrl: providerResult.checkoutUrl,
      });
      await this.repository.addProviderResource(db, {
        tenantId: context.tenantId,
        provider: provider.id,
        resourceType: 'subscription',
        localResourceId: subscription.id,
        providerResourceId: providerResult.providerSubscriptionId,
      });
      await this.recordMutation(db, context, 'billing.subscription.created', subscription);
      this.metrics.increment('billing_operations_total', {
        provider: provider.id, operation: 'create_subscription', status: 'success', environment: this.environment,
      });
      return { status: 201, body: subscription };
    });
  }

  async getSubscription({ db, context, subscriptionId }) {
    return ensureFound(await this.repository.getSubscription(db, {
      tenantId: context.tenantId,
      subscriptionId: requireId(subscriptionId, 'subscriptionId'),
    }), 'La suscripcion no existe');
  }

  async cancelSubscription({ db, context, subscriptionId, idempotencyKey }) {
    const normalized = { subscriptionId: requireId(subscriptionId, 'subscriptionId') };
    return this.idempotent(db, context, 'subscription.cancel', idempotencyKey, normalized, async () => {
      const subscription = await this.getSubscription({ db, context, subscriptionId: normalized.subscriptionId });
      if (TERMINAL_SUBSCRIPTION_STATES.has(subscription.status)) {
        return { status: 200, body: subscription };
      }
      const provider = this.providers.get(subscription.provider);
      const providerResult = await provider.cancelSubscription({
        providerSubscriptionId: subscription.providerSubscriptionId,
        idempotencyKey,
      });
      const canceled = await this.repository.markSubscriptionCanceled(db, {
        tenantId: context.tenantId,
        subscriptionId: subscription.id,
        canceledAt: providerResult.canceledAt || new Date().toISOString(),
      });
      await this.recordMutation(db, context, 'billing.subscription.canceled', canceled);
      this.metrics.increment('billing_operations_total', {
        provider: provider.id, operation: 'cancel_subscription', status: 'success', environment: this.environment,
      });
      return { status: 200, body: canceled };
    });
  }

  async recordMutation(db, context, topic, subscription) {
    const event = { subscriptionId: subscription.id, status: subscription.status, provider: subscription.provider };
    await this.repository.appendAudit(db, {
      tenantId: context.tenantId,
      actorType: context.actorType,
      actorId: context.actorId,
      action: topic,
      resourceType: 'subscription',
      resourceId: subscription.id,
      requestId: context.requestId,
      metadata: { status: subscription.status, provider: subscription.provider },
    });
    await this.repository.enqueueOutbox(db, {
      tenantId: context.tenantId,
      topic,
      aggregateType: 'subscription',
      aggregateId: subscription.id,
      payload: event,
    });
  }
}

module.exports = { BillingService, requestHash };
