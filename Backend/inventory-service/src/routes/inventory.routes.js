const express = require('express');
const QRCode = require('qrcode');
const { validateInventoryBody } = require('../../shared/validate');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');
const { CSV_TEMPLATE_HEADERS, MAX_IMPORT_ROWS, parseInventoryCsv } = require('../lib/inventory-csv');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/inventory', inventoryRoutes({ pool, sendError })).
//
// IMPORTANTE: el orden de registro de abajo es el mismo que tenía el archivo
// original y NO debe reordenarse. Varias rutas de un solo segmento (/report,
// /indicadores, /geocode, /image-search) deben quedar registradas antes que
// la ruta genérica '/:sku', o Express empezaría a matchearlas como si
// ':sku' fuera "report"/"indicadores"/etc.
let indicadoresCache = { data: null, fetchedAt: 0 };
const INDICADORES_TTL_MS = 60 * 60 * 1000;

module.exports = function inventoryRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM inventory WHERE tenant_id=$1 ORDER BY id', [req.tenantId])).rows); }
    catch (err) { sendError(res, 500, 'Failed to list inventory', err); }
  });

  router.get('/report', authMiddleware, requireTenant, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM fn_get_inventory_report($1)', [req.tenantId])).rows); }
    catch (err) { sendError(res, 500, 'Failed to get inventory report', err); }
  });

  // ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

  router.get('/report/pdf', authMiddleware, requireTenant, async (req, res) => {
    try {
      const [items, report] = await Promise.all([
        pool.query('SELECT * FROM inventory WHERE tenant_id=$1 ORDER BY id', [req.tenantId]),
        pool.query('SELECT * FROM fn_get_inventory_report($1)', [req.tenantId])
      ]);
      const levelMap = Object.fromEntries(report.rows.map(r => [r.sku, r.stock_level]));

      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=inventario.pdf');
      doc.pipe(res);

      doc.fontSize(22).fillColor('#0f172a').text('Logify', { align: 'center' });
      doc.fontSize(13).fillColor('#475569').text('Reporte de Inventario', { align: 'center' });
      doc.fontSize(9).fillColor('#94a3b8').text(`Generado: ${new Date().toLocaleString('es-CL')}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
      doc.moveDown(0.5);

      const rows = items.rows;
      const sinStock = rows.filter(r => (levelMap[r.sku] || '') === 'SIN_STOCK').length;
      const critico = rows.filter(r => (levelMap[r.sku] || '') === 'CRITICO').length;
      const bajo = rows.filter(r => (levelMap[r.sku] || '') === 'BAJO').length;
      doc.fontSize(11).fillColor('#0f172a');
      doc.text(`Total SKUs: ${rows.length}   Sin stock: ${sinStock}   Crítico: ${critico}   Bajo: ${bajo}`);
      doc.moveDown();

      const colX = [50, 130, 260, 340, 400, 460];
      doc.fontSize(9).fillColor('#334155').font('Helvetica-Bold');
      doc.text('SKU', colX[0], doc.y, { width: 75 });
      doc.text('Nombre', colX[1], doc.y - doc.currentLineHeight(), { width: 125 });
      doc.text('Stock', colX[2], doc.y - doc.currentLineHeight(), { width: 75 });
      doc.text('Precio', colX[3], doc.y - doc.currentLineHeight(), { width: 55 });
      doc.text('Categoría', colX[4], doc.y - doc.currentLineHeight(), { width: 75 });
      doc.text('Nivel', colX[5], doc.y - doc.currentLineHeight(), { width: 60 });
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cbd5e1');
      doc.moveDown(0.3);

      doc.font('Helvetica').fillColor('#0f172a');
      for (const item of rows) {
        const level = levelMap[item.sku] || 'NORMAL';
        const color = level === 'SIN_STOCK' ? '#ef4444' : level === 'CRITICO' ? '#f97316' : level === 'BAJO' ? '#eab308' : '#22c55e';
        const y = doc.y;
        doc.fontSize(8);
        doc.text(item.sku, colX[0], y, { width: 75 });
        doc.text(item.name || '-', colX[1], y, { width: 125 });
        doc.text(String(item.stock), colX[2], y, { width: 75 });
        doc.text(`$${item.price}`, colX[3], y, { width: 55 });
        doc.text(item.category || '-', colX[4], y, { width: 75 });
        doc.fillColor(color).text(level, colX[5], y, { width: 60 });
        doc.fillColor('#0f172a');
        doc.moveDown(0.5);
      }

      doc.end();
    } catch (err) { sendError(res, 500, 'PDF failed', err); }
  });

  router.get('/indicadores', authMiddleware, requireTenant, async (_req, res) => {
    try {
      const now = Date.now();
      if (indicadoresCache.data && (now - indicadoresCache.fetchedAt) < INDICADORES_TTL_MS) {
        return res.json(indicadoresCache.data);
      }
      const response = await fetch('https://mindicador.cl/api');
      if (!response.ok) throw new Error(`mindicador.cl error ${response.status}`);
      const data = await response.json();
      const result = {
        uf: { valor: data.uf?.valor ?? null, fecha: data.uf?.fecha ?? null },
        dolar: { valor: data.dolar?.valor ?? null, fecha: data.dolar?.fecha ?? null },
        utm: { valor: data.utm?.valor ?? null, fecha: data.utm?.fecha ?? null }
      };
      indicadoresCache = { data: result, fetchedAt: now };
      res.json(result);
    } catch (err) { sendError(res, 500, 'Indicadores failed', err); }
  });

  router.get('/geocode', authMiddleware, requireTenant, async (req, res) => {
    try {
      const address = (req.query.address || '').trim();
      if (address.length < 3) return res.status(400).json({ error: 'address es requerido (mínimo 3 caracteres)' });
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Chile')}&format=json&addressdetails=1&limit=5&countrycodes=cl`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Logify/1.0 (logistica@logify.cl)', 'Accept-Language': 'es' } });
      if (!response.ok) throw new Error(`Nominatim error ${response.status}`);
      const data = await response.json();
      res.json(data.map(r => ({
        displayName: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        address: {
          road: r.address?.road,
          city: r.address?.city || r.address?.town || r.address?.village,
          state: r.address?.state,
          postcode: r.address?.postcode
        }
      })));
    } catch (err) { sendError(res, 500, 'Geocode failed', err); }
  });

  router.get('/image-search', authMiddleware, requireTenant, async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (q.length < 2) return res.status(400).json({ error: 'q debe tener al menos 2 caracteres' });
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&license_type=all`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Logify/1.0 (logistica@logify.cl)' } });
      if (!response.ok) throw new Error(`Openverse error ${response.status}`);
      const data = await response.json();
      res.json((data.results || []).map(r => ({
        id: r.id,
        title: r.title,
        thumbnail: r.thumbnail,
        url: r.url,
        creator: r.creator,
        license: r.license
      })));
    } catch (err) { sendError(res, 500, 'Image search failed', err); }
  });

  router.put('/:sku/image', authMiddleware, requireTenant, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl es requerido' });
      const r = await pool.query('UPDATE inventory SET image_url=$1 WHERE sku=$2 AND tenant_id=$3 RETURNING *', [imageUrl, req.params.sku, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update image', err); }
  });

  // ══════════════════════════════════════════════════════════════════════════════

  router.get('/:sku', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM inventory WHERE sku=$1 AND tenant_id=$2', [req.params.sku, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to get inventory', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const errors = validateInventoryBody(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      if ((await pool.query('SELECT 1 FROM inventory WHERE sku=$1 AND tenant_id=$2', [req.body.sku, req.tenantId])).rows.length)
        return res.status(409).json({ error: 'SKU ya existe' });
      const result = await pool.query(
        `INSERT INTO inventory (sku, stock, name, price, cost, category, image_url, tenant_id,
          supplier_id, unit_of_measure, tax_rate, price_includes_tax, active, parent_sku, variant_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [req.body.sku, req.body.stock || 0, req.body.name || null, req.body.price || 0, req.body.cost || 0,
         req.body.category || 'otros', req.body.imageUrl || null, req.tenantId,
         req.body.supplierId || null, req.body.unitOfMeasure || 'unidad', req.body.taxRate || 0,
         req.body.priceIncludesTax !== false, req.body.active !== false, req.body.parentSku || null, req.body.variantLabel || null]);
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to create inventory', err); }
  });

  router.put('/:sku', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      if (req.body.stock === undefined || isNaN(Number(req.body.stock)) || Number(req.body.stock) < 0)
        return res.status(400).json({ error: 'stock must be >= 0' });
      const r = await pool.query('UPDATE inventory SET stock=$1 WHERE sku=$2 AND tenant_id=$3 RETURNING *', [Number(req.body.stock), req.params.sku, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update inventory', err); }
  });

  // Edición de metadata del producto (no de stock — ver PUT /:sku arriba, que
  // mantiene su contrato estrecho porque ya lo usa el flujo de ajuste rápido).
  router.put('/:sku/details', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const { name, category, price, cost, supplierId, unitOfMeasure, taxRate, priceIncludesTax, active } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const r = await pool.query(
        `UPDATE inventory SET name=$1, category=$2, price=$3, cost=$4, supplier_id=$5,
          unit_of_measure=$6, tax_rate=$7, price_includes_tax=$8, active=$9
         WHERE sku=$10 AND tenant_id=$11 RETURNING *`,
        [name.trim(), category || 'otros', price || 0, cost || 0, supplierId || null,
         unitOfMeasure || 'unidad', taxRate || 0, priceIncludesTax !== false, active !== false,
         req.params.sku, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update product details', err); }
  });

  router.delete('/:sku', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const r = await pool.query('DELETE FROM inventory WHERE sku=$1 AND tenant_id=$2 RETURNING *', [req.params.sku, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
      res.json({ deleted: true, sku: req.params.sku });
    } catch (err) { sendError(res, 500, 'Failed to delete', err); }
  });

  // El QR codifica solo el tipo y el SKU (no el resto del producto): un payload
  // corto escanea de forma confiable a tamaño de etiqueta impresa, y evita que
  // el código quede desactualizado si el precio/stock cambian después de imprimir.
  // Se genera localmente con `qrcode` (sin depender de un servicio externo).
  router.get('/:sku/qr', authMiddleware, requireTenant, async (req, res) => {
    try {
      const { sku } = req.params;
      const product = (await pool.query(
        'SELECT sku FROM inventory WHERE sku=$1 AND tenant_id=$2',
        [sku, req.tenantId]
      )).rows[0];
      if (!product) return res.status(404).json({ error: 'SKU no encontrado' });
      const requestedSize = Number.parseInt(req.query.size, 10);
      const size = Number.isFinite(requestedSize) ? Math.min(Math.max(requestedSize, 100), 1000) : 300;
      const payload = JSON.stringify({ t: 'logify_product', sku: product.sku });
      const png = await QRCode.toBuffer(payload, { type: 'png', width: size, margin: 2, errorCorrectionLevel: 'M' });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.send(png);
    } catch (err) { sendError(res, 500, 'QR failed', err); }
  });

  router.post('/:sku/adjust', authMiddleware, requireTenant, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
    try {
      const delta = parseInt(req.query.delta, 10);
      if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'delta must be non-zero integer' });
      const r = await pool.query('SELECT * FROM fn_adjust_stock($1,$2,$3)', [req.params.sku, delta, req.tenantId]);
      const result = r.rows[0];
      if (!result.success) {
        const status = result.error_msg === 'SKU no encontrado' ? 404 : 400;
        return res.status(status).json({ error: result.error_msg });
      }
      if (delta < 0) await pool.query('INSERT INTO sales (sku, quantity, tenant_id) VALUES ($1,$2,$3)', [req.params.sku, Math.abs(delta), req.tenantId]);
      res.json({ sku: req.params.sku, stock: result.new_stock, delta });
    } catch (err) { sendError(res, 500, 'Failed to adjust stock', err); }
  });

  // ═══ IMPORTACIÓN CSV DE PRODUCTOS ═══════════════════════════════════════════════

  router.get('/import/template', authMiddleware, requireTenant, (_req, res) => {
    const example = 'COCA-2L,Coca Cola 2L,bebidas,20,2500,1500,unidad,19,SI';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-productos.csv');
    res.send(`${CSV_TEMPLATE_HEADERS.join(',')}\n${example}\n`);
  });

  router.post('/import', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const { csv, commit } = req.body;
      if (!csv || !csv.trim()) return res.status(400).json({ error: 'csv es requerido' });
      const { rows, errors } = parseInventoryCsv(csv);
      if (errors.length && !rows.length) return res.status(400).json({ error: errors.join('; ') });
      if (rows.length > MAX_IMPORT_ROWS) {
        return res.status(400).json({ error: `El CSV tiene ${rows.length} filas; el máximo permitido por importación es ${MAX_IMPORT_ROWS}` });
      }

      if (!commit) return res.json({ rows, errors });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let imported = 0;
        for (const row of rows) {
          await client.query(
            'SELECT * FROM fn_upsert_product($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [row.sku, row.name, row.stock, row.price, row.cost, row.category, row.unitOfMeasure, row.taxRate, row.active, req.tenantId]);
          imported++;
        }
        await client.query('COMMIT');
        res.json({ imported, errors });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { sendError(res, 500, 'Failed to import CSV', err); }
  });

  return router;
};
