'use strict';

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('uuid-1234-test') }));
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

const mockShipment = {
  id: 1, order_id: 1, customer_id: 10, sku: 'COCA-2L', quantity: 5,
  status: 'EN_PREPARACION', tracking_number: 'TRACK-UUID-123',
  created_at: new Date().toISOString(), shipped_at: null,
  customer_code: null, recipient_rut: null, proof_of_delivery_image: null
};

const validShipmentBody = { orderId: 1, customerId: 10, sku: 'COCA-2L', quantity: 5 };

describe('shipping-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });
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
      mockQuery.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DEGRADED');
    });
  });

  // ─── GET /api/shipments ─────────────────────────────────────────────────────

  describe('GET /api/shipments', () => {
    it('retorna lista de envíos con todos los campos del envío', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      const res = await request(app).get('/api/shipments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tracking_number).toBe('TRACK-UUID-123');
      expect(res.body[0].status).toBe('EN_PREPARACION');
      expect(res.body[0].sku).toBe('COCA-2L');
    });

    it('retorna array vacío si no hay envíos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al listar envíos', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/shipments');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/shipments/:orderId ────────────────────────────────────────────

  describe('GET /api/shipments/:orderId', () => {
    it('retorna envío por orderId con order_id, sku, status, tracking_number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      const res = await request(app).get('/api/shipments/1');
      expect(res.status).toBe(200);
      expect(res.body.order_id).toBe(1);
      expect(res.body.sku).toBe('COCA-2L');
      expect(res.body.status).toBe('EN_PREPARACION');
      expect(typeof res.body.tracking_number).toBe('string');
    });

    it('retorna 404 con error si no existe envío para esa orden', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/no encontrado/i);
    });

    it('retorna 500 si BD falla al buscar por orderId', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/shipments/1');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/shipments ────────────────────────────────────────────────────

  describe('POST /api/shipments', () => {
    it('crea envío válido → 201 con tracking_number formato TRACK-*', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockShipment] });
      const res = await request(app).post('/api/shipments').send(validShipmentBody);
      expect(res.status).toBe(201);
      expect(res.body.tracking_number).toMatch(/^TRACK-/);
      expect(res.body.status).toBe('EN_PREPARACION');
      expect(res.body.order_id).toBe(1);
    });

    it('crea envío y llama exactamente 1 vez al notification-service', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockShipment] });
      const res = await request(app).post('/api/shipments').send(validShipmentBody);
      expect(res.status).toBe(201);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('crea envío sin customerId (campo opcional, default 0)', async () => {
      const { customerId, ...sinCustId } = validShipmentBody;
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...mockShipment, customer_id: 0 }] });
      const res = await request(app).post('/api/shipments').send(sinCustId);
      expect(res.status).toBe(201);
      expect(res.body.order_id).toBe(1);
    });

    it('rechaza sin orderId → 400 con mensaje sobre orderId', async () => {
      const { orderId, ...sin } = validShipmentBody;
      const res = await request(app).post('/api/shipments').send(sin);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/orderId/i);
    });

    it('rechaza sin sku → 400', async () => {
      const { sku, ...sin } = validShipmentBody;
      const res = await request(app).post('/api/shipments').send(sin);
      expect(res.status).toBe(400);
    });

    it('rechaza sin quantity → 400', async () => {
      const { quantity, ...sin } = validShipmentBody;
      const res = await request(app).post('/api/shipments').send(sin);
      expect(res.status).toBe(400);
    });

    it('retorna 409 con mensaje si ya existe envío para la orden', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).post('/api/shipments').send(validShipmentBody);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Ya existe envío/i);
    });

    it('sigue creando envío aunque notification-service falle', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn().mockRejectedValue(new Error('Notification service down'));
      const res = await request(app).post('/api/shipments').send(validShipmentBody);
      expect(res.status).toBe(201);
    });

    it('retorna 500 si BD falla al crear el envío', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/shipments').send(validShipmentBody);
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/shipments/:id/stage ──────────────────────────────────────────

  describe('PUT /api/shipments/:id/stage', () => {
    it('cambia a EN_REPARTO → body status=EN_REPARTO, notifica 1 vez', async () => {
      const enReparto = { ...mockShipment, status: 'EN_REPARTO', shipped_at: new Date().toISOString() };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [enReparto] });
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_REPARTO');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_REPARTO');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('cambia a ENTREGADO con datos de entrega → body tiene customer_code y recipient_rut', async () => {
      const entregado = { ...mockShipment, status: 'ENTREGADO', customer_code: 'C123', recipient_rut: '12.345.678-9' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [entregado] });
      const res = await request(app)
        .put('/api/shipments/1/stage?stage=ENTREGADO')
        .send({ customerCode: 'C123', recipientRut: '12.345.678-9' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ENTREGADO');
      expect(res.body.customer_code).toBe('C123');
      expect(res.body.recipient_rut).toBe('12.345.678-9');
    });

    it('cambia a CANCELADO → body status=CANCELADO', async () => {
      const cancelado = { ...mockShipment, status: 'CANCELADO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [cancelado] });
      const res = await request(app).put('/api/shipments/1/stage?stage=CANCELADO');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELADO');
    });

    it('acepta stage en minúsculas (normaliza a uppercase)', async () => {
      const enReparto = { ...mockShipment, status: 'EN_REPARTO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [enReparto] });
      const res = await request(app).put('/api/shipments/1/stage?stage=en_reparto');
      expect(res.status).toBe(200);
    });

    it('rechaza stage inválido → 400 con mensaje Stage invalido', async () => {
      const res = await request(app).put('/api/shipments/1/stage?stage=INVALIDO');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Stage invalido/i);
    });

    it('rechaza sin parámetro stage → 400', async () => {
      const res = await request(app).put('/api/shipments/1/stage');
      expect(res.status).toBe(400);
    });

    it('retorna 404 si el envío no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/shipments/999/stage?stage=EN_REPARTO');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al cambiar stage', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_REPARTO');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/shipments/:id/qr ──────────────────────────────────────────────

  describe('GET /api/shipments/:id/qr', () => {
    it('retorna código QR con formato LOGIFY-{tracking_number}', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      const res = await request(app).get('/api/shipments/1/qr');
      expect(res.status).toBe(200);
      expect(res.body.qrCode).toBe('LOGIFY-TRACK-UUID-123');
      expect(res.body.qrCode).toMatch(/^LOGIFY-TRACK-/);
    });

    it('retorna 404 con error si envío no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments/999/qr');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('retorna 500 si BD falla al obtener QR', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/shipments/1/qr');
      expect(res.status).toBe(500);
    });
  });
});
