'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), runWithRequestId: (id, fn) => fn(), currentRequestId: jest.fn() }));
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

const { app, ensureTables, ensureTenantColumns, ensureTenantConstraints } = require('./index');

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

  // ─── POST /api/notifications/alert ──────────────────────────────────────────

  describe('POST /api/notifications/alert', () => {
    it('crea alerta de stock bajo → 201 con eventId y mensaje', async () => {
      const res = await request(app).post('/api/notifications/alert')
        .send({ sku: 'COCA-2L', name: 'Coca-Cola 2L', stock: 3, type: 'low_stock', vendor: 'Bodega' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ALERT_SENT');
      expect(res.body.eventId).toMatch(/^alert-COCA-2L-/);
      expect(res.body.message).toMatch(/bajo/i);
    });

    it('usa mensaje de stock critico cuando type=critical_stock', async () => {
      const res = await request(app).post('/api/notifications/alert')
        .send({ sku: 'SKU-1', stock: 0, type: 'critical_stock' });
      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/critico/i);
    });

    it('rechaza sin sku → 400', async () => {
      const res = await request(app).post('/api/notifications/alert').send({ stock: 3 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sku/i);
    });

    it('rechaza sin stock → 400', async () => {
      const res = await request(app).post('/api/notifications/alert').send({ sku: 'SKU-1' });
      expect(res.status).toBe(400);
    });

    it('acepta stock=0 (falsy pero definido)', async () => {
      const res = await request(app).post('/api/notifications/alert').send({ sku: 'SKU-1', stock: 0 });
      expect(res.status).toBe(201);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).post('/api/notifications/alert').send({ sku: 'SKU-1', stock: 1 });
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/notifications/weather-alert ───────────────────────────────────

  describe('GET /api/notifications/weather-alert', () => {
    const okWeather = (weatherCode) => ({
      ok: true,
      json: jest.fn().mockResolvedValue({
        current: { temperature_2m: 18, precipitation: 0, wind_speed_10m: 10, weather_code: weatherCode }
      })
    });

    afterEach(() => { delete global.fetch; });

    it('sin condiciones adversas (code<51) → alert:false, sin insertar', async () => {
      global.fetch = jest.fn().mockResolvedValue(okWeather(1));
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.status).toBe(200);
      expect(res.body.alert).toBe(false);
      expect(res.body.condition).toBe('Nublado');
    });

    it('con condiciones adversas (code>=51) → alert:true, inserta y responde eventId', async () => {
      global.fetch = jest.fn().mockResolvedValue(okWeather(61));
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.status).toBe(200);
      expect(res.body.alert).toBe(true);
      expect(res.body.condition).toBe('Lluvia');
      expect(res.body.eventId).toMatch(/^weather-/);
    });

    it('usa lat/lon por defecto de Santiago cuando no se envian', async () => {
      global.fetch = jest.fn().mockResolvedValue(okWeather(0));
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -33.4489, lon: -70.6693 });
    });

    it('respeta lat/lon enviados por query', async () => {
      global.fetch = jest.fn().mockResolvedValue(okWeather(0));
      const res = await request(app).get('/api/notifications/weather-alert?lat=-10&lon=-20');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -10, lon: -20 });
    });

    it('retorna 500 si el servicio de clima responde con error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.status).toBe(500);
    });

    it('retorna 500 si fetch lanza excepcion', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.status).toBe(500);
    });

    it.each([
      [4, 'Neblina'],
      [50, 'Lluvia'],
      [68, 'Nieve'],
      [78, 'Chubascos'],
      [83, 'Tormenta eléctrica'],
      [100, 'Desconocido'],
    ])('describe weather_code=%i como "%s"', async (code, expected) => {
      global.fetch = jest.fn().mockResolvedValue(okWeather(code));
      if (code >= 51) mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/weather-alert');
      expect(res.body.condition).toBe(expected);
    });
  });

  // ─── GET /api/notifications/report/pdf ──────────────────────────────────────

  describe('GET /api/notifications/report/pdf', () => {
    it('genera un PDF con content-type application/pdf', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockRecord] });
      const res = await request(app).get('/api/notifications/report/pdf');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/notificaciones\.pdf/);
    });

    it('genera un PDF vacio cuando no hay registros', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/notifications/report/pdf');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).get('/api/notifications/report/pdf');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/notifications/qr ───────────────────────────────────────────────

  describe('GET /api/notifications/qr', () => {
    afterEach(() => { delete global.fetch; });

    it('retorna imagen png cuando el texto es valido', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      const res = await request(app).get('/api/notifications/qr?text=LOGIFY-TRACK123');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('rechaza sin text → 400', async () => {
      const res = await request(app).get('/api/notifications/qr');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/text/i);
    });

    it('retorna 500 si el servicio de QR falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await request(app).get('/api/notifications/qr?text=ABC');
      expect(res.status).toBe(500);
    });
  });

  // ─── Push subscriptions ──────────────────────────────────────────────────────

  describe('GET /api/notifications/push/vapid-public-key', () => {
    it('retorna publicKey (null si no hay VAPID configurado)', async () => {
      const res = await request(app).get('/api/notifications/push/vapid-public-key');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('publicKey');
    });
  });

  describe('POST /api/notifications/push/subscribe', () => {
    const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'key1', auth: 'key2' } };

    it('suscribe correctamente → 201', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/notifications/push/subscribe').send(subscription);
      expect(res.status).toBe(201);
      expect(res.body.subscribed).toBe(true);
    });

    it('rechaza sin endpoint → 400', async () => {
      const { endpoint, ...sin } = subscription;
      const res = await request(app).post('/api/notifications/push/subscribe').send(sin);
      expect(res.status).toBe(400);
    });

    it('rechaza sin keys.p256dh → 400', async () => {
      const res = await request(app).post('/api/notifications/push/subscribe')
        .send({ endpoint: 'https://x.com', keys: { auth: 'a' } });
      expect(res.status).toBe(400);
    });

    it('rechaza sin keys.auth → 400', async () => {
      const res = await request(app).post('/api/notifications/push/subscribe')
        .send({ endpoint: 'https://x.com', keys: { p256dh: 'p' } });
      expect(res.status).toBe(400);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).post('/api/notifications/push/subscribe').send(subscription);
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/notifications/push/subscribe', () => {
    it('desuscribe correctamente', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const res = await request(app).delete('/api/notifications/push/subscribe')
        .send({ endpoint: 'https://push.example.com/abc' });
      expect(res.status).toBe(200);
      expect(res.body.unsubscribed).toBe(true);
    });

    it('rechaza sin endpoint → 400', async () => {
      const res = await request(app).delete('/api/notifications/push/subscribe').send({});
      expect(res.status).toBe(400);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).delete('/api/notifications/push/subscribe')
        .send({ endpoint: 'https://x.com' });
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /api/notifications ───────────────────────────────────────────────

  describe('DELETE /api/notifications', () => {
    it('vacia el historial y retorna deletedCount', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 42 });
      const res = await request(app).delete('/api/notifications');
      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(42);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).delete('/api/notifications');
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /api/admin/tenants/:tenantId/purge ────────────────────────────────

  describe('DELETE /api/admin/tenants/:tenantId/purge', () => {
    const ADMIN_KEY = 'test-admin-key';
    beforeAll(() => { process.env.PLATFORM_ADMIN_KEY = ADMIN_KEY; });
    afterAll(() => { delete process.env.PLATFORM_ADMIN_KEY; });

    it('retorna 401 sin la clave de administracion', async () => {
      const res = await request(app).delete('/api/admin/tenants/5/purge');
      expect(res.status).toBe(401);
    });

    it('retorna 400 para tenantId invalido', async () => {
      const res = await request(app).delete('/api/admin/tenants/abc/purge').set('x-admin-key', ADMIN_KEY);
      expect(res.status).toBe(400);
    });

    it('retorna 400 al intentar purgar el tenant demo (id=1)', async () => {
      const res = await request(app).delete('/api/admin/tenants/1/purge').set('x-admin-key', ADMIN_KEY);
      expect(res.status).toBe(400);
    });

    it('purga notification_records y push_subscriptions y retorna los conteos', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 4 });
      const res = await request(app).delete('/api/admin/tenants/5/purge').set('x-admin-key', ADMIN_KEY);
      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(5);
      expect(res.body.counts).toMatchObject({ notification_records: 4, push_subscriptions: 4 });
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).delete('/api/admin/tenants/5/purge').set('x-admin-key', ADMIN_KEY);
      expect(res.status).toBe(500);
    });
  });
});

// ─── BOOTSTRAP CONTRA DB VACÍA ──────────────────────────────────────────────
// Ver orders-service/src/index.test.js para el contexto del bug del 2026-08-06.
describe('bootstrap (ensureTables/ensureTenantColumns/ensureTenantConstraints) contra DB vacía', () => {
  it('corre sin lanzar excepciones cuando las tablas/columnas no existen todavía', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await ensureTables();
    await ensureTenantColumns();
    await ensureTenantConstraints();
  });
});
