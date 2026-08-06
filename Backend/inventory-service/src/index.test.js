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
const mockClientRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockClientRelease };
createPool.mockReturnValue({ query: mockQuery, connect: jest.fn().mockResolvedValue(mockClient), on: jest.fn(), end: jest.fn() });

const { app, ensureTables, ensureTenantColumns, ensureTenantConstraints } = require('./index');

const mockProduct = { id: 1, sku: 'COCA-2L', stock: 50 };
const mockSale = { id: 1, sku: 'COCA-2L', quantity: 5, sale_date: new Date().toISOString() };

const spOk  = (sku, stock, delta) => ({ sku_out: sku, new_stock: stock, delta, success: true,  error_msg: null });
const spFail = (sku, delta, msg)  => ({ sku_out: sku, new_stock: null,  delta, success: false, error_msg: msg });

describe('inventory-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
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

  // ─── GET /api/inventory ─────────────────────────────────────────────────────

  describe('GET /api/inventory', () => {
    it('retorna lista de productos con sku y stock', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockProduct] });
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].sku).toBe('COCA-2L');
      expect(res.body[0].stock).toBe(50);
      expect(typeof res.body[0].id).toBe('number');
    });

    it('retorna array vacío si inventario está vacío', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al listar inventario', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/inventory/report ──────────────────────────────────────────────

  describe('GET /api/inventory/report (SP fn_get_inventory_report)', () => {
    const mockReport = [
      { sku: 'COCA-2L', stock: 0,  stock_level: 'SIN_STOCK' },
      { sku: 'AGUA-500', stock: 5, stock_level: 'CRITICO'   },
      { sku: 'JUGO-1L', stock: 50, stock_level: 'NORMAL'    }
    ];

    it('retorna reporte con clasificación de stock por nivel', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockReport });
      const res = await request(app).get('/api/inventory/report');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].stock_level).toBe('SIN_STOCK');
      expect(res.body[1].stock_level).toBe('CRITICO');
      expect(res.body[2].stock_level).toBe('NORMAL');
    });

    it('retorna sku y stock correcto para cada producto del reporte', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockReport[2]] });
      const res = await request(app).get('/api/inventory/report');
      expect(res.body[0].sku).toBe('JUGO-1L');
      expect(res.body[0].stock).toBe(50);
    });

    it('retorna array vacío si no hay inventario', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/inventory/report');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al ejecutar SP de reporte', async () => {
      mockQuery.mockRejectedValueOnce(new Error('SP error'));
      const res = await request(app).get('/api/inventory/report');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/inventory/:sku ────────────────────────────────────────────────

  describe('GET /api/inventory/:sku', () => {
    it('retorna producto por SKU con id, sku y stock correctos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockProduct] });
      const res = await request(app).get('/api/inventory/COCA-2L');
      expect(res.status).toBe(200);
      expect(res.body.sku).toBe('COCA-2L');
      expect(res.body.stock).toBe(50);
      expect(res.body.id).toBe(1);
    });

    it('retorna 404 con mensaje si SKU no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/inventory/NO-EXISTE');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/SKU no encontrado/i);
    });

    it('retorna 500 si BD falla al buscar por SKU', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/inventory/COCA-2L');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/inventory ────────────────────────────────────────────────────

  describe('POST /api/inventory', () => {
    it('crea producto válido → 201 con sku y stock correctos', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockProduct] });
      const res = await request(app).post('/api/inventory').send({ sku: 'COCA-2L', stock: 50 });
      expect(res.status).toBe(201);
      expect(res.body.sku).toBe('COCA-2L');
      expect(res.body.stock).toBe(50);
      expect(typeof res.body.id).toBe('number');
    });

    it('rechaza sin sku → 400 con mensaje sobre sku', async () => {
      const res = await request(app).post('/api/inventory').send({ stock: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sku/i);
    });

    it('rechaza sin stock → 400', async () => {
      const res = await request(app).post('/api/inventory').send({ sku: 'SKU-001' });
      expect(res.status).toBe(400);
    });

    it('crea producto con stock=0 (válido para catálogo)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2, sku: 'NUEVO', stock: 0 }] });
      const res = await request(app).post('/api/inventory').send({ sku: 'NUEVO', stock: 0 });
      expect(res.status).toBe(201);
      expect(res.body.stock).toBe(0);
    });

    it('retorna 409 con mensaje si SKU ya existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).post('/api/inventory').send({ sku: 'COCA-2L', stock: 50 });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/ya existe/i);
    });

    it('retorna 500 si BD falla al crear producto', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/inventory').send({ sku: 'NUEVO', stock: 10 });
      expect(res.status).toBe(500);
    });

    it('acepta proveedor, unidad de medida, IVA y variante al crear', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, sku: 'POLERA-M', supplier_id: 3, unit_of_measure: 'unidad', tax_rate: 19, parent_sku: 'POLERA', variant_label: 'Talla M' }] });
      const res = await request(app).post('/api/inventory').send({
        sku: 'POLERA-M', stock: 10, supplierId: 3, unitOfMeasure: 'unidad', taxRate: 19,
        parentSku: 'POLERA', variantLabel: 'Talla M'
      });
      expect(res.status).toBe(201);
      const [, params] = mockQuery.mock.calls[1];
      expect(params).toContain(3);
      expect(params).toContain('Talla M');
    });
  });

  describe('PUT /api/inventory/:sku/details', () => {
    it('actualiza los datos ampliados del producto → 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockProduct, name: 'Coca Cola 2L', supplier_id: 3, active: false }] });
      const res = await request(app).put('/api/inventory/COCA-2L/details').send({
        name: 'Coca Cola 2L', category: 'bebidas', price: 2500, cost: 1500,
        supplierId: 3, unitOfMeasure: 'unidad', taxRate: 19, active: false
      });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Coca Cola 2L');
      expect(res.body.active).toBe(false);
    });

    it('retorna 404 si el SKU no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/inventory/NO-EXISTE/details').send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    it('rechaza sin nombre → 400', async () => {
      const res = await request(app).put('/api/inventory/COCA-2L/details').send({ category: 'bebidas' });
      expect(res.status).toBe(400);
    });
  });

  // ─── PUT /api/inventory/:sku ────────────────────────────────────────────────

  describe('PUT /api/inventory/:sku', () => {
    it('actualiza stock → 200 con stock actualizado en body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockProduct, stock: 100 }] });
      const res = await request(app).put('/api/inventory/COCA-2L').send({ stock: 100 });
      expect(res.status).toBe(200);
      expect(res.body.stock).toBe(100);
      expect(res.body.sku).toBe('COCA-2L');
    });

    it('rechaza stock negativo → 400', async () => {
      const res = await request(app).put('/api/inventory/COCA-2L').send({ stock: -5 });
      expect(res.status).toBe(400);
    });

    it('rechaza stock no numérico → 400', async () => {
      const res = await request(app).put('/api/inventory/COCA-2L').send({ stock: 'mucho' });
      expect(res.status).toBe(400);
    });

    it('rechaza body sin campo stock → 400', async () => {
      const res = await request(app).put('/api/inventory/COCA-2L').send({});
      expect(res.status).toBe(400);
    });

    it('acepta stock=0 (producto sin existencias)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockProduct, stock: 0 }] });
      const res = await request(app).put('/api/inventory/COCA-2L').send({ stock: 0 });
      expect(res.status).toBe(200);
      expect(res.body.stock).toBe(0);
    });

    it('retorna 404 si SKU no existe al actualizar', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/inventory/NO-EXISTE').send({ stock: 10 });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al actualizar stock', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).put('/api/inventory/COCA-2L').send({ stock: 50 });
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /api/inventory/:sku ─────────────────────────────────────────────

  describe('DELETE /api/inventory/:sku', () => {
    it('elimina producto por SKU → 200 con deleted=true y sku', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockProduct] });
      const res = await request(app).delete('/api/inventory/COCA-2L');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(res.body.sku).toBe('COCA-2L');
    });

    it('retorna 404 si SKU no existe al eliminar', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/inventory/NO-EXISTE');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla al eliminar', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).delete('/api/inventory/COCA-2L');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/inventory/:sku/adjust (SP fn_adjust_stock) ──────────────────

  describe('POST /api/inventory/:sku/adjust (SP fn_adjust_stock)', () => {
    it('incrementa stock (delta positivo) → 200 con delta y stock nuevos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [spOk('COCA-2L', 60, 10)] });
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=10');
      expect(res.status).toBe(200);
      expect(res.body.delta).toBe(10);
      expect(res.body.stock).toBe(60);
      expect(res.body.sku).toBe('COCA-2L');
    });

    it('decrementa stock y registra movimiento (delta negativo)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [spOk('COCA-2L', 45, -5)] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=-5');
      expect(res.status).toBe(200);
      expect(res.body.delta).toBe(-5);
      expect(res.body.stock).toBe(45);
    });

    it('rechaza delta=0 → 400 con mensaje non-zero', async () => {
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/non-zero/i);
    });

    it('rechaza delta no numérico → 400', async () => {
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=abc');
      expect(res.status).toBe(400);
    });

    it('rechaza delta sin parámetro → 400', async () => {
      const res = await request(app).post('/api/inventory/COCA-2L/adjust');
      expect(res.status).toBe(400);
    });

    it('retorna 400 con mensaje si stock insuficiente (SP retorna success=false)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [spFail('COCA-2L', -100, 'Stock insuficiente')] });
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=-100');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insuficiente/i);
    });

    it('retorna 404 con mensaje si SKU no existe (SP retorna success=false)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [spFail('NO-EXISTE', -5, 'SKU no encontrado')] });
      const res = await request(app).post('/api/inventory/NO-EXISTE/adjust?delta=-5');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/no encontrado/i);
    });

    it('retorna 500 si BD falla al ejecutar SP de ajuste', async () => {
      mockQuery.mockRejectedValueOnce(new Error('SP crash'));
      const res = await request(app).post('/api/inventory/COCA-2L/adjust?delta=10');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/sales ─────────────────────────────────────────────────────────

  describe('GET /api/sales', () => {
    it('retorna ventas agrupadas con items (JSON), total y createdAt', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSale] });
      const res = await request(app).get('/api/sales');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const sale = res.body[0];
      expect(typeof sale.items).toBe('string');
      const items = JSON.parse(sale.items);
      expect(items[0].sku).toBe('COCA-2L');
      expect(items[0].quantity).toBe(5);
      expect(typeof sale.createdAt).toBe('string');
      expect(typeof sale.total).toBe('number');
    });

    it('agrupa en una sola venta las filas que comparten sale_group', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [
        { id: 1, sku: 'COCA-2L', quantity: 2, unit_price: 2500, total: 5000, sale_group: 'POS-1', payment_method: 'cash', vendor_id: 'v1', vendor_name: 'María', sale_date: new Date().toISOString() },
        { id: 2, sku: 'PAN-500', quantity: 1, unit_price: 1000, total: 1000, sale_group: 'POS-1', payment_method: 'cash', vendor_id: 'v1', vendor_name: 'María', sale_date: new Date().toISOString() },
      ] });
      const res = await request(app).get('/api/sales');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(JSON.parse(res.body[0].items)).toHaveLength(2);
      expect(res.body[0].total).toBe(6000);
    });

    it('retorna array vacío si no hay ventas', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/sales');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('retorna 500 si BD falla al listar ventas', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/sales');
      expect(res.status).toBe(500);
    });

    it('expone unitCost por item cuando la venta tiene costo guardado', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [
        { id: 1, sku: 'COCA-2L', quantity: 1, unit_price: 2500, total: 2500, cost: 1500, sale_date: new Date().toISOString() },
      ] });
      const res = await request(app).get('/api/sales');
      const items = JSON.parse(res.body[0].items);
      expect(items[0].unitCost).toBe(1500);
    });

    it('unitCost queda null en ventas antiguas sin costo guardado', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSale] });
      const res = await request(app).get('/api/sales');
      const items = JSON.parse(res.body[0].items);
      expect(items[0].unitCost).toBeNull();
    });
  });

  // ─── POST /api/sales ────────────────────────────────────────────────────────

  describe('POST /api/sales', () => {
    it('registra venta válida → 201 con sku y quantity', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, stock: 45 }] }) // stock disponible
        .mockResolvedValueOnce({ rows: [mockSale] });                      // INSERT venta
      const res = await request(app).post('/api/sales').send({ sku: 'COCA-2L', quantity: 5 });
      expect(res.status).toBe(201);
      expect(res.body.sku).toBe('COCA-2L');
      expect(res.body.quantity).toBe(5);
    });

    it('rechaza sin sku → 400', async () => {
      const res = await request(app).post('/api/sales').send({ quantity: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sku/i);
    });

    it('rechaza sin quantity → 400', async () => {
      const res = await request(app).post('/api/sales').send({ sku: 'COCA-2L' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 con mensaje si stock insuficiente', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })         // stock=0 o insuficiente
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(app).post('/api/sales').send({ sku: 'COCA-2L', quantity: 999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insuficiente/i);
    });

    it('retorna 404 si SKU no existe en inventario', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/sales').send({ sku: 'NO-EXISTE', quantity: 1 });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla durante la venta', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, stock: 45 }] })
        .mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).post('/api/sales').send({ sku: 'COCA-2L', quantity: 5 });
      expect(res.status).toBe(500);
    });

    it('persiste customerId/customerName cuando la venta es a fiado', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock: 10 }] }) // FOR UPDATE lock (flujo multi-item)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
        .mockResolvedValueOnce({ rows: [{ ...mockSale, customer_id: 7, customer_name: 'Consumidor Final' }] }); // INSERT venta
      const res = await request(app).post('/api/sales').send({
        items: [{ sku: 'COCA-2L', quantity: 1, unitPrice: 2500, subtotal: 2500 }],
        paymentMethod: 'credit', customerId: 7, customerName: 'Consumidor Final', total: 2500,
      });
      expect(res.status).toBe(201);
      const insertCall = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales'));
      expect(insertCall[1]).toContain(7);
      expect(insertCall[1]).toContain('Consumidor Final');
    });

    it('guarda el costo del producto vigente al momento de la venta (para ganancia real en Reportes)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock: 10, cost: 1500 }] }) // FOR UPDATE lock, incluye cost
        .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
        .mockResolvedValueOnce({ rows: [{ ...mockSale, unit_price: 2500, cost: 1500 }] }); // INSERT venta
      const res = await request(app).post('/api/sales').send({
        items: [{ sku: 'COCA-2L', quantity: 1, unitPrice: 2500, subtotal: 2500 }],
        paymentMethod: 'cash', total: 2500,
      });
      expect(res.status).toBe(201);
      const insertCall = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales'));
      expect(insertCall[1]).toContain(1500);
    });

    it('acepta una línea manual (Agregar Monto/Descuento) sin validar stock ni requerir un SKU real', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...mockSale, sku: 'Descuento', unit_price: -500, total: -500 }] }); // INSERT venta (sin SELECT/UPDATE de inventory)
      const res = await request(app).post('/api/sales').send({
        items: [{ sku: 'Descuento', quantity: 1, unitPrice: -500, subtotal: -500, isManualAmount: true }],
        paymentMethod: 'cash', total: -500,
      });
      expect(res.status).toBe(201);
      const calls = mockQuery.mock.calls.map(([sql]) => sql);
      expect(calls.some((sql) => sql.includes('FOR UPDATE'))).toBe(false);
      expect(calls.some((sql) => sql.includes('UPDATE inventory SET stock'))).toBe(false);
    });

    it('combina un producto real con una línea manual en la misma venta', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock: 10, cost: 1500 }] }) // FOR UPDATE del producto real
        .mockResolvedValueOnce({ rows: [] }) // UPDATE stock del producto real
        .mockResolvedValueOnce({ rows: [{ ...mockSale, unit_price: 2500 }] }) // INSERT producto real
        .mockResolvedValueOnce({ rows: [{ ...mockSale, sku: 'Recargo', unit_price: 200 }] }); // INSERT línea manual
      const res = await request(app).post('/api/sales').send({
        items: [
          { sku: 'COCA-2L', quantity: 1, unitPrice: 2500, subtotal: 2500 },
          { sku: 'Recargo', quantity: 1, unitPrice: 200, subtotal: 200, isManualAmount: true },
        ],
        paymentMethod: 'cash', total: 2700,
      });
      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(2);
    });
  });

  // ─── GET /api/sales/close-summary (cierre de caja) ─────────────────────────

  describe('GET /api/sales/close-summary', () => {
    it('retorna el desglose por método de pago y el total general', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [
        { payment_method: 'cash', count: '3', total: '9000' },
        { payment_method: 'credit', count: '1', total: '2500' },
      ] });
      const res = await request(app).get('/api/sales/close-summary');
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual([
        { paymentMethod: 'cash', count: 3, total: 9000 },
        { paymentMethod: 'credit', count: 1, total: 2500 },
      ]);
      expect(res.body.grandTotal).toBe(11500);
    });

    it('retorna un desglose vacío y grandTotal 0 si no hubo ventas', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/sales/close-summary');
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual([]);
      expect(res.body.grandTotal).toBe(0);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/sales/close-summary');
      expect(res.status).toBe(500);
    });
  });

  // ─── PROVEEDORES ────────────────────────────────────────────────────────────

  const mockSupplier = { id: 1, name: 'Distribuidora Andes', rut: '76.123.456-7', phone: '+56912345678', email: 'ventas@andes.cl', address: 'Ruta 5 Km 10', active: true };

  describe('GET /api/suppliers', () => {
    it('retorna lista de proveedores', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSupplier] });
      const res = await request(app).get('/api/suppliers');
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('Distribuidora Andes');
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/suppliers');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/suppliers', () => {
    it('crea proveedor válido → 201', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSupplier] });
      const res = await request(app).post('/api/suppliers').send({ name: 'Distribuidora Andes', rut: '76.123.456-7' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Distribuidora Andes');
    });

    it('rechaza sin nombre → 400', async () => {
      const res = await request(app).post('/api/suppliers').send({ rut: '76.123.456-7' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/suppliers/:id', () => {
    it('retorna proveedor por id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSupplier] });
      const res = await request(app).get('/api/suppliers/1');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Distribuidora Andes');
    });

    it('retorna 404 si no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/suppliers/999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/suppliers/:id', () => {
    it('actualiza proveedor → 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockSupplier, name: 'Andes SPA' }] });
      const res = await request(app).put('/api/suppliers/1').send({ name: 'Andes SPA' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Andes SPA');
    });

    it('retorna 404 si no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/suppliers/999').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/suppliers/:id', () => {
    it('elimina proveedor → 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSupplier] });
      const res = await request(app).delete('/api/suppliers/1');
      expect(res.status).toBe(200);
    });

    it('retorna 404 si no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/suppliers/999');
      expect(res.status).toBe(404);
    });
  });

  // ─── COMPRAS A PROVEEDOR ────────────────────────────────────────────────────

  const mockPurchase = { id: 1, tenant_id: 1, sku: 'COCA-2L', supplier_id: 1, unit_cost: '1500', quantity: 10, subtotal: '15000', update_prices: true, purchased_at: new Date().toISOString(), created_by: 'admin' };

  describe('GET /api/purchases', () => {
    it('retorna el historial de compras', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockPurchase, product_name: 'Coca-Cola 2L', unit_of_measure: 'unidad', supplier_name: 'Distribuidora Andes' }] });
      const res = await request(app).get('/api/purchases');
      expect(res.status).toBe(200);
      expect(res.body[0].product_name).toBe('Coca-Cola 2L');
    });

    it('filtra por texto de búsqueda (producto/unidad/usuario)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/purchases?q=coca');
      expect(res.status).toBe(200);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/ILIKE/);
      expect(params).toContain('%coca%');
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB crash'));
      const res = await request(app).get('/api/purchases');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/purchases', () => {
    it('registra una compra válida → 201, sube stock y actualiza costo si updatePrices=true', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L' }] }) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
        .mockResolvedValueOnce({ rows: [] }) // UPDATE cost
        .mockResolvedValueOnce({ rows: [mockPurchase] }); // INSERT purchases
      const res = await request(app).post('/api/purchases').send({
        sku: 'COCA-2L', supplierId: 1, unitCost: 1500, quantity: 10, updatePrices: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.subtotal).toBe('15000');
      const updateCostCall = mockQuery.mock.calls.find(([sql]) => sql.includes('SET cost='));
      expect(updateCostCall).toBeDefined();
      expect(updateCostCall[1]).toContain(1500);
    });

    it('no actualiza el costo cuando updatePrices no viene o es false', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L' }] }) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
        .mockResolvedValueOnce({ rows: [mockPurchase] }); // INSERT purchases
      const res = await request(app).post('/api/purchases').send({ sku: 'COCA-2L', unitCost: 1500, quantity: 10 });
      expect(res.status).toBe(201);
      const updateCostCall = mockQuery.mock.calls.find(([sql]) => sql.includes('SET cost='));
      expect(updateCostCall).toBeUndefined();
    });

    it('rechaza sin sku → 400', async () => {
      const res = await request(app).post('/api/purchases').send({ unitCost: 1500, quantity: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sku/i);
    });

    it('rechaza unitCost <= 0 → 400', async () => {
      const res = await request(app).post('/api/purchases').send({ sku: 'COCA-2L', unitCost: 0, quantity: 10 });
      expect(res.status).toBe(400);
    });

    it('rechaza quantity < 1 → 400', async () => {
      const res = await request(app).post('/api/purchases').send({ sku: 'COCA-2L', unitCost: 1500, quantity: 0 });
      expect(res.status).toBe(400);
    });

    it('retorna 404 si el SKU no existe (y hace rollback)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT ... FOR UPDATE -> no existe
      const res = await request(app).post('/api/purchases').send({ sku: 'NO-EXISTE', unitCost: 1500, quantity: 10 });
      expect(res.status).toBe(404);
    });

    it('retorna 500 y hace rollback si BD falla a mitad de la transacción', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L' }] }) // SELECT ... FOR UPDATE
        .mockRejectedValueOnce(new Error('DB crash')); // UPDATE stock falla
      const res = await request(app).post('/api/purchases').send({ sku: 'COCA-2L', unitCost: 1500, quantity: 10 });
      expect(res.status).toBe(500);
    });
  });

  // ─── SESIONES DE CAJA ───────────────────────────────────────────────────────

  const mockCashSession = { id: 1, tenant_id: 1, vendor_id: 'admin', vendor_name: 'admin', opening_amount: '50000', opened_at: new Date().toISOString(), status: 'open' };

  describe('GET /api/cash-sessions/active', () => {
    it('retorna la sesión abierta del vendedor actual', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCashSession] });
      const res = await request(app).get('/api/cash-sessions/active');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('open');
    });

    it('retorna null si no hay sesión abierta', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/cash-sessions/active');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('POST /api/cash-sessions (abrir caja)', () => {
    it('abre una caja válida → 201', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no hay sesión abierta
        .mockResolvedValueOnce({ rows: [mockCashSession] }); // INSERT
      const res = await request(app).post('/api/cash-sessions').send({ openingAmount: 50000 });
      expect(res.status).toBe(201);
      expect(res.body.opening_amount).toBe('50000');
    });

    it('rechaza openingAmount negativo → 400', async () => {
      const res = await request(app).post('/api/cash-sessions').send({ openingAmount: -1 });
      expect(res.status).toBe(400);
    });

    it('rechaza abrir una segunda caja mientras hay una abierta → 409', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ya hay una abierta
      const res = await request(app).post('/api/cash-sessions').send({ openingAmount: 50000 });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/cash-sessions/:id/close', () => {
    it('cierra la caja y calcula la diferencia correctamente', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockCashSession] }) // sesión abierta
        .mockResolvedValueOnce({ rows: [{ total: '20000' }] }) // ventas en efectivo desde apertura
        .mockResolvedValueOnce({ rows: [{ ...mockCashSession, status: 'closed', counted_amount: '69000', expected_amount: '70000', difference: '-1000' }] }); // UPDATE
      const res = await request(app).put('/api/cash-sessions/1/close').send({ countedAmount: 69000 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');
      const updateCall = mockQuery.mock.calls.find(([sql]) => sql.includes('UPDATE cash_sessions'));
      expect(updateCall[1]).toContain(69000); // counted
      expect(updateCall[1]).toContain(70000); // expected = 50000 + 20000
      expect(updateCall[1]).toContain(-1000); // difference
    });

    it('rechaza countedAmount negativo → 400', async () => {
      const res = await request(app).put('/api/cash-sessions/1/close').send({ countedAmount: -5 });
      expect(res.status).toBe(400);
    });

    it('retorna 404 si la sesión no existe o ya está cerrada', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/cash-sessions/999/close').send({ countedAmount: 1000 });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/cash-sessions', () => {
    it('retorna el historial de sesiones de caja', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockCashSession] });
      const res = await request(app).get('/api/cash-sessions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  // ─── IMPORTACIÓN CSV DE PRODUCTOS ───────────────────────────────────────────

  describe('GET /api/inventory/import/template', () => {
    it('retorna un CSV con las columnas esperadas', async () => {
      const res = await request(app).get('/api/inventory/import/template');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toMatch(/sku/i);
      expect(res.text).toMatch(/nombre/i);
    });
  });

  describe('POST /api/inventory/import', () => {
    const csv = 'sku,nombre,stock,precio,costo,categoria\nCOCA-2L,Coca Cola 2L,20,2500,1500,bebidas';

    it('modo dry-run: valida sin escribir en BD', async () => {
      const res = await request(app).post('/api/inventory/import').send({ csv, commit: false });
      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].sku).toBe('COCA-2L');
      expect(res.body.errors).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('modo commit: upsert por fila vía fn_upsert_product dentro de una transacción', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', created: true }] }); // upsert
      mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
      const res = await request(app).post('/api/inventory/import').send({ csv, commit: true });
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('fn_upsert_product'), expect.any(Array));
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('pasa unidad de medida, IVA y activo a fn_upsert_product', async () => {
      const csvConExtras = 'sku,nombre,stock,precio,costo,categoria,unidad,iva,activo\nCOCA-2L,Coca Cola 2L,20,2500,1500,bebidas,unidad,19,SI';
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', created: true }] }); // upsert
      mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
      const res = await request(app).post('/api/inventory/import').send({ csv: csvConExtras, commit: true });
      expect(res.status).toBe(200);
      const upsertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('fn_upsert_product'));
      expect(upsertCall[1]).toContain(19);
      expect(upsertCall[1]).toContain(true);
      expect(upsertCall[1]).toContain('unidad');
    });

    it('revierte la transacción completa (ROLLBACK) si una fila falla durante el commit', async () => {
      const csvDosFilas = 'sku,nombre,stock,precio,costo,categoria\nCOCA-2L,Coca Cola 2L,20,2500,1500,bebidas\nSPRITE-2L,Sprite 2L,10,2000,1200,bebidas';
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', created: true }] }); // fila 1 ok
      mockQuery.mockRejectedValueOnce(new Error('DB crash')); // fila 2 falla
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const res = await request(app).post('/api/inventory/import').send({ csv: csvDosFilas, commit: true });
      expect(res.status).toBe(500);
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rechaza CSV con más de 2000 filas → 400', async () => {
      const header = 'sku,nombre,stock,precio,costo,categoria';
      const filas = Array.from({ length: 2001 }, (_, i) => `SKU-${i},Producto ${i},1,100,50,otros`).join('\n');
      const csvGigante = `${header}\n${filas}`;
      const res = await request(app).post('/api/inventory/import').send({ csv: csvGigante, commit: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/filas/i);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rechaza CSV sin columna nombre → 400', async () => {
      const res = await request(app).post('/api/inventory/import').send({ csv: 'sku,stock\nCOCA-2L,20', commit: false });
      expect(res.status).toBe(400);
    });

    it('rechaza sin csv en el body → 400', async () => {
      const res = await request(app).post('/api/inventory/import').send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/inventory/report/pdf ──────────────────────────────────────────

  describe('GET /api/inventory/report/pdf', () => {
    it('genera un PDF con content-type application/pdf', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', name: 'Coca 2L', stock: 5, price: 1000, category: 'bebidas' }] })
        .mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', stock_level: 'BAJO' }] });
      const res = await request(app).get('/api/inventory/report/pdf');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/inventario\.pdf/);
    });

    it('genera un PDF vacio cuando no hay productos', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/inventory/report/pdf');
      expect(res.status).toBe(200);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).get('/api/inventory/report/pdf');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/inventory/indicadores ──────────────────────────────────────────

  describe('GET /api/inventory/indicadores', () => {
    const mindicadorResponse = {
      uf: { valor: 38500.12, fecha: '2026-08-05' },
      dolar: { valor: 950.5, fecha: '2026-08-05' },
      utm: { valor: 65000, fecha: '2026-08-05' },
    };

    afterEach(() => { delete global.fetch; });

    // Nota de orden: `indicadoresCache` es estado a nivel de modulo (no se
    // resetea entre tests), asi que el test de error va primero: una vez que
    // un test exitoso cachea datos, las llamadas siguientes dentro del TTL
    // (1h) no vuelven a golpear fetch.
    it('retorna 500 si mindicador.cl responde con error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      const res = await request(app).get('/api/inventory/indicadores');
      expect(res.status).toBe(500);
    });

    it('consulta mindicador.cl, retorna uf/dolar/utm y cachea la 2da llamada', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mindicadorResponse });
      const res = await request(app).get('/api/inventory/indicadores');
      expect(res.status).toBe(200);
      expect(res.body.uf.valor).toBe(38500.12);
      expect(res.body.dolar.valor).toBe(950.5);
      expect(res.body.utm.valor).toBe(65000);

      const res2 = await request(app).get('/api/inventory/indicadores');
      expect(res2.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── GET /api/inventory/geocode ──────────────────────────────────────────────

  describe('GET /api/inventory/geocode', () => {
    afterEach(() => { delete global.fetch; });

    it('retorna resultados normalizados desde Nominatim', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([{ display_name: 'Av. Siempre Viva 123, Santiago', lat: '-33.45', lon: '-70.65', address: { road: 'Av. Siempre Viva', city: 'Santiago', state: 'RM', postcode: '8320000' } }])
      });
      const res = await request(app).get('/api/inventory/geocode?address=Av+Siempre+Viva+123');
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ displayName: 'Av. Siempre Viva 123, Santiago', lat: -33.45, lon: -70.65 });
      expect(res.body[0].address.city).toBe('Santiago');
    });

    it('rechaza address menor a 3 caracteres → 400', async () => {
      const res = await request(app).get('/api/inventory/geocode?address=ab');
      expect(res.status).toBe(400);
    });

    it('rechaza sin address → 400', async () => {
      const res = await request(app).get('/api/inventory/geocode');
      expect(res.status).toBe(400);
    });

    it('retorna 500 si Nominatim falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      const res = await request(app).get('/api/inventory/geocode?address=Alguna+direccion');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/inventory/image-search ─────────────────────────────────────────

  describe('GET /api/inventory/image-search', () => {
    afterEach(() => { delete global.fetch; });

    it('retorna resultados normalizados desde Openverse', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ id: 'abc', title: 'Coca Cola', thumbnail: 'http://x/thumb.jpg', url: 'http://x/img.jpg', creator: 'alguien', license: 'cc0' }] })
      });
      const res = await request(app).get('/api/inventory/image-search?q=coca+cola');
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ id: 'abc', title: 'Coca Cola', license: 'cc0' });
    });

    it('retorna array vacio si Openverse no trae results', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      const res = await request(app).get('/api/inventory/image-search?q=algo');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('rechaza q menor a 2 caracteres → 400', async () => {
      const res = await request(app).get('/api/inventory/image-search?q=a');
      expect(res.status).toBe(400);
    });

    it('retorna 500 si Openverse falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      const res = await request(app).get('/api/inventory/image-search?q=coca');
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /api/inventory/:sku/image ───────────────────────────────────────────

  describe('PUT /api/inventory/:sku/image', () => {
    it('actualiza la imagen del producto', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockProduct, image_url: 'http://x/img.jpg' }] });
      const res = await request(app).put('/api/inventory/COCA-2L/image').send({ imageUrl: 'http://x/img.jpg' });
      expect(res.status).toBe(200);
      expect(res.body.image_url).toBe('http://x/img.jpg');
    });

    it('rechaza sin imageUrl → 400', async () => {
      const res = await request(app).put('/api/inventory/COCA-2L/image').send({});
      expect(res.status).toBe(400);
    });

    it('retorna 404 si el SKU no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put('/api/inventory/NOEXISTE/image').send({ imageUrl: 'http://x/img.jpg' });
      expect(res.status).toBe(404);
    });

    it('retorna 500 si BD falla', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(app).put('/api/inventory/COCA-2L/image').send({ imageUrl: 'http://x/img.jpg' });
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /api/inventory/:sku/qr ──────────────────────────────────────────────

  describe('GET /api/inventory/:sku/qr', () => {
    afterEach(() => { delete global.fetch; });

    it('retorna imagen png con datos del producto codificados', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', name: 'Coca 2L', price: 1000, category: 'bebidas', stock: 5, unit_of_measure: 'un' }] });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      const res = await request(app).get('/api/inventory/COCA-2L/qr');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('retorna 404 si el SKU no existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/inventory/NOEXISTE/qr');
      expect(res.status).toBe(404);
    });

    it('retorna 500 si el servicio de QR falla', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ sku: 'COCA-2L', name: 'Coca 2L', price: 1000, category: 'bebidas', stock: 5, unit_of_measure: 'un' }] });
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await request(app).get('/api/inventory/COCA-2L/qr');
      expect(res.status).toBe(500);
    });
  });
});

// ─── BOOTSTRAP CONTRA DB VACÍA ──────────────────────────────────────────────
// Ver orders-service/src/index.test.js para el contexto del bug del 2026-08-06.
// Este servicio no tiene una función de auto-seed de datos (a diferencia de
// orders-service), pero sus migraciones de arranque tampoco tenían cobertura
// — este smoke test cierra ese gap y confirma que corren limpio contra una
// base de datos vacía sin lanzar excepciones.
describe('bootstrap (ensureTables/ensureTenantColumns/ensureTenantConstraints) contra DB vacía', () => {
  it('corre sin lanzar excepciones cuando las tablas/columnas no existen todavía', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    // Si cualquiera de estas rechaza, el await propaga y el test falla.
    await ensureTables();
    await ensureTenantColumns();
    await ensureTenantConstraints();
  });
});
