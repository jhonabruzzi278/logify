'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../shared/security', () => ({ applySecurity: jest.fn() }));
jest.mock('../shared/shutdown', () => ({ gracefulShutdown: jest.fn() }));
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
const { createPool } = require('../shared/db');

const mockQuery = jest.fn();
createPool.mockReturnValue({ query: mockQuery, on: jest.fn(), end: jest.fn() });

const { app } = require('./index');

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

    it('incluye warning si inventory-service falla (saga continúa)', async () => {
      const confirmed = { ...mockOrder, status: 'EN_PREPARACION' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [confirmed] });
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Inventory unavailable'))
        .mockResolvedValueOnce({ ok: true });
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_PREPARACION');
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings[0]).toMatch(/Inventario/i);
    });

    it('incluye warning si shipping-service falla (saga continúa)', async () => {
      const confirmed = { ...mockOrder, status: 'EN_PREPARACION' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [confirmed] });
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Shipping unavailable'));
      const res = await request(app).put('/api/orders/1/confirm');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings[0]).toMatch(/Envío/i);
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
    business_industry: null, business_phone: null, settings: {}
  };

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
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, email: 'nuevo@empresa.com', role: 'ops', status: 'pending', expires_at: new Date().toISOString() }]
      });
      const res = await request(app).post('/api/auth/invite').send({ email: 'nuevo@empresa.com', role: 'ops' });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('nuevo@empresa.com');
      expect(res.body.token).toBeUndefined();
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
        rows: [{ id: 1, tenant_id: 1, email: 'nuevo@empresa.com', role: 'ops', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // username disponible
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, username: 'nuevo.usuario', name: 'Nuevo Usuario', role: 'ops' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // marca invitación como aceptada
      const res = await request(app).post('/api/auth/invite/abc123/accept')
        .send({ username: 'nuevo.usuario', password: 'Clave123!', name: 'Nuevo Usuario' });
      expect(res.status).toBe(201);
      expect(res.body.username).toBe('nuevo.usuario');
      expect(res.body.role).toBe('ops');
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
});
