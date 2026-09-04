'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), runWithRequestId: (id, fn) => fn(), currentRequestId: jest.fn() }));
jest.mock('../shared/security', () => ({ applySecurity: jest.fn() }));
jest.mock('../shared/shutdown', () => ({ gracefulShutdown: jest.fn() }));
jest.mock('../shared/platform-auth', () => ({
  requirePlatformAdmin: (req, _res, next) => { req.platformAdmin = { clerkUserId: 'user_admin' }; next(); },
}));
jest.mock('@clerk/backend/webhooks', () => ({ verifyWebhook: jest.fn() }));
const mockUpdateOrganization = jest.fn();
const mockCreateOrganizationInvitation = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(() => ({ organizations: {
    updateOrganization: (...args) => mockUpdateOrganization(...args),
    createOrganizationInvitation: (...args) => mockCreateOrganizationInvitation(...args),
  } })),
}));
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
const { verifyWebhook } = require('@clerk/backend/webhooks');

process.env.DB_RUNTIME_URL = 'postgres://test-runtime';

const mockQuery = jest.fn();
// req.db.query (via attachTenantDb) reusa mockQuery para las queries de
// negocio, pero el BEGIN/set_config/COMMIT/ROLLBACK que agrega la propia
// transaccion de RLS se resuelve aparte para no consumir los
// mockResolvedValueOnce encolados para las queries reales de cada test.
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

const { app, seedUsers, ensureTables } = require('./index');

const mockOrder = {
  id: 1, customer_id: 10, sku: 'COCA-2L', quantity: 5,
  status: 'CREATED', created_at: new Date().toISOString(),
  assigned_to: null, cancel_reason: null
};

const mockCustomer = {
  id: 1, name: 'Juan Perez', phone: '999888777',
  address: 'Av. Lima 123', email: 'juan@example.com',
  created_at: new Date().toISOString()
};

describe('orders-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('') });
  });

  // ─── HEALTH ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('retorna 200 UP con db=connected cuando BD disponible', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [1] });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'UP', db: 'connected' });
    });

    it('retorna 503 DEGRADED cuando BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DEGRADED');
    });
  });

  // ─── TEST ENDPOINT ──────────────────────────────────────────────────────────

  describe('GET /api/orders/test', () => {
    it('retorna texto que incluye orders-service UP', async () => {
      const res = await request(app).get('/api/orders/test');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/orders-service UP/i);
    });
  });

  describe('platform management API', () => {
    it('retorna métricas normalizadas del conjunto de tenants', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{
        total_tenants: '12', trialing_tenants: '4', active_tenants: '7',
        attention_tenants: '1', active_mrr_clp: '349930',
      }] });

      const res = await request(app).get('/api/platform/overview');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalTenants: 12,
        trialingTenants: 4,
        activeTenants: 7,
        attentionTenants: 1,
        activeMrrClp: 349930,
      });
    });

    it('lista organizaciones sin exponer identificadores internos de pago', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{
        id: 7, slug: 'acme', name: 'Acme', status: 'active', plan: 'pro',
        contact_email: 'admin@acme.cl', subscription_status: 'active',
        plan_price_clp: '29990', billing_provider: 'flow', trial_ends_at: null,
        created_at: '2026-08-27T12:00:00.000Z',
      }] });

      const res = await request(app).get('/api/platform/tenants');

      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({
        id: 7, slug: 'acme', subscriptionStatus: 'active',
        planPriceClp: 29990, billingProvider: 'flow',
      });
      expect(res.body[0]).not.toHaveProperty('billingCustomerId');
    });

    it('solo informa si las credenciales están configuradas, nunca sus valores', async () => {
      process.env.BILLING_DEFAULT_PROVIDER = 'flow';
      process.env.FLOW_API_KEY = 'flow-key';
      process.env.FLOW_SECRET_KEY = 'flow-secret';

      const res = await request(app).get('/api/platform/billing/providers');

      expect(res.status).toBe(200);
      expect(res.body.defaultProvider).toBe('flow');
      expect(res.body.providers.find((provider) => provider.id === 'flow')).toMatchObject({ configured: true, active: true });
      expect(JSON.stringify(res.body)).not.toContain('flow-secret');

      delete process.env.BILLING_DEFAULT_PROVIDER;
      delete process.env.FLOW_API_KEY;
      delete process.env.FLOW_SECRET_KEY;
    });
  });

  // ─── POST /api/orders ───────────────────────────────────────────────────────

  describe('POST /api/orders', () => {
    it('crea orden válida → 201 con orderId, status, sku, quantity, customerId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      const res = await request(app).post('/api/orders')
        .send({ customerId: 10, sku: 'COCA-2L', quantity: 5 });
      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe(1);
      expect(res.body.status).toBe('CREATED');
      expect(res.body.sku).toBe('COCA-2L');
      expect(res.body.quantity).toBe(5);
      expect(typeof res.body.orderId).toBe('number');
    });

    it('rechaza sin customerId → 400 con error sobre customerId', async () => {
      const res = await request(app).post('/api/orders').send({ sku: 'COCA-2L', quantity: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/customerId/i);
    });

    it('rechaza sin sku → 400 con error sobre sku', async () => {
      const res = await request(app).post('/api/orders').send({ customerId: 10, quantity: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sku/i);
    });

    it('rechaza quantity = 0 → 400 con error sobre quantity', async () => {
      const res = await request(app).post('/api/orders')
        .send({ customerId: 10, sku: 'COCA-2L', quantity: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('rechaza quantity negativa → 400', async () => {
      const res = await request(app).post('/api/orders')
        .send({ customerId: 10, sku: 'COCA-2L', quantity: -3 });
      expect(res.status).toBe(400);
    });

    it('rechaza body vacío → 400', async () => {
      const res = await request(app).post('/api/orders').send({});
      expect(res.status).toBe(400);
    });

    it('retorna 500 si BD falla al crear orden', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/orders')
        .send({ customerId: 10, sku: 'COCA-2L', quantity: 5 });
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/orders ────────────────────────────────────────────────────────

  describe('GET /api/orders', () => {
    it('retorna lista de órdenes con campos correctos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].sku).toBe('COCA-2L');
      expect(res.body[0].status).toBe('CREATED');
      expect(typeof res.body[0].id).toBe('number');
    });

    it('retorna array vacío si no hay órdenes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al listar', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/orders/report ─────────────────────────────────────────────────

  describe('GET /api/orders/report (SP fn_get_orders_with_customer)', () => {
    const mockReport = [{
      order_id: 1, customer_name: 'Juan Perez', customer_email: 'juan@test.com',
      customer_phone: '999888777', sku: 'COCA-2L', quantity: 5, status: 'CREATED',
      created_at: new Date().toISOString(), assigned_to: null
    }];

    it('retorna reporte con datos de cliente (JOIN via SP)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockReport });
      const res = await request(app).get('/api/orders/report');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].customer_name).toBe('Juan Perez');
      expect(res.body[0].order_id).toBe(1);
      expect(res.body[0].status).toBe('CREATED');
    });

    it('filtra por status=CANCELADO', async () => {
      const cancelado = [{ ...mockReport[0], status: 'CANCELADO' }];
      mockQuery.mockResolvedValueOnce({ rows: cancelado });
      const res = await request(app).get('/api/orders/report?status=CANCELADO');
      expect(res.status).toBe(200);
      expect(res.body[0].status).toBe('CANCELADO');
    });

    it('filtra por status=EN_PREPARACION', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/report?status=EN_PREPARACION');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna array vacío si no hay órdenes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/report');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al generar reporte', async () => {
      mockQuery.mockRejectedValueOnce(new Error('SP error'));
      const res = await request(app).get('/api/orders/report');
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/orders/:id/status ─────────────────────────────────────────────

  describe('PUT /api/orders/:id/status', () => {
    it('actualiza status a EN_REPARTO → body tiene el status actualizado', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'EN_REPARTO' }] });
      const res = await request(app).put('/api/orders/1/status?status=EN_REPARTO');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_REPARTO');
    });

    it('acepta status en minúsculas (normaliza a CREATED uppercase)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'CREATED' }] });
      const res = await request(app).put('/api/orders/1/status?status=created');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CREATED');
    });

    it('acepta todos los statuses válidos: EN_PREPARACION', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'EN_PREPARACION' }] });
      const res = await request(app).put('/api/orders/1/status?status=EN_PREPARACION');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_PREPARACION');
    });

    it('rechaza status inválido → 400 con mensaje "Status invalido"', async () => {
      const res = await request(app).put('/api/orders/1/status?status=INVALIDO');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Status invalido/i);
    });

    it('retorna 404 si orden no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/orders/999/status?status=EN_REPARTO');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('retorna 500 si BD falla al actualizar status', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/orders/1/status?status=EN_REPARTO');
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/orders/:id/confirm (Saga) ────────────────────────────────────

  describe('PUT /api/orders/:id/confirm (saga orquestada)', () => {
    it('confirma orden: descuenta inventario, crea envío, status=EN_PREPARACION', async () => {
      const confirmed = { ...mockOrder, status: 'EN_PREPARACION' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [confirmed] });
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_PREPARACION');
      expect(res.body.warnings).toBeUndefined();
      // Saga llama exactamente 2 servicios: inventory + shipping
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('llama a inventory-service con adjust del sku y cantidad correcta', async () => {
      const confirmed = { ...mockOrder, status: 'EN_PREPARACION' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [confirmed] });
      await request(app).put('/api/orders/1/confirm');
      const inventoryCall = global.fetch.mock.calls[0][0];
      expect(inventoryCall).toMatch(/inventory/i);
      expect(inventoryCall).toMatch(/COCA-2L/);
    });

    it('retorna 404 si la orden no existe antes de confirmar', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/orders/999/confirm');
      expect(res.status).toBe(404);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('NO crea envío ni avanza status si inventory-service falla (evita enviar sin stock reservado)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Inventory unavailable'));
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CREATED');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings[0]).toMatch(/Inventario/i);
    });

    it('compensa (revierte) el stock si shipping-service falla después de descontar inventario', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // inventory adjust -quantity
        .mockRejectedValueOnce(new Error('Shipping unavailable')) // shipment create falla
        .mockResolvedValueOnce({ ok: true }); // compensacion: inventory adjust +quantity
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CREATED'); // no avanza: la saga no se completo
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const compensationCall = global.fetch.mock.calls[2][0];
      expect(compensationCall).toMatch(/inventory/i);
      expect(compensationCall).toMatch(/delta=\+5/);
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings[0]).toMatch(/Envío/i);
    });

    it('advierte revisión manual si la compensación de stock también falla', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // inventory adjust -quantity
        .mockRejectedValueOnce(new Error('Shipping unavailable')) // shipment create falla
        .mockRejectedValueOnce(new Error('Inventory unavailable')); // compensacion tambien falla
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CREATED');
      expect(res.body.warnings.some(w => /revisión manual/i.test(w))).toBe(true);
    });

    it('retorna 500 si BD falla al actualizar status tras saga', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB crash on update'));
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/orders/:id/cancel ─────────────────────────────────────────────

  describe('PUT /api/orders/:id/cancel (SP fn_cancel_order)', () => {
    it('cancela orden CREATED sin restaurar stock (no llama a inventory)', async () => {
      const cancelado = { ...mockOrder, status: 'CANCELADO', cancel_reason: 'Solicitud del cliente' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'CREATED' }] })
        .mockResolvedValueOnce({ rows: [cancelado] });
      const res = await request(app).put('/api/orders/1/cancel').send({ reason: 'Solicitud del cliente' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELADO');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('cancela orden EN_PREPARACION restaurando stock (llama a inventory)', async () => {
      const cancelado = { ...mockOrder, status: 'CANCELADO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'EN_PREPARACION' }] })
        .mockResolvedValueOnce({ rows: [cancelado] });
      const res = await request(app).put('/api/orders/1/cancel').send({ reason: 'Cambio de parecer' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELADO');
      expect(global.fetch).toHaveBeenCalled();
      const inventoryCall = global.fetch.mock.calls[0][0];
      expect(inventoryCall).toMatch(/inventory/i);
    });

    it('cancela sin reason (campo opcional)', async () => {
      const cancelado = { ...mockOrder, status: 'CANCELADO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockOrder, status: 'CREATED' }] })
        .mockResolvedValueOnce({ rows: [cancelado] });
      const res = await request(app).put('/api/orders/1/cancel').send({});
      expect(res.status).toBe(200);
    });

    it('retorna 404 si orden no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/orders/999/cancel').send({ reason: '' });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al cancelar', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockRejectedValueOnce(new Error('SP error'));
      const res = await request(app).put('/api/orders/1/cancel').send({ reason: 'test' });
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/orders/:id/assign ─────────────────────────────────────────────

  describe('PUT /api/orders/:id/assign', () => {
    it('asigna transportista → body tiene assigned_to correcto', async () => {
      const asignada = { ...mockOrder, assigned_to: 'Repartidor 1' };
      mockQuery.mockResolvedValueOnce({ rows: [asignada] });
      const res = await request(app).put('/api/orders/1/assign?transporter=Repartidor+1');
      expect(res.status).toBe(200);
      expect(res.body.assigned_to).toBe('Repartidor 1');
    });

    it('rechaza sin parámetro transporter → 400 con mensaje', async () => {
      const res = await request(app).put('/api/orders/1/assign');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/transporter/i);
    });

    it('rechaza transporter vacío → 400', async () => {
      const res = await request(app).put('/api/orders/1/assign?transporter=');
      expect(res.status).toBe(400);
    });

    it('retorna 404 si orden no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/orders/999/assign?transporter=Repartidor+1');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al asignar', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/orders/1/assign?transporter=X');
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /api/orders/:id ─────────────────────────────────────────────────

  describe('DELETE /api/orders/:id', () => {
    it('elimina orden existente → 200 con mensaje de confirmación', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      const res = await request(app).delete('/api/orders/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/eliminada/i);
    });

    it('retorna 404 si orden no existe → mensaje de error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/orders/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('retorna 500 si BD falla al eliminar', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).delete('/api/orders/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── CUSTOMERS ──────────────────────────────────────────────────────────────

  describe('GET /api/customers', () => {
    it('retorna lista de clientes con campos correctos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCustomer] });
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('Juan Perez');
      expect(res.body[0].phone).toBe('999888777');
      expect(typeof res.body[0].id).toBe('number');
    });

    it('retorna array vacío si no hay clientes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al listar clientes', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('retorna cliente por ID con todos sus campos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCustomer] });
      const res = await request(app).get('/api/customers/1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Juan Perez');
      expect(res.body.email).toBe('juan@example.com');
      expect(res.body.address).toBe('Av. Lima 123');
    });

    it('retorna 404 si cliente no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/customers/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/no encontrado/i);
    });
  });

  describe('POST /api/customers', () => {
    it('crea cliente válido → 201 con todos los campos del cliente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCustomer] });
      const res = await request(app).post('/api/customers').send({
        name: 'Juan Perez', phone: '999888777', address: 'Av. Lima 123', email: 'juan@example.com'
      });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Juan Perez');
      expect(res.body.phone).toBe('999888777');
      expect(res.body.email).toBe('juan@example.com');
      expect(typeof res.body.id).toBe('number');
    });

    it('rechaza sin nombre → 400 con mensaje sobre nombre', async () => {
      const res = await request(app).post('/api/customers').send({ phone: '999' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/nombre/i);
    });

    it('rechaza nombre vacío (solo espacios) → 400', async () => {
      const res = await request(app).post('/api/customers').send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('crea cliente solo con nombre (campos opcionales)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Solo Nombre', phone: null, address: null, email: null }] });
      const res = await request(app).post('/api/customers').send({ name: 'Solo Nombre' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Solo Nombre');
      expect(res.body.phone).toBeNull();
    });

    it('retorna 500 si BD falla al crear cliente', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/customers').send({ name: 'Test' });
      expect(res.status).toBe(500);
    });

    it('crea cliente individual (B2C) sin RUT con customer_type persistido', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockCustomer, customer_type: 'individual' }] });
      const res = await request(app).post('/api/customers').send({ name: 'Consumidor Final', customerType: 'individual' });
      expect(res.status).toBe(201);
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('individual');
    });

    it('por defecto crea cliente tipo company cuando no se envía customerType', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCustomer] });
      await request(app).post('/api/customers').send({ name: 'Empresa SA' });
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('company');
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('actualiza cliente existente → 200 con nombre actualizado', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockCustomer, name: 'Juan Actualizado' }] });
      const res = await request(app).put('/api/customers/1').send({ name: 'Juan Actualizado' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Juan Actualizado');
    });

    it('acepta y guarda la provincia', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockCustomer, province: 'Santiago' }] });
      const res = await request(app).put('/api/customers/1').send({ name: 'Juan Perez', province: 'Santiago' });
      expect(res.status).toBe(200);
      expect(res.body.province).toBe('Santiago');
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('Santiago');
    });

    it('rechaza actualización sin nombre → 400', async () => {
      const res = await request(app).put('/api/customers/1').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('retorna 404 si cliente no existe al actualizar', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/customers/999').send({ name: 'Nadie' });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al actualizar cliente', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/customers/1').send({ name: 'Test' });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('elimina cliente existente → 200 con mensaje', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCustomer] });
      const res = await request(app).delete('/api/customers/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/eliminado/i);
    });

    it('retorna 404 si cliente no existe al eliminar', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/customers/999');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al eliminar cliente', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).delete('/api/customers/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── CUENTA CORRIENTE / FIADO ───────────────────────────────────────────────

  describe('GET /api/customers/:id/credit', () => {
    it('retorna saldo y movimientos del cliente', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, credit_limit: 50000, credit_balance: 12000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, type: 'charge', amount: 12000, balance_after: 12000 }] });
      const res = await request(app).get('/api/customers/1/credit');
      expect(res.status).toBe(200);
      expect(res.body.creditBalance).toBe(12000);
      expect(res.body.movements).toHaveLength(1);
    });

    it('retorna 404 si el cliente no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/customers/999/credit');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/customers/1/credit');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/customers/:id/credit/charge', () => {
    it('registra un fiado válido → 201 con nuevo saldo y movimiento', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ new_balance: 15000, success: true, error_msg: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, type: 'charge', amount: 15000, balance_after: 15000 }] });
      const res = await request(app).post('/api/customers/1/credit/charge').send({ amount: 15000 });
      expect(res.status).toBe(201);
      expect(res.body.creditBalance).toBe(15000);
      expect(res.body.movement.type).toBe('charge');
    });

    it('rechaza amount <= 0 → 400', async () => {
      const res = await request(app).post('/api/customers/1/credit/charge').send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('rechaza si supera el límite de crédito → 400', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ new_balance: null, success: false, error_msg: 'El cargo supera el límite de crédito del cliente' }] });
      const res = await request(app).post('/api/customers/1/credit/charge').send({ amount: 999999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/límite/i);
    });

    it('retorna 404 si el cliente no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ new_balance: null, success: false, error_msg: 'Cliente no encontrado' }] });
      const res = await request(app).post('/api/customers/999/credit/charge').send({ amount: 1000 });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/customers/:id/credit/payment', () => {
    it('registra un abono válido → 201 con saldo reducido', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ new_balance: 5000, success: true, error_msg: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, type: 'payment', amount: 10000, balance_after: 5000 }] });
      const res = await request(app).post('/api/customers/1/credit/payment').send({ amount: 10000 });
      expect(res.status).toBe(201);
      expect(res.body.creditBalance).toBe(5000);
      expect(res.body.movement.type).toBe('payment');
    });

    it('rechaza amount negativo → 400', async () => {
      const res = await request(app).post('/api/customers/1/credit/payment').send({ amount: -5 });
      expect(res.status).toBe(400);
    });
  });

  // ─── SETTINGS: NEGOCIO ──────────────────────────────────────────────────────

  const mockTenant = {
    id: 1, slug: 'logify', name: 'Logify', status: 'active', plan: 'enterprise',
    contact_email: 'contacto@logify.cl', business_rut: null, business_country: null,
    business_industry: null, business_phone: null, settings: {}, used_pos_before: null,
    onboarding_goals: [], onboarding_completed_at: new Date().toISOString()
  };

  describe('GET /api/onboarding', () => {
    it('retorna el estado y los datos iniciales del tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockTenant, onboarding_completed_at: null }] });
      const res = await request(app).get('/api/onboarding');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ completed: false, name: 'Logify', goals: [] });
    });
  });

  describe('PUT /api/onboarding', () => {
    it('completa el onboarding y normaliza los objetivos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{
        ...mockTenant,
        name: 'Almacén Central',
        business_industry: 'Almacén',
        used_pos_before: false,
        onboarding_goals: ['inventario', 'ventas'],
      }] });
      const res = await request(app).put('/api/onboarding').send({
        name: 'Almacén Central', businessIndustry: 'Almacén', businessCountry: 'Chile',
        usedPosBefore: false, goals: ['inventario', 'ventas', 'ventas']
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ completed: true, usedPosBefore: false, goals: ['inventario', 'ventas'] });
      expect(mockQuery.mock.calls.at(-1)[1][6]).toBe(JSON.stringify(['inventario', 'ventas']));
    });

    it('rechaza un onboarding sin objetivo', async () => {
      const res = await request(app).put('/api/onboarding').send({
        name: 'Almacén Central', businessIndustry: 'Almacén', usedPosBefore: true, goals: []
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/business', () => {
    it('retorna los datos de negocio del tenant actual', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockTenant, business_rut: '76.123.456-7' }] });
      const res = await request(app).get('/api/settings/business');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Logify');
      expect(res.body.businessRut).toBe('76.123.456-7');
    });

    it('retorna 404 si el tenant no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/settings/business');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/settings/business', () => {
    it('actualiza los datos de negocio → 200 con datos actualizados', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockTenant, name: 'Nuevo Nombre', business_rut: '76.123.456-7' }] });
      const res = await request(app).put('/api/settings/business')
        .send({ name: 'Nuevo Nombre', businessRut: '76.123.456-7', businessCountry: 'Chile', businessIndustry: 'Kiosco', businessPhone: '+56912345678' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Nuevo Nombre');
      expect(res.body.businessRut).toBe('76.123.456-7');
    });

    it('rechaza sin nombre → 400', async () => {
      const res = await request(app).put('/api/settings/business').send({ businessRut: '76.123.456-7' });
      expect(res.status).toBe(400);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/settings/business').send({ name: 'X' });
      expect(res.status).toBe(500);
    });
  });

  // ─── SETTINGS: SISTEMA ──────────────────────────────────────────────────────

  describe('GET /api/settings/system', () => {
    it('retorna el objeto settings del tenant (vacío por defecto)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: {} }] });
      const res = await request(app).get('/api/settings/system');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('retorna los toggles ya guardados', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { cashRegisterEnabled: true, roundingEnabled: false } }] });
      const res = await request(app).get('/api/settings/system');
      expect(res.status).toBe(200);
      expect(res.body.cashRegisterEnabled).toBe(true);
    });
  });

  describe('PUT /api/settings/system', () => {
    it('mergea los toggles nuevos con los existentes → 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { cashRegisterEnabled: true } }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { cashRegisterEnabled: true, roundingEnabled: true } }] });
      const res = await request(app).put('/api/settings/system').send({ roundingEnabled: true });
      expect(res.status).toBe(200);
      expect(res.body.cashRegisterEnabled).toBe(true);
      expect(res.body.roundingEnabled).toBe(true);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/settings/system').send({ roundingEnabled: true });
      expect(res.status).toBe(500);
    });
  });

  // ─── INVITACIONES DE USUARIO ────────────────────────────────────────────────

  describe('POST /api/auth/invite', () => {
    it('crea invitación válida → 201 sin exponer el token', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ slug: 'lapercha', clerk_org_id: null }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, email: 'nuevo@empresa.com', role: 'ops', status: 'pending', expires_at: new Date().toISOString() }]
        });
      const res = await request(app).post('/api/auth/invite').send({ email: 'nuevo@empresa.com', role: 'ops' });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('nuevo@empresa.com');
      expect(res.body.token).toBeUndefined();
      expect(res.body.delivery).toBe('legacy');
    });

    it('crea la invitación en Clerk para que el rol invitado pueda iniciar sesión en app.logify.cl', async () => {
      const originalSecretKey = process.env.CLERK_SECRET_KEY;
      process.env.CLERK_SECRET_KEY = 'configured-for-invitation-test';
      mockCreateOrganizationInvitation.mockResolvedValueOnce({ id: 'orginv_123' });
      mockQuery
        .mockResolvedValueOnce({ rows: [{ slug: 'empresa', clerk_org_id: 'org_123' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 9, email: 'bodega@empresa.cl', role: 'warehouse', status: 'pending', expires_at: new Date().toISOString() }]
        });

      try {
        const res = await request(app).post('/api/auth/invite').send({ email: 'BODEGA@EMPRESA.CL', role: 'warehouse' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ email: 'bodega@empresa.cl', role: 'warehouse', delivery: 'clerk' });
        expect(mockCreateOrganizationInvitation).toHaveBeenCalledWith({
          organizationId: 'org_123',
          emailAddress: 'bodega@empresa.cl',
          role: 'org:member',
          expiresInDays: 7,
          publicMetadata: { role: 'warehouse', username: 'bodega@empresa.cl' },
          redirectUrl: 'https://app.logify.cl/accept-invitation',
        });
        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.stringContaining('clerk_invitation_id'),
          expect.arrayContaining(['orginv_123'])
        );
      } finally {
        if (originalSecretKey == null) delete process.env.CLERK_SECRET_KEY;
        else process.env.CLERK_SECRET_KEY = originalSecretKey;
      }
    });

    it('rechaza rol inválido → 400', async () => {
      const res = await request(app).post('/api/auth/invite').send({ email: 'x@x.com', role: 'root' });
      expect(res.status).toBe(400);
    });

    it('rechaza sin email → 400', async () => {
      const res = await request(app).post('/api/auth/invite').send({ role: 'ops' });
      expect(res.status).toBe(400);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/auth/invite').send({ email: 'x@x.com', role: 'ops' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/auth/invite/:token/accept', () => {
    it('acepta invitación válida → 201 con el usuario creado', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, tenant_id: 1, tenant_slug: 'lapercha', email: 'nuevo@empresa.com', role: 'ops', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // username disponible
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, username: 'nuevo.usuario', name: 'Nuevo Usuario', role: 'ops' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // marca invitación como aceptada
      const res = await request(app).post('/api/auth/invite/abc123/accept')
        .send({ username: 'nuevo.usuario', password: 'Clave123!', name: 'Nuevo Usuario' });
      expect(res.status).toBe(201);
      expect(res.body.username).toBe('nuevo.usuario');
      expect(res.body.role).toBe('ops');
      expect(res.body.tenantSlug).toBe('lapercha');
      expect(res.body.loginUrl).toBe('https://lapercha.logify.cl/login');
    });

    it('retorna 404 si el token no existe o ya expiró', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/invite/invalido/accept')
        .send({ username: 'x', password: 'Clave123!', name: 'X' });
      expect(res.status).toBe(404);
    });

    it('rechaza sin password → 400', async () => {
      const res = await request(app).post('/api/auth/invite/abc123/accept').send({ username: 'x', name: 'X' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/users (con último acceso)', () => {
    it('incluye last_login_at en cada usuario', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', name: 'Admin', role: 'owner', last_login_at: '2026-08-01T10:00:00.000Z' }] });
      const res = await request(app).get('/api/auth/users');
      expect(res.status).toBe(200);
      expect(res.body[0].last_login_at).toBe('2026-08-01T10:00:00.000Z');
    });
  });

  // ─── POST /api/auth/login ────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    const TENANT_ROW = { id: 1, slug: 'logify', status: 'active' };

    it('login correcto → 200 con token y datos del usuario', async () => {
      const hash = await bcrypt.hash('Admin123!', 10);
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', password_hash: hash, role: 'owner', name: 'Andrés Soto', rut: null, email: null }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin123!' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('test-jwt-token');
      expect(res.body.role).toBe('owner');
      expect(res.body.username).toBe('admin');
    });

    it('rechaza sin username/password → 400', async () => {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
      expect(res.status).toBe(400);
    });

    it('tenant inexistente → 401 credenciales invalidas', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'x' });
      expect(res.status).toBe(401);
    });

    it('tenant no activo → 403', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...TENANT_ROW, status: 'suspended' }] });
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'x' });
      expect(res.status).toBe(403);
    });

    it('usuario inexistente → 401', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/login').send({ username: 'noexiste', password: 'x' });
      expect(res.status).toBe(401);
    });

    it('contraseña incorrecta → 401', async () => {
      const hash = await bcrypt.hash('Correcta123!', 10);
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', password_hash: hash, role: 'owner' }] });
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Incorrecta' });
      expect(res.status).toBe(401);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'x' });
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/auth/register ─────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    const newUser = { username: 'nuevo', password: 'Clave123!', name: 'Nuevo Usuario', role: 'ops' };

    it('crea usuario valido → 201', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 5, username: 'nuevo', name: 'Nuevo Usuario', role: 'ops' }] });
      const res = await request(app).post('/api/auth/register').send(newUser);
      expect(res.status).toBe(201);
      expect(res.body.username).toBe('nuevo');
    });

    it('rechaza sin campos requeridos → 400', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'x' });
      expect(res.status).toBe(400);
    });

    it('rechaza rol invalido → 400', async () => {
      const res = await request(app).post('/api/auth/register').send({ ...newUser, role: 'super-admin' });
      expect(res.status).toBe(400);
    });

    it('retorna 409 si el usuario ya existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).post('/api/auth/register').send(newUser);
      expect(res.status).toBe(409);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).post('/api/auth/register').send(newUser);
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/auth/users/:id ──────────────────────────────────────────────────

  describe('PUT /api/auth/users/:id', () => {
    it('actualiza nombre y rol', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', name: 'Viejo', role: 'owner', password_hash: 'hash' }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', name: 'Nuevo Nombre', role: 'ops' }] });
      const res = await request(app).put('/api/auth/users/1').send({ name: 'Nuevo Nombre', role: 'ops' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Nuevo Nombre');
    });

    it('rechaza un rol invalido', async () => {
      const res = await request(app).put('/api/auth/users/1').send({ name: 'X', role: 'superadmin' });
      expect(res.status).toBe(400);
    });

    it('rechaza degradar al unico owner del tenant', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', name: 'Viejo', role: 'owner', password_hash: 'hash' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] });
      const res = await request(app).put('/api/auth/users/1').send({ name: 'Viejo', role: 'ops' });
      expect(res.status).toBe(400);
    });

    it('retorna 404 si el usuario no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/auth/users/999').send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).put('/api/auth/users/1').send({ name: 'X' });
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /api/auth/users/:id ───────────────────────────────────────────────

  describe('DELETE /api/auth/users/:id', () => {
    it('elimina usuario existente que no es el propio ni el ultimo admin', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, username: 'empleado', role: 'ops' }] }); // SELECT target
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, username: 'empleado' }] }); // DELETE ... RETURNING
      const res = await request(app).delete('/api/auth/users/2');
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('empleado');
    });

    it('retorna 404 si no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/auth/users/999');
      expect(res.status).toBe(404);
    });

    it('retorna 400 si el usuario intenta eliminar su propia cuenta', async () => {
      // req.user.sub mockeado es 'admin' (ver mock de shared/auth arriba)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', role: 'owner' }] });
      const res = await request(app).delete('/api/auth/users/1');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/propia cuenta/i);
    });

    it('retorna 400 al intentar eliminar al unico owner del tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 3, username: 'otro-owner', role: 'owner' }] }); // SELECT target
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // COUNT owners
      const res = await request(app).delete('/api/auth/users/3');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/administrador/i);
    });

    it('permite eliminar a un owner si hay mas de uno en el tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 3, username: 'otro-owner', role: 'owner' }] }); // SELECT target
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] }); // COUNT owners
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 3, username: 'otro-owner' }] }); // DELETE ... RETURNING
      const res = await request(app).delete('/api/auth/users/3');
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('otro-owner');
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).delete('/api/auth/users/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/admin/tenants/:slug/reset-owner ────────────────────────────────

  describe('POST /api/admin/tenants/:slug/reset-owner', () => {
    const ADMIN_KEY = 'test-admin-key';
    const TENANT_ROW = { id: 5, slug: 'tenant-bloqueado', status: 'active' };

    beforeAll(() => { process.env.PLATFORM_ADMIN_KEY = ADMIN_KEY; });
    afterAll(() => { delete process.env.PLATFORM_ADMIN_KEY; });

    it('retorna 401 sin la clave de administracion', async () => {
      const res = await request(app)
        .post('/api/admin/tenants/tenant-bloqueado/reset-owner')
        .send({ username: 'nuevo.owner', password: 'ClaveFuerte1!', name: 'Nuevo Owner' });
      expect(res.status).toBe(401);
    });

    it('retorna 404 si el tenant no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // resolveTenant
      const res = await request(app)
        .post('/api/admin/tenants/no-existe/reset-owner')
        .set('x-admin-key', ADMIN_KEY)
        .send({ username: 'nuevo.owner', password: 'ClaveFuerte1!', name: 'Nuevo Owner' });
      expect(res.status).toBe(404);
    });

    it('crea un owner nuevo si el username no existe en el tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TENANT_ROW] }); // resolveTenant
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT id FROM users (no existe)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 10, username: 'nuevo.owner', name: 'Nuevo Owner', role: 'owner' }] }); // INSERT
      const res = await request(app)
        .post('/api/admin/tenants/tenant-bloqueado/reset-owner')
        .set('x-admin-key', ADMIN_KEY)
        .send({ username: 'nuevo.owner', password: 'ClaveFuerte1!', name: 'Nuevo Owner' });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('owner');
      expect(res.body.tenantSlug).toBe('tenant-bloqueado');
    });

    it('resetea password y rol si el username ya existe en el tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TENANT_ROW] }); // resolveTenant
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] }); // SELECT id FROM users (existe)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, username: 'jarol.ortega', name: 'Jarol Ortega', role: 'owner' }] }); // UPDATE
      const res = await request(app)
        .post('/api/admin/tenants/tenant-bloqueado/reset-owner')
        .set('x-admin-key', ADMIN_KEY)
        .send({ username: 'jarol.ortega', password: 'ClaveFuerte1!', name: 'Jarol Ortega' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/actualizado/i);
    });

    it('retorna 400 si la contraseña no cumple requisitos minimos', async () => {
      const res = await request(app)
        .post('/api/admin/tenants/tenant-bloqueado/reset-owner')
        .set('x-admin-key', ADMIN_KEY)
        .send({ username: 'nuevo.owner', password: '123', name: 'Nuevo Owner' });
      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /api/admin/tenants/:slug ──────────────────────────────────────────

  describe('DELETE /api/admin/tenants/:slug', () => {
    const ADMIN_KEY = 'test-admin-key';
    const TENANT_ROW = { id: 9, slug: 'la-isla-barber-studio', status: 'active' };

    beforeAll(() => { process.env.PLATFORM_ADMIN_KEY = ADMIN_KEY; });
    afterAll(() => { delete process.env.PLATFORM_ADMIN_KEY; });

    it('retorna 401 sin la clave de administracion', async () => {
      const res = await request(app).delete('/api/admin/tenants/la-isla-barber-studio')
        .send({ confirmSlug: 'la-isla-barber-studio' });
      expect(res.status).toBe(401);
    });

    it('retorna 400 si se intenta eliminar el tenant demo de la plataforma', async () => {
      const res = await request(app).delete('/api/admin/tenants/logify')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'logify' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si confirmSlug no coincide con el slug de la URL', async () => {
      const res = await request(app).delete('/api/admin/tenants/la-isla-barber-studio')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'otro-slug' });
      expect(res.status).toBe(400);
    });

    it('retorna 404 si el tenant no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // resolveTenant
      const res = await request(app).delete('/api/admin/tenants/no-existe')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'no-existe' });
      expect(res.status).toBe(404);
    });

    it('retorna 502 y no toca datos locales si falla la purga de un servicio remoto', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TENANT_ROW] }); // resolveTenant
      global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });
      const res = await request(app).delete('/api/admin/tenants/la-isla-barber-studio')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'la-isla-barber-studio' });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/inventory-service/i);
    });

    it('retorna 502 si no se puede contactar a un servicio remoto', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TENANT_ROW] }); // resolveTenant
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app).delete('/api/admin/tenants/la-isla-barber-studio')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'la-isla-barber-studio' });
      expect(res.status).toBe(502);
    });

    it('purga los 3 servicios remotos y los datos locales, y elimina el tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TENANT_ROW] }); // resolveTenant
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ counts: { x: 1 } }) });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // deletes locales dentro de la transaccion
      const res = await request(app).delete('/api/admin/tenants/la-isla-barber-studio')
        .set('x-admin-key', ADMIN_KEY)
        .send({ confirmSlug: 'la-isla-barber-studio' });
      expect(res.status).toBe(200);
      expect(res.body.tenantSlug).toBe('la-isla-barber-studio');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(res.body.purged).toHaveProperty('inventory-service');
      expect(res.body.purged).toHaveProperty('shipping-service');
      expect(res.body.purged).toHaveProperty('notification-service');
      expect(res.body.purged).toHaveProperty('orders-service');
    });
  });

  // ─── GET /api/orders/track/:clientCode (publico) ─────────────────────────────

  describe('GET /api/orders/track/:clientCode', () => {
    const TENANT_ROW = { id: 1, slug: 'logify', status: 'active' };

    it('retorna datos publicos del pedido', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [{ id: 1, sku: 'COCA-2L', quantity: 5, status: 'EN_REPARTO', client_code: 'SL-ABC123', customer_name: 'Juan Perez' }] });
      const res = await request(app).get('/api/orders/track/SL-ABC123');
      expect(res.status).toBe(200);
      expect(res.body.client_code).toBe('SL-ABC123');
      expect(res.body.customer_name).toBe('Juan Perez');
    });

    it('normaliza el codigo a mayusculas', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [{ id: 1, client_code: 'SL-ABC123' }] });
      const res = await request(app).get('/api/orders/track/sl-abc123');
      expect(res.status).toBe(200);
      expect(mockQuery.mock.calls[1][1]).toContain('SL-ABC123');
    });

    it('retorna 404 si el tenant no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/track/SL-XXX');
      expect(res.status).toBe(404);
    });

    it('retorna 404 si el codigo no existe', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [TENANT_ROW] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/track/SL-NOEXISTE');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).get('/api/orders/track/SL-ABC123');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/orders/:id ──────────────────────────────────────────────────────

  describe('GET /api/orders/:id', () => {
    it('retorna la orden por id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder, client_code: 'SL-ABC123' }] });
      const res = await request(app).get('/api/orders/1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.sku).toBe('COCA-2L');
    });

    it('retorna 404 si la orden no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/999');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).get('/api/orders/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/customers/validate-rut ──────────────────────────────────────────

  describe('GET /api/customers/validate-rut', () => {
    it('valida un RUT chileno correcto', async () => {
      const res = await request(app).get('/api/customers/validate-rut?rut=18923456-2');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.formatted).toBe('18.923.456-2');
    });

    it('detecta digito verificador incorrecto', async () => {
      const res = await request(app).get('/api/customers/validate-rut?rut=18923456-3');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    it('detecta formato invalido', async () => {
      const res = await request(app).get('/api/customers/validate-rut?rut=abc');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toMatch(/formato/i);
    });

    it('rechaza sin rut → 400', async () => {
      const res = await request(app).get('/api/customers/validate-rut');
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/customers/address-suggest ───────────────────────────────────────

  describe('GET /api/customers/address-suggest', () => {
    afterEach(() => { delete global.fetch; });

    it('retorna sugerencias normalizadas', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([{ display_name: 'Av. Lima 123, Santiago', lat: '-33.45', lon: '-70.65', address: { road: 'Av. Lima', house_number: '123', city: 'Santiago' } }])
      });
      const res = await request(app).get('/api/customers/address-suggest?q=Av+Lima+123');
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ displayName: 'Av. Lima 123, Santiago', lat: -33.45, lon: -70.65 });
    });

    it('rechaza q menor a 3 caracteres → 400', async () => {
      const res = await request(app).get('/api/customers/address-suggest?q=ab');
      expect(res.status).toBe(400);
    });

    it('retorna 500 si Nominatim falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      const res = await request(app).get('/api/customers/address-suggest?q=Av+Lima');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/orders/:id/pdf ───────────────────────────────────────────────────

  describe('GET /api/orders/:id/pdf', () => {
    it('genera un PDF con content-type application/pdf', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder, customer_name: 'Juan Perez', customer_email: 'juan@mail.cl', customer_address: 'Av. Lima 123', customer_phone: '999888777', customer_rut: '11.111.111-1' }] });
      const res = await request(app).get('/api/orders/1/pdf');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/orden-1\.pdf/);
    }, 15_000);

    it('genera PDF aunque falten datos de cliente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockOrder] });
      const res = await request(app).get('/api/orders/1/pdf');
      expect(res.status).toBe(200);
    });

    it('retorna 404 si la orden no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/orders/999/pdf');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).get('/api/orders/1/pdf');
      expect(res.status).toBe(500);
    });
  });
});

// ─── WEBHOOK DE SINCRONIZACION CON CLERK (groundwork, ver ADR-004) ──────────
describe('POST /api/webhooks/clerk', () => {
  const ORIGINAL_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  const ORIGINAL_SECRET_KEY = process.env.CLERK_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_SIGNING_SECRET === undefined) {
      delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = ORIGINAL_SIGNING_SECRET;
    }
    if (ORIGINAL_SECRET_KEY === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = ORIGINAL_SECRET_KEY;
    }
  });

  it('retorna 501 y no toca la base de datos si CLERK_WEBHOOK_SIGNING_SECRET no esta configurada', async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    const res = await request(app).post('/api/webhooks/clerk').send({ type: 'organization.created', data: {} });
    expect(res.status).toBe(501);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('retorna 400 si la firma del webhook es invalida', async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test_secret_not_matching_the_request';
    verifyWebhook.mockRejectedValueOnce(new Error('invalid signature'));
    const res = await request(app)
      .post('/api/webhooks/clerk')
      .set('svix-id', 'msg_test')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,invalid-signature')
      .send({ type: 'organization.created', data: { id: 'org_test' } });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  describe('con firma valida (verifyWebhook mockeado)', () => {
    beforeEach(() => {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test_secret';
    });

    it('crea un tenant nuevo en organization.created cuando no existe por clerk_org_id ni slug', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organization.created',
        data: { id: 'org_123', name: 'Acme SpA', slug: 'acme', public_metadata: {} }
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT tenants: no existe
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // INSERT tenants RETURNING id

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ received: true, type: 'organization.created' });
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT id, slug FROM tenants'), ['org_123', 'acme']);
      expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO tenants'), ['acme', 'Acme SpA', 'org_123']);
      // Sin CLERK_SECRET_KEY en el entorno de test, getClerkClient() retorna
      // null y el write-back de publicMetadata se salta (solo un warning) --
      // no hay una tercera query.
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('actualiza el tenant existente en organization.updated cuando ya esta vinculado por slug', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organization.updated',
        data: { id: 'org_456', name: 'Acme Renombrada', slug: 'acme', public_metadata: { tenant_id: 7, tenant_slug: 'acme' } }
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, slug: 'acme' }] }); // SELECT tenants: existe
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE tenants

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE tenants'), ['org_456', 'Acme Renombrada', 7]);
      // publicMetadata ya trae tenant_id/tenant_slug correctos -- no hace
      // falta escribir de vuelta a Clerk.
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    // Regresion del bug encontrado en auditoria de produccion (ver PR #67):
    // sin este write-back, cualquier token pedido para una Organization recien
    // creada sale con los placeholders del JWT Template sin interpolar
    // (authMiddleware lo rechaza, ver shared/clerk-auth.js).
    it('escribe tenant_id/tenant_slug en publicMetadata de la Organization cuando CLERK_SECRET_KEY esta configurada', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyWebhook.mockResolvedValueOnce({
        type: 'organization.created',
        data: { id: 'org_789', name: 'Nueva Empresa', slug: 'nueva-empresa', public_metadata: {} }
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT tenants: no existe
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 55 }] }); // INSERT tenants RETURNING id

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockUpdateOrganization).toHaveBeenCalledWith('org_789', {
        publicMetadata: { tenant_id: 55, tenant_slug: 'nueva-empresa' },
      });
    });

    it('registra un warning y no crea el usuario si organizationMembership.created llega antes de que el tenant este sincronizado', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organizationMembership.created',
        data: {
          organization: { id: 'org_sin_tenant' },
          public_user_data: { user_id: 'user_1', identifier: 'juan@acme.cl' },
          public_metadata: {}
        }
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT tenants: no encontrado

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('crea el usuario en organizationMembership.created cuando el tenant ya existe', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organizationMembership.created',
        data: {
          organization: { id: 'org_123' },
          public_user_data: { user_id: 'user_1', first_name: 'Juan', last_name: 'Perez', identifier: 'juan@acme.cl' },
          public_metadata: { role: 'vendor', username: 'juanp' }
        }
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] }); // SELECT tenants
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT users por clerk_user_id: no existe
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT users

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO users'), ['juanp', 'Juan Perez', 'vendor', 7, 'user_1']);
      expect(mockQuery).toHaveBeenNthCalledWith(4, expect.stringContaining("status='accepted'"), [7, 'juan@acme.cl']);
    });

    it('actualiza el usuario existente en organizationMembership.updated', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organizationMembership.updated',
        data: {
          organization: { id: 'org_123' },
          public_user_data: { user_id: 'user_1', first_name: 'Juan', last_name: 'Perez', identifier: 'juan@acme.cl' },
          public_metadata: { role: 'ops' }
        }
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] }); // SELECT tenants
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 42, tenant_id: 7 }] }); // SELECT users por clerk_user_id: existe, mismo tenant
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE users

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE users'), ['Juan Perez', 'ops', 42]);
      expect(mockQuery).toHaveBeenNthCalledWith(4, expect.stringContaining("status='accepted'"), [7, 'juan@acme.cl']);
    });

    // Regresion del bug encontrado en auditoria de produccion (ver PR #67):
    // sin este guard, un Clerk User con una membership en un segundo tenant
    // reasignaria tenant_id en su fila existente, moviendo en silencio su
    // acceso de un tenant a otro. Logify todavia no soporta multi-org.
    it('ignora la membership nueva (sin UPDATE) si el usuario ya pertenece a OTRO tenant', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organizationMembership.updated',
        data: {
          organization: { id: 'org_456' },
          public_user_data: { user_id: 'user_1', first_name: 'Juan', last_name: 'Perez', identifier: 'juan@otraempresa.cl' },
          public_metadata: { role: 'owner' }
        }
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 9 }] }); // SELECT tenants: org_456 -> tenant 9
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 42, tenant_id: 7 }] }); // SELECT users: mismo clerk_user_id, tenant 7 (distinto)

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      // Solo las 2 SELECT -- ningun UPDATE ni INSERT sobre users.
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('desvincula clerk_user_id en organizationMembership.deleted sin borrar la fila', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organizationMembership.deleted',
        data: { public_user_data: { user_id: 'user_1' } }
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE users SET clerk_user_id=NULL

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET clerk_user_id=NULL'), ['user_1']);
    });

    it('responde 200 sin tocar la base para tipos de evento no manejados', async () => {
      verifyWebhook.mockResolvedValueOnce({ type: 'user.deleted', data: {} });

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ received: true, type: 'user.deleted' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('retorna 500 si la base de datos falla al procesar el evento', async () => {
      verifyWebhook.mockResolvedValueOnce({
        type: 'organization.created',
        data: { id: 'org_123', name: 'Acme SpA', slug: 'acme', public_metadata: {} }
      });
      mockQuery.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(app).post('/api/webhooks/clerk').send({});

      expect(res.status).toBe(500);
    });
  });
});

// ─── BOOTSTRAP CONTRA DB VACÍA ──────────────────────────────────────────────
// Regresión del bug del 2026-08-06: al truncar `users`, seedUsers() insertaba
// filas sin tenant_id, violando el NOT NULL ya migrado por ensureTenants() y
// tumbando el servicio en un crash-loop. Este bloque ejerce seedUsers()
// directamente contra una tabla `users` vacía (COUNT(*) = 0), el mismo
// escenario real que produjo el bug, para que no pueda reaparecer en silencio.
describe('seedUsers() — arranque contra DB vacía', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('siembra los 8 usuarios demo, todos con tenant_id, cuando la tabla users está vacía', async () => {
    mockQuery.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('SELECT COUNT(*)')) {
        return Promise.resolve({ rows: [{ cnt: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await seedUsers();

    const userInserts = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users')
    );
    expect(userInserts).toHaveLength(8);
    for (const [sql] of userInserts) {
      // tenant_id va inline (VALUES ($1,$2,$3,$4,1)), no como parametro
      expect(sql).toMatch(/tenant_id/i);
      expect(sql).toMatch(/VALUES\s*\([^)]*,\s*1\)/i);
    }
  });

  it('no reinserta usuarios si la tabla ya tiene filas (evita duplicar en cada arranque)', async () => {
    mockQuery.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('SELECT COUNT(*)')) {
        return Promise.resolve({ rows: [{ cnt: '8' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await seedUsers();

    const userInserts = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users')
    );
    expect(userInserts).toHaveLength(0);
  });
});

// ─── ensureTables() / ensureTenants() — migraciones de arranque ─────────────
// Solo corren via `if (require.main === module)` (ver el bottom de index.js),
// nunca durante los tests normales -- por eso las columnas nuevas de Clerk
// (tenants.clerk_org_id, users.clerk_user_id, users.password_hash nullable)
// quedaban sin ejercitar pese a estar cubiertas por el resto de la suite.
// Ambas funciones son awaits secuenciales sin ninguna rama sobre el
// resultado de las queries, asi que ejecutarlas con el mock generico basta
// para probar que corren de punta a punta sin lanzar.
describe('ensureTables()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('corre todas las migraciones (incluidas las columnas de Clerk) sin lanzar', async () => {
    await expect(ensureTables()).resolves.toBeUndefined();

    const sqlCalls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(sqlCalls.some(sql => typeof sql === 'string' && sql.includes('users ADD COLUMN IF NOT EXISTS clerk_user_id'))).toBe(true);
    expect(sqlCalls.some(sql => typeof sql === 'string' && sql.includes('users ALTER COLUMN password_hash DROP NOT NULL'))).toBe(true);
    expect(sqlCalls.some(sql => typeof sql === 'string' && sql.includes('tenants ADD COLUMN IF NOT EXISTS clerk_org_id'))).toBe(true);
  });
});
