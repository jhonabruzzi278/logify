'use strict';

const { BillingProvider } = require('./billing-provider');
const { FakeBillingProvider, stableId } = require('./fake-provider');
const { ProviderRegistry } = require('./provider-registry');

describe('provider contract and sandbox adapter', () => {
  test('la clase base no se puede instanciar', () => {
    expect(() => new BillingProvider('base')).toThrow(TypeError);
  });

  test('el contrato base falla cerrado para operaciones no implementadas', async () => {
    class EmptyProvider extends BillingProvider { constructor() { super('empty'); } }
    const provider = new EmptyProvider();
    for (const method of ['healthCheck', 'createCustomer', 'createCheckout', 'createSubscription',
      'getSubscription', 'changePlan', 'cancelSubscription', 'refundPayment', 'verifyWebhook']) {
      await expect(provider[method]()).rejects.toThrow('Not implemented');
    }
  });

  test('el fake es determinista por clave de idempotencia', async () => {
    const provider = new FakeBillingProvider({ checkoutBaseUrl: 'https://sandbox.test' });
    const first = await provider.createSubscription({ idempotencyKey: 'same-key', providerCustomerId: 'cus_1' });
    const second = await provider.createSubscription({ idempotencyKey: 'same-key', providerCustomerId: 'cus_1' });
    expect(first).toEqual(second);
    expect(first.checkoutUrl).toMatch(/^https:\/\/sandbox\.test\//);
    expect(stableId('sub', 'same-key')).toBe(first.providerSubscriptionId);
    await expect(provider.healthCheck()).resolves.toMatchObject({ ok: true });
    await expect(provider.createCustomer({ idempotencyKey: 'customer-key' })).resolves.toHaveProperty('providerCustomerId');
    await expect(provider.createCheckout({ idempotencyKey: 'checkout-key' })).resolves.toHaveProperty('providerCheckoutId');
    await expect(provider.getSubscription({ providerSubscriptionId: 'sub_1' })).resolves.toMatchObject({ status: 'incomplete' });
    await expect(provider.changePlan({ providerSubscriptionId: 'sub_1' })).resolves.toMatchObject({ status: 'active' });
    await expect(provider.cancelSubscription({ providerSubscriptionId: 'sub_1' })).resolves.toMatchObject({ status: 'canceled' });
    await expect(provider.refundPayment({ providerPaymentId: 'pay_1' })).resolves.toMatchObject({ status: 'refunded' });
    await expect(provider.verifyWebhook({ payload: { id: 1 } })).resolves.toMatchObject({ verified: true });
  });

  test('registry falla cerrado cuando no existe proveedor', () => {
    const empty = new ProviderRegistry({ defaultProvider: 'none' });
    expect(() => empty.get()).toThrow(expect.objectContaining({ status: 503 }));
    const fake = new FakeBillingProvider();
    const registry = new ProviderRegistry({ providers: [fake], defaultProvider: 'fake' });
    expect(registry.get()).toBe(fake);
    expect(registry.describe()).toEqual([{ id: 'fake', active: true }]);
  });
});
