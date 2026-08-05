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

  // ─── PUT /api/shipments/:id/stage — ramas EN_REPARTO/ENTREGADO con email ────

  describe('PUT /api/shipments/:id/stage — notificacion por email', () => {
    function fetchByUrl(map) {
      return jest.fn((url) => {
        for (const [pattern, response] of map) {
          if (url.includes(pattern)) return Promise.resolve(response);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('EN_REPARTO con cliente con email: sincroniza orden y envia email (demo mode)', async () => {
      const enReparto = { ...mockShipment, status: 'EN_REPARTO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [enReparto] });
      global.fetch = fetchByUrl([
        ['/api/orders/1/status', { ok: true, json: async () => ({}) }],
        ['/api/orders/1', { ok: true, json: async () => ({ client_code: 'SL-ABC123' }) }],
        ['/api/customers/10', { ok: true, json: async () => ({ name: 'Juan', email: 'juan@mail.cl' }) }],
      ]);
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_REPARTO');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_REPARTO');
    });

    it('EN_REPARTO sin customer_id: no intenta enviar email', async () => {
      const shipmentSinCliente = { ...mockShipment, customer_id: 0 };
      const enReparto = { ...shipmentSinCliente, status: 'EN_REPARTO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [shipmentSinCliente] })
        .mockResolvedValueOnce({ rows: [enReparto] });
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_REPARTO');
      expect(res.status).toBe(200);
    });

    it('EN_REPARTO: sigue OK aunque falle la sincronizacion con orders-service', async () => {
      const enReparto = { ...mockShipment, status: 'EN_REPARTO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [enReparto] });
      global.fetch = jest.fn().mockRejectedValue(new Error('orders-service down'));
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_REPARTO');
      expect(res.status).toBe(200);
    });

    it('ENTREGADO con customerCode incorrecto → 400', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = fetchByUrl([
        ['/api/orders/1', { ok: true, json: async () => ({ client_code: 'SL-REAL01' }) }],
      ]);
      const res = await request(app)
        .put('/api/shipments/1/stage?stage=ENTREGADO')
        .send({ customerCode: 'SL-EQUIVOCADO' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/código de cliente incorrecto/i);
    });

    it('ENTREGADO con RUT incorrecto → 400', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = fetchByUrl([
        ['/api/orders/1', { ok: true, json: async () => ({ client_code: 'SL-REAL01' }) }],
        ['/api/customers/10', { ok: true, json: async () => ({ rut: '11.111.111-1' }) }],
      ]);
      const res = await request(app)
        .put('/api/shipments/1/stage?stage=ENTREGADO')
        .send({ customerCode: 'SL-REAL01', recipientRut: '22.222.222-2' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/rut incorrecto/i);
    });

    it('ENTREGADO con codigo y RUT correctos → 200, envia email', async () => {
      const entregado = { ...mockShipment, status: 'ENTREGADO', customer_code: 'SL-REAL01', recipient_rut: '11.111.111-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [entregado] });
      global.fetch = fetchByUrl([
        ['/api/orders/1/status', { ok: true, json: async () => ({}) }],
        ['/api/orders/1', { ok: true, json: async () => ({ client_code: 'SL-REAL01' }) }],
        ['/api/customers/10', { ok: true, json: async () => ({ name: 'Juan', email: 'juan@mail.cl', rut: '11.111.111-1' }) }],
      ]);
      const res = await request(app)
        .put('/api/shipments/1/stage?stage=ENTREGADO')
        .send({ customerCode: 'SL-REAL01', recipientRut: '11.111.111-1' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ENTREGADO');
    });

    it('ENTREGADO sin poder validar orden (orders-service falla) igual continua', async () => {
      const entregado = { ...mockShipment, status: 'ENTREGADO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [entregado] });
      global.fetch = jest.fn().mockRejectedValue(new Error('orders-service down'));
      const res = await request(app)
        .put('/api/shipments/1/stage?stage=ENTREGADO')
        .send({ customerCode: 'X', recipientRut: 'Y' });
      expect(res.status).toBe(200);
    });

    it('CANCELADO sincroniza estado en orders-service', async () => {
      const cancelado = { ...mockShipment, status: 'CANCELADO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockShipment] })
        .mockResolvedValueOnce({ rows: [cancelado] });
      const res = await request(app).put('/api/shipments/1/stage?stage=CANCELADO');
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/status?status=CANCELADO'), expect.anything());
    });

    it('EN_PREPARACION (rama else sin sync a orders) → 200', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockShipment, status: 'CANCELADO' }] })
        .mockResolvedValueOnce({ rows: [{ ...mockShipment, status: 'EN_PREPARACION' }] });
      const res = await request(app).put('/api/shipments/1/stage?stage=EN_PREPARACION');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_PREPARACION');
    });
  });

  // ─── GET /api/shipments/:id/qr-image ────────────────────────────────────────

  describe('GET /api/shipments/:id/qr-image', () => {
    it('retorna imagen png cuando el envío existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      const res = await request(app).get('/api/shipments/1/qr-image');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('retorna 404 si el envío no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments/999/qr-image');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si el servicio de QR falla', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await request(app).get('/api/shipments/1/qr-image');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/shipments/:id/weather ──────────────────────────────────────────

  describe('GET /api/shipments/:id/weather', () => {
    const shipmentSinCliente = { ...mockShipment, customer_id: 0 };

    function weatherFetch(code) {
      return jest.fn((url) => {
        if (url.includes('open-meteo')) {
          return Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 20, relative_humidity_2m: 50, precipitation: 0, wind_speed_10m: 5, weather_code: code } }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('usa lat/lon por defecto cuando no hay query ni cliente geolocalizable', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [shipmentSinCliente] });
      global.fetch = weatherFetch(1);
      const res = await request(app).get('/api/shipments/1/weather');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -33.4489, lon: -70.6693 });
      expect(res.body.deliveryRisk).toBe('BAJO');
    });

    it('condiciones adversas → deliveryRisk ALTO con recomendacion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [shipmentSinCliente] });
      global.fetch = weatherFetch(61);
      const res = await request(app).get('/api/shipments/1/weather');
      expect(res.status).toBe(200);
      expect(res.body.deliveryRisk).toBe('ALTO');
      expect(res.body.recommendation).toMatch(/demora/i);
    });

    it('geolocaliza la direccion del cliente cuando no se pasa lat/lon', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/customers/10')) return Promise.resolve({ ok: true, json: async () => ({ address: 'Av. Siempre Viva 123' }) });
        if (url.includes('nominatim')) return Promise.resolve({ ok: true, json: async () => ([{ lat: '-33.5', lon: '-70.7' }]) });
        if (url.includes('open-meteo')) return Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 20, relative_humidity_2m: 50, precipitation: 0, wind_speed_10m: 5, weather_code: 1 } }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/weather');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -33.5, lon: -70.7 });
    });

    it('respeta lat/lon explicitos aunque el cliente tenga direccion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = weatherFetch(1);
      const res = await request(app).get('/api/shipments/1/weather?lat=-1&lon=-2');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -1, lon: -2 });
    });

    it('retorna 404 si el envío no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments/999/weather');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si el servicio de clima falla', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [shipmentSinCliente] });
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await request(app).get('/api/shipments/1/weather');
      expect(res.status).toBe(500);
    });

    it('continua con default si el geocoding del cliente falla', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/customers/10')) return Promise.reject(new Error('down'));
        if (url.includes('open-meteo')) return Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 20, relative_humidity_2m: 50, precipitation: 0, wind_speed_10m: 5, weather_code: 1 } }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/weather');
      expect(res.status).toBe(200);
      expect(res.body.location).toEqual({ lat: -33.4489, lon: -70.6693 });
    });
  });

  // ─── GET /api/shipments/:id/route ───────────────────────────────────────────

  describe('GET /api/shipments/:id/route', () => {
    const okRoute = { code: 'Ok', routes: [{ distance: 15000, duration: 1200, geometry: { type: 'LineString', coordinates: [] } }] };

    it('calcula ruta con destino explicito', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('router.project-osrm.org')) return Promise.resolve({ ok: true, json: async () => okRoute });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/route?dest_lat=-33.5&dest_lon=-70.7');
      expect(res.status).toBe(200);
      expect(res.body.distanceKm).toBe(15);
      expect(res.body.durationMin).toBe(20);
      expect(res.body.destination).toEqual({ lat: -33.5, lon: -70.7 });
    });

    it('geolocaliza destino desde la direccion del cliente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('/api/customers/10')) return Promise.resolve({ ok: true, json: async () => ({ address: 'Direccion X' }) });
        if (url.includes('nominatim')) return Promise.resolve({ ok: true, json: async () => ([{ lat: '-33.5', lon: '-70.7' }]) });
        if (url.includes('router.project-osrm.org')) return Promise.resolve({ ok: true, json: async () => okRoute });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/route');
      expect(res.status).toBe(200);
      expect(res.body.destination).toEqual({ lat: -33.5, lon: -70.7 });
    });

    it('retorna 400 si no se puede determinar destino', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockShipment, customer_id: 0 }] });
      const res = await request(app).get('/api/shipments/1/route');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/destino/i);
    });

    it('retorna 400 si OSRM no encuentra ruta', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('router.project-osrm.org')) return Promise.resolve({ ok: true, json: async () => ({ code: 'NoRoute' }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/route?dest_lat=-33.5&dest_lon=-70.7');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no se encontró ruta/i);
    });

    it('retorna 404 si el envío no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/shipments/999/route?dest_lat=1&dest_lon=1');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si OSRM responde con error http', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockShipment] });
      global.fetch = jest.fn((url) => {
        if (url.includes('router.project-osrm.org')) return Promise.resolve({ ok: false });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const res = await request(app).get('/api/shipments/1/route?dest_lat=-33.5&dest_lon=-70.7');
      expect(res.status).toBe(500);
    });
  });
});
