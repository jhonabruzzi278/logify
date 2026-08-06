'use strict';

// Prueba el modulo real de shared/auth (sin jest.mock), a diferencia de
// index.test.js y security-module.test.js que lo mockean por completo.
// Verifica que ya no exista el fallback inseguro 'logify-dev-secret-change-in-production'.

describe('shared/auth - configuracion de JWT_SECRET', () => {
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  it('lanza un error al cargar el modulo si JWT_SECRET no esta definido', () => {
    delete process.env.JWT_SECRET;
    expect(() => require('../shared/auth')).toThrow(/JWT_SECRET/);
  });

  it('no cae de vuelta al secreto de desarrollo hardcodeado', () => {
    delete process.env.JWT_SECRET;
    let caught = null;
    try {
      require('../shared/auth');
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught.message).not.toMatch(/logify-dev-secret-change-in-production/);
  });

  it('carga correctamente y firma/verifica tokens cuando JWT_SECRET esta definido', () => {
    process.env.JWT_SECRET = 'un-secreto-de-test-suficientemente-largo';
    const { signToken, verifyToken } = require('../shared/auth');

    const token = signToken({ username: 'admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify' });
    const payload = verifyToken(token);

    expect(payload.sub).toBe('admin');
    expect(payload.tenant_id).toBe(1);
  });
});
