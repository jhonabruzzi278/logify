'use strict';

const SUBSCRIPTION_STATES = Object.freeze([
  'incomplete', 'trialing', 'active', 'past_due', 'suspended', 'canceled',
]);

const PAYMENT_STATES = Object.freeze([
  'pending', 'authorized', 'succeeded', 'failed', 'refunded', 'disputed',
]);

const TERMINAL_SUBSCRIPTION_STATES = new Set(['canceled']);

class BillingError extends Error {
  constructor(message, { code = 'billing_error', status = 400, details } = {}) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const at = email.indexOf('@');
  const domain = at >= 0 ? email.slice(at + 1) : '';
  const hasUnsafeWhitespace = [...email].some((character) => character.codePointAt(0) <= 32);
  const invalid = email.length < 3 || email.length > 254 || hasUnsafeWhitespace ||
    at <= 0 || at !== email.lastIndexOf('@') || domain.length < 3 ||
    domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.');
  if (invalid) {
    throw new BillingError('El correo del cliente no es valido', { code: 'invalid_customer_email' });
  }
  return email;
}

function requireId(value, field) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,99}$/.test(id)) {
    throw new BillingError(`${field} no es valido`, { code: 'invalid_identifier' });
  }
  return id;
}

function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[\x21-\x7E]{8,128}$/.test(key)) {
    throw new BillingError('Idempotency-Key es obligatorio (8-128 caracteres ASCII)', {
      code: 'invalid_idempotency_key',
      status: 400,
    });
  }
  return key;
}

module.exports = {
  SUBSCRIPTION_STATES,
  PAYMENT_STATES,
  TERMINAL_SUBSCRIPTION_STATES,
  BillingError,
  normalizeEmail,
  requireId,
  validateIdempotencyKey,
};
