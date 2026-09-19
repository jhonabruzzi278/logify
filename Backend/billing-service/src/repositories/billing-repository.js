'use strict';

const crypto = require('node:crypto');
const { BillingError } = require('../domain/billing');

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: Number(row.tenant_id),
    planId: row.plan_id,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    status: row.status,
    checkoutUrl: row.checkout_url,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class BillingRepository {
  async getPlan(db, planId, provider) {
    const result = await db.query(
      `SELECT p.id, p.code, p.name, p.currency, p.amount_minor, p.interval,
              ppm.provider_plan_id
         FROM billing_plans p
         JOIN provider_plan_mappings ppm ON ppm.plan_id=p.id AND ppm.provider=$2
        WHERE p.id=$1 AND p.active=true AND ppm.active=true`,
      [planId, provider]
    );
    return result.rows[0] || null;
  }

  async findIdempotency(db, tenantId, operation, key) {
    const result = await db.query(
      `SELECT request_hash, status, response_status, response_body
         FROM idempotency_keys
        WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3`,
      [tenantId, operation, key]
    );
    return result.rows[0] || null;
  }

  async reserveIdempotency(db, { tenantId, operation, key, requestHash }) {
    const result = await db.query(
      `INSERT INTO idempotency_keys
         (tenant_id, operation, idempotency_key, request_hash, status)
       VALUES ($1,$2,$3,$4,'processing')
       ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
       RETURNING id`,
      [tenantId, operation, key, requestHash]
    );
    return result.rows.length === 1;
  }

  async completeIdempotency(db, { tenantId, operation, key, responseStatus, responseBody }) {
    await db.query(
      `UPDATE idempotency_keys
          SET status='completed', response_status=$4, response_body=$5, completed_at=NOW()
        WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3`,
      [tenantId, operation, key, responseStatus, responseBody]
    );
  }

  async releaseIdempotency(db, { tenantId, operation, key }) {
    await db.query(
      `DELETE FROM idempotency_keys
        WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 AND status='processing'`,
      [tenantId, operation, key]
    );
  }

  async upsertCustomer(db, { tenantId, email, name, provider, providerCustomerId }) {
    const id = crypto.randomUUID();
    const result = await db.query(
      `INSERT INTO billing_customers
         (id, tenant_id, email, name, provider, provider_customer_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, provider, email)
       DO UPDATE SET name=EXCLUDED.name,
                     provider_customer_id=COALESCE(billing_customers.provider_customer_id, EXCLUDED.provider_customer_id),
                     updated_at=NOW()
       RETURNING *`,
      [id, tenantId, email, name || null, provider, providerCustomerId]
    );
    return result.rows[0];
  }

  async createSubscription(db, input) {
    const id = crypto.randomUUID();
    const result = await db.query(
      `INSERT INTO subscriptions
         (id, tenant_id, billing_customer_id, plan_id, provider,
          provider_subscription_id, status, checkout_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, input.tenantId, input.billingCustomerId, input.planId, input.provider,
        input.providerSubscriptionId, input.status, input.checkoutUrl || null]
    );
    return mapSubscription(result.rows[0]);
  }

  async getSubscription(db, { tenantId, subscriptionId }) {
    const result = await db.query(
      'SELECT * FROM subscriptions WHERE id=$1 AND tenant_id=$2',
      [subscriptionId, tenantId]
    );
    return mapSubscription(result.rows[0]);
  }

  async markSubscriptionCanceled(db, { tenantId, subscriptionId, canceledAt }) {
    const result = await db.query(
      `UPDATE subscriptions
          SET status='canceled', canceled_at=$3, cancel_at_period_end=false, updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND status <> 'canceled'
        RETURNING *`,
      [subscriptionId, tenantId, canceledAt]
    );
    if (result.rows[0]) return mapSubscription(result.rows[0]);
    return this.getSubscription(db, { tenantId, subscriptionId });
  }

  async addProviderResource(db, input) {
    await db.query(
      `INSERT INTO provider_resources
         (id, tenant_id, provider, resource_type, local_resource_id, provider_resource_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (provider, resource_type, provider_resource_id) DO NOTHING`,
      [crypto.randomUUID(), input.tenantId, input.provider, input.resourceType,
        input.localResourceId, input.providerResourceId]
    );
  }

  async appendAudit(db, input) {
    await db.query(
      `INSERT INTO audit_events
         (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
          request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [crypto.randomUUID(), input.tenantId, input.actorType, input.actorId || null,
        input.action, input.resourceType, input.resourceId, input.requestId || null,
        input.metadata || {}]
    );
  }

  async enqueueOutbox(db, input) {
    await db.query(
      `INSERT INTO outbox_events (id, tenant_id, topic, aggregate_type, aggregate_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), input.tenantId, input.topic, input.aggregateType,
        input.aggregateId, input.payload]
    );
  }
}

function ensureFound(value, message = 'Recurso no encontrado') {
  if (!value) throw new BillingError(message, { code: 'not_found', status: 404 });
  return value;
}

module.exports = { BillingRepository, mapSubscription, ensureFound };
