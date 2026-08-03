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
const mockClientRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockClientRelease };
createPool.mockReturnValue({ query: mockQuery, connect: jest.fn().mockResolvedValue(mockClient), on: jest.fn(), end: jest.fn() });

const { app } = require('./index');

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
});
