'use strict';

const { BillingRepository, mapSubscription, ensureFound } = require('./billing-repository');

describe('BillingRepository', () => {
  let repository;
  let db;
  beforeEach(() => {
    repository = new BillingRepository();
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  });

  test('mapea suscripciones y valida recursos encontrados', () => {
    expect(mapSubscription(null)).toBeNull();
    expect(mapSubscription({ id: 'sub_1', tenant_id: '7', status: 'active' })).toMatchObject({ tenantId: 7, status: 'active' });
    expect(ensureFound({ id: 1 })).toEqual({ id: 1 });
    expect(() => ensureFound(null)).toThrow(expect.objectContaining({ status: 404 }));
  });

  test('consulta plan e idempotencia con parametros', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'plan_1' }] });
    await expect(repository.getPlan(db, 'plan_1', 'fake')).resolves.toEqual({ id: 'plan_1' });
    db.query.mockResolvedValueOnce({ rows: [{ status: 'completed' }] });
    await expect(repository.findIdempotency(db, 7, 'op', 'key')).resolves.toEqual({ status: 'completed' });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await expect(repository.reserveIdempotency(db, { tenantId: 7, operation: 'op', key: 'key', requestHash: 'hash' })).resolves.toBe(true);
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(repository.reserveIdempotency(db, { tenantId: 7, operation: 'op', key: 'key', requestHash: 'hash' })).resolves.toBe(false);
  });

  test('persiste cliente, suscripcion, recursos, auditoria y outbox', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'cus_1', provider_customer_id: 'provider_cus' }] });
    await repository.upsertCustomer(db, { tenantId: 7, email: 'a@example.cl', name: 'A', provider: 'fake', providerCustomerId: 'provider_cus' });
    db.query.mockResolvedValueOnce({ rows: [{ id: 'sub_1', tenant_id: 7, status: 'incomplete' }] });
    await repository.createSubscription(db, {
      tenantId: 7, billingCustomerId: 'cus_1', planId: 'plan_1', provider: 'fake',
      providerSubscriptionId: 'provider_sub', status: 'incomplete', checkoutUrl: 'https://example.test',
    });
    await repository.addProviderResource(db, { tenantId: 7, provider: 'fake', resourceType: 'subscription', localResourceId: 'sub_1', providerResourceId: 'provider_sub' });
    await repository.appendAudit(db, { tenantId: 7, actorType: 'user', action: 'created', resourceType: 'subscription', resourceId: 'sub_1' });
    await repository.enqueueOutbox(db, { tenantId: 7, topic: 'created', aggregateType: 'subscription', aggregateId: 'sub_1', payload: {} });
    await repository.completeIdempotency(db, { tenantId: 7, operation: 'op', key: 'key', responseStatus: 201, responseBody: {} });
    await repository.releaseIdempotency(db, { tenantId: 7, operation: 'op', key: 'key' });
    expect(db.query).toHaveBeenCalledTimes(7);
  });

  test('lee y cancela respetando tenant_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'sub_1', tenant_id: 7, status: 'active' }] });
    await expect(repository.getSubscription(db, { tenantId: 7, subscriptionId: 'sub_1' })).resolves.toMatchObject({ tenantId: 7 });
    db.query.mockResolvedValueOnce({ rows: [{ id: 'sub_1', tenant_id: 7, status: 'canceled' }] });
    await expect(repository.markSubscriptionCanceled(db, { tenantId: 7, subscriptionId: 'sub_1', canceledAt: new Date() })).resolves.toMatchObject({ status: 'canceled' });
    expect(db.query.mock.calls[0][0]).toContain('tenant_id=$2');
  });

  test('si la cancelacion ya ocurrio devuelve el estado existente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub_1', tenant_id: 7, status: 'canceled' }] });
    await expect(repository.markSubscriptionCanceled(db, {
      tenantId: 7, subscriptionId: 'sub_1', canceledAt: new Date(),
    })).resolves.toMatchObject({ status: 'canceled' });
  });
});
