'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), runWithRequestId: (id, fn) => fn(), currentRequestId: jest.fn() }));
jest.mock('../shared/security', () => ({ applySecurity: jest.fn() }));
jest.mock('../shared/shutdown', () => ({ gracefulShutdown: jest.fn() }));
const mockClerk = {
  organizations: {
    createOrganization: jest.fn().mockResolvedValue({ id: 'org_signup' }),
    createOrganizationMembership: jest.fn().mockResolvedValue({ id: 'orgmem_signup' }),
    updateOrganizationMembershipMetadata: jest.fn().mockResolvedValue({}),
    deleteOrganization: jest.fn().mockResolvedValue({}),
  },
  users: {
    createUser: jest.fn().mockResolvedValue({ id: 'user_signup' }),
    deleteUser: jest.fn().mockResolvedValue({}),
  },
};
jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn(() => mockClerk) }));
jest.mock('../shared/auth', () => ({
  signToken: jest.fn().mockReturnValue('test-jwt-token'),
  verifyToken: jest.fn().mockReturnValue({ sub: 'admin', name: 'Admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify', 'cognito:groups': ['owner'] }),
  authMiddleware: (req, _res, next) => { req.user = { sub: 'admin', name: 'Admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify', 'cognito:groups': ['owner'] }; next(); },
  requireRole: () => (req, _res, next) => next(),
  requireTenant: (req, _res, next) => { req.tenantId = req.user?.tenant_id ?? 1; next(); },
  extractRoleFromRequest: (req) => (req.user && req.user.role) ? req.user.role.toLowerCase() : null,
  JWT_SECRET: 'test-secret',
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createPool } = require('../shared/db');

process.env.DB_RUNTIME_URL = 'postgres://test-runtime';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000'; // el rate limit real es 5/15min, muy bajo para correr toda la suite
process.env.CLERK_SECRET_KEY = 'sk_test_signup';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn((text, ...rest) => {
  if (typeof text === 'string' && /^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(text)) {
    return Promise.resolve({ rows: [] });
  }
  if (typeof text === 'string' && text.includes('set_config')) {
    return Promise.resolve({ rows: [] });
  }
  return mockQuery(text, ...rest);
});
const mockClient = { query: mockClientQuery, release: jest.fn() };
createPool.mockReturnValue({ query: mockQuery, on: jest.fn(), end: jest.fn(), connect: jest.fn().mockResolvedValue(mockClient) });

const { app } = require('./index');

const VALID_SIGNUP_BODY = {
  companyName: 'Acme Distribuciones',
  slug: 'acme',
  contactEmail: 'contacto@acme.cl',
  ownerName: 'Ana Contreras',
  ownerUsername: 'ana.contreras',
  ownerPassword: 'ClaveSegura123!',
};

describe('POST /api/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    mockClerk.organizations.createOrganization.mockResolvedValue({ id: 'org_signup' });
    mockClerk.organizations.createOrganizationMembership.mockResolvedValue({ id: 'orgmem_signup' });
    mockClerk.organizations.updateOrganizationMembershipMetadata.mockResolvedValue({});
    mockClerk.organizations.deleteOrganization.mockResolvedValue({});
    mockClerk.users.createUser.mockResolvedValue({ id: 'user_signup' });
    mockClerk.users.deleteUser.mockResolvedValue({});
  });

  it('crea tenant, identidad central y responde 201 con la URL única', async () => {
    const trialEndsAt = new Date(Date.now() + 90 * 86400000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // slug disponible
      .mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', name: 'Acme Distribuciones', trial_ends_at: trialEndsAt }] }) // insert tenant
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'ana.contreras', name: 'Ana Contreras', role: 'owner' }] }); // insert user

    const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);

    expect(res.status).toBe(201);
    expect(res.body.tenantSlug).toBeUndefined();
    expect(res.body.appUrl).toBe('https://app.logify.cl');
    expect(res.body.ownerUsername).toBe('ana.contreras');
    expect(res.body.trialEndsAt).toBe(trialEndsAt);
    expect(mockClerk.organizations.createOrganization).toHaveBeenCalledWith({
      name: 'Acme Distribuciones',
      slug: 'acme',
      publicMetadata: { tenant_id: 2, tenant_slug: 'acme' },
    });
    expect(mockClerk.users.createUser).toHaveBeenCalledWith(expect.objectContaining({
      emailAddress: ['contacto@acme.cl'], username: 'ana.contreras', firstName: 'Ana', lastName: 'Contreras',
    }));
    expect(mockClerk.organizations.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: 'org_signup', userId: 'user_signup', role: 'org:admin',
    });
    expect(mockQuery).toHaveBeenCalledWith('UPDATE tenants SET clerk_org_id=$1 WHERE id=$2', ['org_signup', 2]);
    expect(mockQuery).toHaveBeenCalledWith('UPDATE users SET clerk_user_id=$1 WHERE id=$2', ['user_signup', 10]);
  });

  it('responde 503 antes de escribir si la identidad central no está configurada', async () => {
    delete process.env.CLERK_SECRET_KEY;
    try {
      const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SIGNUP_AUTH_UNAVAILABLE');
      expect(mockQuery).not.toHaveBeenCalled();
    } finally {
      process.env.CLERK_SECRET_KEY = 'sk_test_signup';
    }
  });

  it('responde 503 sin escribir cuando SIGNUP_ENABLED=false', async () => {
    process.env.SIGNUP_ENABLED = 'false';
    try {
      const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SIGNUP_DISABLED');
      expect(mockQuery).not.toHaveBeenCalled();
    } finally {
      delete process.env.SIGNUP_ENABLED;
    }
  });

  it('rechaza slug ya en uso → 409', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // slug ya existe
    const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TENANT_SLUG_TAKEN');
  });

  it('revierte Postgres y elimina la organización Clerk si el correo ya existe', async () => {
    const clerkConflict = Object.assign(new Error('identifier exists'), {
      status: 422,
      errors: [{ code: 'form_identifier_exists' }],
    });
    mockClerk.users.createUser.mockRejectedValueOnce(clerkConflict);
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', name: 'Acme Distribuciones', trial_ends_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'ana.contreras', name: 'Ana Contreras', role: 'owner' }] });

    const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_EXISTS');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClerk.organizations.deleteOrganization).toHaveBeenCalledWith('org_signup');
    expect(mockClerk.users.deleteUser).not.toHaveBeenCalled();
  });

  it('elimina usuario y organización Clerk si falla la membership', async () => {
    mockClerk.organizations.createOrganizationMembership.mockRejectedValueOnce(new Error('membership failed'));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', name: 'Acme Distribuciones', trial_ends_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'ana.contreras', name: 'Ana Contreras', role: 'owner' }] });

    const res = await request(app).post('/api/signup').send(VALID_SIGNUP_BODY);

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClerk.users.deleteUser).toHaveBeenCalledWith('user_signup');
    expect(mockClerk.organizations.deleteOrganization).toHaveBeenCalledWith('org_signup');
  });

  it('rechaza slug reservado → 400', async () => {
    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, slug: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rechaza slug con formato invalido → 400', async () => {
    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, slug: 'A-' });
    expect(res.status).toBe(400);
  });

  it('rechaza sin nombre de empresa → 400', async () => {
    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, companyName: '' });
    expect(res.status).toBe(400);
  });

  it('rechaza contraseña débil → 400', async () => {
    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, ownerPassword: 'abc123' });
    expect(res.status).toBe(400);
  });

  it('cupón válido extiende el trial y suma redemptions_count', async () => {
    const trialEndsAt = new Date(Date.now() + 180 * 86400000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // slug disponible
      .mockResolvedValueOnce({ rows: [{ id: 5, code: 'BIENVENIDA90', extra_trial_days: 90, max_redemptions: null, redemptions_count: 0 }] }) // cupón válido
      .mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', name: 'Acme Distribuciones', trial_ends_at: trialEndsAt }] }) // insert tenant
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'ana.contreras', name: 'Ana Contreras', role: 'owner' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }) // vincula organization
      .mockResolvedValueOnce({ rows: [] }) // vincula usuario
      .mockResolvedValueOnce({ rows: [] }) // update coupons redemptions_count
      .mockResolvedValueOnce({ rows: [] }); // insert coupon_redemptions

    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, couponCode: 'bienvenida90' });

    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenNthCalledWith(7, expect.stringContaining('UPDATE coupons SET redemptions_count'), [5]);
    expect(mockQuery).toHaveBeenNthCalledWith(8, expect.stringContaining('INSERT INTO coupon_redemptions'), [2, 5]);
  });

  it('cupón inválido, expirado o agotado → 400', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // slug disponible
      .mockResolvedValueOnce({ rows: [] }); // cupón no encontrado (invalido/expirado/agotado)
    const res = await request(app).post('/api/signup').send({ ...VALID_SIGNUP_BODY, couponCode: 'NOEXISTE' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/signup/check-slug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('disponible → { available: true }', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/signup/check-slug').query({ slug: 'nuevaempresa' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it('responde 503 sin consultar BD cuando SIGNUP_ENABLED=false', async () => {
    process.env.SIGNUP_ENABLED = 'false';
    try {
      const res = await request(app).get('/api/signup/check-slug').query({ slug: 'nuevaempresa' });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SIGNUP_DISABLED');
      expect(mockQuery).not.toHaveBeenCalled();
    } finally {
      delete process.env.SIGNUP_ENABLED;
    }
  });

  it('ocupado → { available: false }', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).get('/api/signup/check-slug').query({ slug: 'acme' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('formato inválido → { available: false } sin tocar la BD', async () => {
    const res = await request(app).get('/api/signup/check-slug').query({ slug: 'a' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login — gating de trial (Fase 4E)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('tenant en trial vigente puede loguear', async () => {
    const hash = await bcrypt.hash('ClaveSegura123!', 10);
    const trialEndsAt = new Date(Date.now() + 30 * 86400000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', status: 'trial', trial_ends_at: trialEndsAt }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'ana.contreras', password_hash: hash, role: 'owner', name: 'Ana Contreras', rut: null, email: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/login').send({ username: 'ana.contreras', password: 'ClaveSegura123!' });
    expect(res.status).toBe(200);
  });

  it('tenant con trial vencido → 403', async () => {
    const trialEndsAt = new Date(Date.now() - 86400000).toISOString();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, slug: 'acme', status: 'trial', trial_ends_at: trialEndsAt }] });
    const res = await request(app).post('/api/auth/login').send({ username: 'ana.contreras', password: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('Admin de cupones', () => {
  const ORIGINAL_ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    process.env.PLATFORM_ADMIN_KEY = 'test-admin-key';
  });

  afterAll(() => {
    if (ORIGINAL_ADMIN_KEY === undefined) delete process.env.PLATFORM_ADMIN_KEY;
    else process.env.PLATFORM_ADMIN_KEY = ORIGINAL_ADMIN_KEY;
  });

  it('POST sin X-Admin-Key → 401', async () => {
    const res = await request(app).post('/api/admin/coupons').send({ code: 'PROMO' });
    expect(res.status).toBe(401);
  });

  it('POST con X-Admin-Key incorrecta → 401', async () => {
    const res = await request(app).post('/api/admin/coupons').set('X-Admin-Key', 'wrong').send({ code: 'PROMO' });
    expect(res.status).toBe(401);
  });

  it('POST con X-Admin-Key correcta → 201', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, code: 'PROMO', extra_trial_days: 90 }] });
    const res = await request(app).post('/api/admin/coupons').set('X-Admin-Key', 'test-admin-key').send({ code: 'promo' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('PROMO');
  });

  it('GET con X-Admin-Key correcta → 200 lista', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, code: 'PROMO' }] });
    const res = await request(app).get('/api/admin/coupons').set('X-Admin-Key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('responde 503 si PLATFORM_ADMIN_KEY no está configurado', async () => {
    delete process.env.PLATFORM_ADMIN_KEY;
    const res = await request(app).get('/api/admin/coupons').set('X-Admin-Key', 'anything');
    expect(res.status).toBe(503);
  });
});
