'use strict';

// Prueba authMiddleware con el modulo real de shared/auth (sin mockear
// shared/auth como hace index.test.js) -- solo se mockea shared/clerk-auth,
// que es la dependencia externa nueva (ver ADR-004).
jest.mock('../shared/clerk-auth', () => ({
  isClerkConfigured: jest.fn(),
  verifyClerkToken: jest.fn(),
  verifyClerkIdentityToken: jest.fn(),
}));

describe('shared/auth - authMiddleware con Clerk (ADR-004)', () => {
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
  let signToken;
  let authMiddleware;
  let clerkIdentityMiddleware;
  let isClerkConfigured;
  let verifyClerkToken;
  let verifyClerkIdentityToken;

  function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  beforeEach(() => {
    process.env.JWT_SECRET = 'un-secreto-de-test-suficientemente-largo';
    jest.resetModules();
    jest.clearAllMocks();
    ({ isClerkConfigured, verifyClerkToken, verifyClerkIdentityToken } = require('../shared/clerk-auth'));
    ({ signToken, authMiddleware, clerkIdentityMiddleware } = require('../shared/auth'));
  });

  afterAll(() => {
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  it('retorna 401 sin intentar Clerk ni JWT si no hay token', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(isClerkConfigured).not.toHaveBeenCalled();
  });

  it('clerkIdentityMiddleware acepta identidad sin tenant y no usa JWT local', async () => {
    isClerkConfigured.mockReturnValue(true);
    verifyClerkIdentityToken.mockResolvedValue({ clerkUserId: 'user_123' });
    const req = { headers: { authorization: 'Bearer token-personal' } };
    const res = mockRes();
    const next = jest.fn();

    await clerkIdentityMiddleware(req, res, next);

    expect(req.clerkIdentity).toEqual({ clerkUserId: 'user_123' });
    expect(verifyClerkIdentityToken).toHaveBeenCalledWith('token-personal');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('usa el usuario de Clerk cuando esta configurado y el token verifica', async () => {
    isClerkConfigured.mockReturnValue(true);
    const clerkUser = { sub: 'jperez', name: 'Juan Perez', role: 'vendor', tenant_id: 7, tenant_slug: 'acme', 'cognito:groups': ['vendor'] };
    verifyClerkToken.mockResolvedValueOnce(clerkUser);
    const req = { headers: { authorization: 'Bearer token-de-clerk' } };
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(req.user).toEqual(clerkUser);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('cae al JWT propio si Clerk esta configurado pero el token no verifica como sesion de Clerk', async () => {
    isClerkConfigured.mockReturnValue(true);
    verifyClerkToken.mockRejectedValueOnce(new Error('no es un token de Clerk'));
    const jwtToken = signToken({ username: 'admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify' });
    const req = { headers: { authorization: `Bearer ${jwtToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(req.user.sub).toBe('admin');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('no intenta verificar con Clerk cuando isClerkConfigured() es false', async () => {
    isClerkConfigured.mockReturnValue(false);
    const jwtToken = signToken({ username: 'admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify' });
    const req = { headers: { authorization: `Bearer ${jwtToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(verifyClerkToken).not.toHaveBeenCalled();
    expect(req.user.sub).toBe('admin');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('retorna 401 si Clerk falla y el JWT tampoco es valido', async () => {
    isClerkConfigured.mockReturnValue(true);
    verifyClerkToken.mockRejectedValueOnce(new Error('no es un token de Clerk'));
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
