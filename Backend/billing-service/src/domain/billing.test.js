'use strict';

const {
  BillingError, normalizeEmail, requireId, validateIdempotencyKey,
  SUBSCRIPTION_STATES, PAYMENT_STATES,
} = require('./billing');

describe('billing domain', () => {
  test('normaliza correos y acepta identificadores seguros', () => {
    expect(normalizeEmail(' Buyer@Example.CL ')).toBe('buyer@example.cl');
    expect(requireId('plan_monthly-1', 'planId')).toBe('plan_monthly-1');
    expect(validateIdempotencyKey('request-123456')).toBe('request-123456');
  });

  test.each([
    () => normalizeEmail('invalid'),
    () => requireId('../unsafe', 'id'),
    () => validateIdempotencyKey('short'),
  ])('rechaza entradas invalidas', (operation) => {
    expect(operation).toThrow(BillingError);
  });

  test('expone estados normalizados inmutables', () => {
    expect(SUBSCRIPTION_STATES).toContain('past_due');
    expect(PAYMENT_STATES).toContain('disputed');
    expect(Object.isFrozen(SUBSCRIPTION_STATES)).toBe(true);
    const generic = new BillingError('generic');
    expect(generic).toMatchObject({ code: 'billing_error', status: 400 });
    expect(() => normalizeEmail('')).toThrow('correo');
    expect(() => normalizeEmail(`${'a'.repeat(250)}@x.cl`)).toThrow('correo');
    expect(() => normalizeEmail('a@@example.cl')).toThrow('correo');
    expect(() => normalizeEmail('a@.example.cl')).toThrow('correo');
    expect(() => normalizeEmail('a@example.cl.')).toThrow('correo');
    expect(() => normalizeEmail('a @example.cl')).toThrow('correo');
    expect(() => requireId('', 'id')).toThrow('id');
  });
});
