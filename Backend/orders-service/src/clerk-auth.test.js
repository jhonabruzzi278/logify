'use strict';

// Prueba el modulo real de shared/clerk-auth (sin jest.mock del propio
// modulo), a diferencia de index.test.js que mockea shared/auth por
// completo. Solo se mockea @clerk/backend, la dependencia externa.
jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

describe('shared/clerk-auth', () => {
  const ORIGINAL_SECRET = process.env.CLERK_SECRET_KEY;
  let verifyToken;

  // jest.resetModules() vacia el registro de modulos (necesario porque
  // CLERK_SECRET_KEY se lee una sola vez al cargar el modulo) -- eso
  // tambien re-crea el mock de @clerk/backend, asi que hay que volver a
  // tomar la referencia a verifyToken despues de cada reset.
  beforeEach(() => {
    jest.resetModules();
    verifyToken = require('@clerk/backend').verifyToken;
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = ORIGINAL_SECRET;
    }
  });

  describe('isClerkConfigured', () => {
    it('retorna false cuando CLERK_SECRET_KEY no esta definida', () => {
      delete process.env.CLERK_SECRET_KEY;
      jest.resetModules();
      const { isClerkConfigured } = require('../shared/clerk-auth');
      expect(isClerkConfigured()).toBe(false);
    });

    it('retorna true cuando CLERK_SECRET_KEY esta definida', () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_algo';
      jest.resetModules();
      const { isClerkConfigured } = require('../shared/clerk-auth');
      expect(isClerkConfigured()).toBe(true);
    });
  });

  describe('verifyClerkToken', () => {
    beforeEach(() => {
      process.env.CLERK_SECRET_KEY = 'sk_test_algo';
      jest.resetModules();
      verifyToken = require('@clerk/backend').verifyToken;
    });

    it('mapea el payload de Clerk a la misma forma que produce el JWT propio', async () => {
      verifyToken.mockResolvedValueOnce({
        username: 'jperez',
        name: 'Juan Perez',
        role: 'vendor',
        tenant_id: '7',
        tenant_slug: 'acme',
      });
      const { verifyClerkToken } = require('../shared/clerk-auth');

      const user = await verifyClerkToken('token-de-clerk');

      expect(user).toEqual({
        sub: 'jperez',
        name: 'Juan Perez',
        role: 'vendor',
        tenant_id: 7,
        tenant_slug: 'acme',
        'cognito:groups': ['vendor'],
      });
    });

    it('lanza un error si el token es valido pero falta el claim role', async () => {
      verifyToken.mockResolvedValueOnce({ username: 'jperez', tenant_id: '7' });
      const { verifyClerkToken } = require('../shared/clerk-auth');

      await expect(verifyClerkToken('token-de-clerk')).rejects.toThrow(/claims custom esperados/);
    });

    it('lanza un error si el token es valido pero falta el claim tenant_id', async () => {
      verifyToken.mockResolvedValueOnce({ username: 'jperez', role: 'vendor' });
      const { verifyClerkToken } = require('../shared/clerk-auth');

      await expect(verifyClerkToken('token-de-clerk')).rejects.toThrow(/claims custom esperados/);
    });

    it('propaga el error de @clerk/backend cuando el token es invalido', async () => {
      verifyToken.mockRejectedValueOnce(new Error('token expirado'));
      const { verifyClerkToken } = require('../shared/clerk-auth');

      await expect(verifyClerkToken('token-vencido')).rejects.toThrow('token expirado');
    });
  });
});
