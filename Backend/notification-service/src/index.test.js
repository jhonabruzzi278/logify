'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../shared/security', () => ({ applySecurity: jest.fn() }));
jest.mock('../shared/shutdown', () => ({ gracefulShutdown: jest.fn() }));
jest.mock('../shared/auth', () => ({
  signToken: jest.fn().mockReturnValue('test-jwt'),
  verifyToken: jest.fn().mockReturnValue({ sub: 'admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify', 'cognito:groups': ['owner'] }),
  authMiddleware: (req, _res, next) => { req.user = { sub: 'admin', role: 'owner', tenant_id: 1, tenant_slug: 'logify', 'cognito:groups': ['owner'] }; next(); },
  requireRole: () => (req, _res, next) => next(),
  requireTenant: (req, _res, next) => { req.tenantId = req.user?.tenant_id ?? 1; next(); },
  extractRoleFromRequest: () => 'owner',
  JWT_SECRET: 'test-secret',
}));

const request = require('supertest');
const { createPool } = require('../shared/db');

const mockQuery = jest.fn();
createPool.mockReturnValue({ query: mockQuery, on: jest.fn(), end: jest.fn() });

const { app } = require('./index');

const validNotification = {
  eventId: 'evt-001',
  orderId: 1,
  customerId: 10,
  stage: 'SHIPMENT_CREATED',
  status: 'NOTIFIED',
  message: 'Pedido creado correctamente',
  sourceService: 'shipping-service',
  audience: 'BOTH',
  occurredAt: new Date().toISOString()
};

const mockRecord = {
  id: 1,
  event_id: 'evt-001',
  order_id: 1,
  customer_id: 10,
  stage: 'SHIPMENT_CREATED',
  status: 'NOTIFIED',
  message: 'Pedido creado correctamente',
  target_audience: 'BOTH',
  source_service: 'shipping-service',
  occurred_at: new Date().toISOString(),
  received_at: new Date().toISOString()
};

describe('notification-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── HEALTH ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('retorna UP con db=connected cuando BD está disponible', async () => {
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

  // ─── POST /api/notifications ────────────────────────────────────────────────

  describe('POST /api/notifications', () => {
    it('crea notificación válida → 201 con status ACCEPTED y eventId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })        // SELECT idempotencia
        .mockResolvedValueOnce({ rows: [] });        // INSERT
      const res = await request(app).post('/api/notifications').send(validNotification);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'ACCEPTED', eventId: 'evt-001' });
      expect(typeof res.body.eventId).toBe('string');
    });

    it('retorna 409 DUPLICATE para eventId+audience ya existente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // duplicado encontrado
      const res = await request(app).post('/api/notifications').send(validNotification);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ status: 'DUPLICATE', eventId: 'evt-001' });
    });

    it('retorna 409 DUPLICATE por violación de constraint único (code 23505)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(Object.assign(new Error('unique violation'), { code: '23505' }));
      const res = await request(app).post('/api/notifications').send(validNotification);
      expect(res.status).toBe(409);
      expect(res.body.status).toBe('DUPLICATE');
    });

    it('rechaza sin eventId → 400 con mensaje descriptivo', async () => {
      const { eventId, ...sin } = validNotification;
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/eventId/i);
    });

    it('rechaza sin orderId → 400', async () => {
      const { orderId, ...sin } = validNotification;
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/orderId/i);
    });

    it('rechaza sin stage → 400', async () => {
      const { stage, ...sin } = validNotification;
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/stage/i);
    });

    it('rechaza sin message → 400', async () => {
      const { message, ...sin } = validNotification;
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/message/i);
    });

    it('usa BOTH como audience por defecto cuando no se envía', async () => {
      const { audience, ...sin } = validNotification;
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ACCEPTED');
      // La 1ª consulta SELECT debe buscar con target_audience='BOTH'
      expect(mockQuery.mock.calls[0][1]).toContain('BOTH');
    });

    it('normaliza audience a mayúsculas antes de persistir', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/notifications')
        .send({ ...validNotification, audience: 'both' });
      expect(res.status).toBe(201);
      expect(mockQuery.mock.calls[0][1]).toContain('BOTH');
    });

    it('no requiere customerId (default 0)', async () => {
      const { customerId, ...sin } = validNotification;
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(201);
    });

    it('no requiere occurredAt (default NOW())', async () => {
      const { occurredAt, ...sin } = validNotification;
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/notifications').send(sin);
      expect(res.status).toBe(201);
    });

    it('retorna 500 si la BD lanza error inesperado', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/notifications').send(validNotification);
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/notifications/order/:orderId ──────────────────────────────────

  describe('GET /api/notifications/order/:orderId', () => {
    it('retorna array de eventos de una orden con campos correctos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockRecord] });
      const res = await request(app).get('/api/notifications/order/1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      const notif = res.body[0];
      expect(notif.order_id).toBe(1);
      expect(notif.stage).toBe('SHIPMENT_CREATED');
      expect(notif.target_audience).toBe('BOTH');
      expect(typeof notif.message).toBe('string');
    });

    it('retorna múltiples eventos ordenados por occurred_at', async () => {
      const events = [
        { ...mockRecord, id: 1, stage: 'SHIPMENT_CREATED' },
        { ...mockRecord, id: 2, stage: 'SHIPMENT_IN_TRANSIT' },
        { ...mockRecord, id: 3, stage: 'SHIPMENT_DELIVERED' }
      ];
      mockQuery.mockResolvedValueOnce({ rows: events });
      const res = await request(app).get('/api/notifications/order/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].stage).toBe('SHIPMENT_CREATED');
      expect(res.body[2].stage).toBe('SHIPMENT_DELIVERED');
    });

    it('retorna 404 si no hay notificaciones para la orden', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/order/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('retorna 500 si BD falla en GET /order/:orderId', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/api/notifications/order/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/notifications/audience/:audience ──────────────────────────────

  describe('GET /api/notifications/audience/:audience', () => {
    it('retorna notificaciones para audiencia CLIENT', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockRecord, target_audience: 'CLIENT' }] });
      const res = await request(app).get('/api/notifications/audience/CLIENT');
      expect(res.status).toBe(200);
      expect(res.body[0].target_audience).toBe('CLIENT');
    });

    it('retorna notificaciones para audiencia OPERATOR', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockRecord, target_audience: 'OPERATOR' }] });
      const res = await request(app).get('/api/notifications/audience/OPERATOR');
      expect(res.status).toBe(200);
      expect(res.body[0].target_audience).toBe('OPERATOR');
    });

    it('acepta BOTH en minúsculas (normaliza a uppercase)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/audience/both');
      expect(res.status).toBe(200);
    });

    it('acepta customer como alias de CLIENT', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/audience/customer');
      expect(res.status).toBe(200);
    });

    it('acepta CUSTOMER (mayúsculas) como alias de CLIENT', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/audience/CUSTOMER');
      expect(res.status).toBe(200);
    });

    it('rechaza audiencia completamente inválida → 400 con mensaje', async () => {
      const res = await request(app).get('/api/notifications/audience/UNKNOWN');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/audience invalido/i);
    });

    it('retorna array vacío cuando audiencia válida no tiene registros', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/audience/BOTH');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla en GET /audience/:audience', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/api/notifications/audience/BOTH');
      expect(res.status).toBe(500);
    });
  });
});
