'use strict';

const { BillingService } = require('./billing-service');
const { fixture } = require('../testing/fixture');

describe('BillingService', () => {
  test('crea una suscripcion con auditoria, outbox e idempotencia', async () => {
    const { service, repository, metrics, context } = fixture();
    const args = {
      db: {}, context, idempotencyKey: 'create-request-1',
      input: { planId: 'plan_sandbox_monthly', customer: { email: 'BUYER@example.cl', name: 'Buyer' } },
    };
    const first = await service.createSubscription(args);
    const replay = await service.createSubscription(args);
    expect(first.status).toBe(201);
    expect(replay.replayed).toBe(true);
    expect(replay.body).toEqual(first.body);
    expect(repository.audits).toHaveLength(1);
    expect(repository.outbox).toHaveLength(1);
    expect(repository.audits[0].metadata).not.toHaveProperty('email');
    expect(metrics.render()).toContain('create_subscription');
  });

  test('rechaza reutilizar la clave con otro payload', async () => {
    const { service, context } = fixture();
    const base = { db: {}, context, idempotencyKey: 'create-request-1' };
    await service.createSubscription({ ...base, input: { planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } } });
    await expect(service.createSubscription({
      ...base, input: { planId: 'plan_sandbox_monthly', customer: { email: 'b@example.cl' } },
    })).rejects.toMatchObject({ code: 'idempotency_conflict', status: 409 });
  });

  test('no permite leer una suscripcion de otro tenant', async () => {
    const { service, context } = fixture();
    const created = await service.createSubscription({
      db: {}, context, idempotencyKey: 'tenant-request-1',
      input: { planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } },
    });
    await expect(service.getSubscription({
      db: {}, context: { ...context, tenantId: 8 }, subscriptionId: created.body.id,
    })).rejects.toMatchObject({ status: 404 });
  });

  test('cancela una sola vez y reutiliza la respuesta idempotente', async () => {
    const { service, repository, context } = fixture();
    const created = await service.createSubscription({
      db: {}, context, idempotencyKey: 'create-request-1',
      input: { planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } },
    });
    const cancelArgs = { db: {}, context, subscriptionId: created.body.id, idempotencyKey: 'cancel-request-1' };
    const canceled = await service.cancelSubscription(cancelArgs);
    const replay = await service.cancelSubscription(cancelArgs);
    const alreadyCanceled = await service.cancelSubscription({ ...cancelArgs, idempotencyKey: 'cancel-request-2' });
    expect(canceled.body.status).toBe('canceled');
    expect(replay.replayed).toBe(true);
    expect(alreadyCanceled.body.status).toBe('canceled');
    expect(repository.audits).toHaveLength(2);
  });

  test('rechaza plan inexistente y clave aun en proceso', async () => {
    const { service, repository, context } = fixture();
    await expect(service.createSubscription({
      db: {}, context, idempotencyKey: 'missing-plan-1',
      input: { planId: 'plan_missing', customer: { email: 'a@example.cl' } },
    })).rejects.toMatchObject({ status: 404 });
    expect(repository.idempotency.has(repository.key(7, 'subscription.create', 'missing-plan-1'))).toBe(false);
    repository.idempotency.set(repository.key(7, 'subscription.create', 'processing-key'), {
      request_hash: require('./billing-service').requestHash({
        planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl', name: null },
      }), status: 'processing',
    });
    await expect(service.createSubscription({
      db: {}, context, idempotencyKey: 'processing-key',
      input: { planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } },
    })).rejects.toMatchObject({ code: 'idempotency_in_progress' });
  });
});
