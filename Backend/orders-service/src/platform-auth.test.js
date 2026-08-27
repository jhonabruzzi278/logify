'use strict';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

const { verifyToken } = require('@clerk/backend');
const { requirePlatformAdmin } = require('../shared/platform-auth');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('requirePlatformAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLERK_SECRET_KEY = 'sk_test_platform';
    process.env.PLATFORM_ADMIN_CLERK_USER_IDS = 'user_admin,user_backup';
  });

  afterEach(() => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.PLATFORM_ADMIN_CLERK_USER_IDS;
  });

  it('autoriza un usuario Clerk incluido en la allowlist', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_admin', sid: 'sess_1' });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = response();
    const next = jest.fn();

    await requirePlatformAdmin(req, res, next);

    expect(verifyToken).toHaveBeenCalledWith('valid-token', { secretKey: 'sk_test_platform' });
    expect(req.platformAdmin).toEqual({ clerkUserId: 'user_admin', sessionId: 'sess_1' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza una identidad válida que no pertenece a la allowlist', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_customer' });
    const res = response();

    await requirePlatformAdmin({ headers: { authorization: 'Bearer valid-token' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rechaza solicitudes sin bearer token', async () => {
    const res = response();

    await requirePlatformAdmin({ headers: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('falla cerrado cuando no existe allowlist', async () => {
    delete process.env.PLATFORM_ADMIN_CLERK_USER_IDS;
    const res = response();

    await requirePlatformAdmin({ headers: { authorization: 'Bearer token' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
  });
});
