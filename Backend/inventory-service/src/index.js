const { createApp } = require('../shared/app');
const { validateInventoryBody, validateSaleBody } = require('../shared/validate');
const { authMiddleware, requireTenant, requireRole } = require('../shared/auth');
const log = require('../shared/logger');

const { app, pool, sendError, start } = createApp('inventory_db', process.env.PORT || 8082);

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, stock INTEGER DEFAULT 0,
    name VARCHAR(200), price INTEGER DEFAULT 0, cost INTEGER DEFAULT 0,
    category VARCHAR(30) DEFAULT 'otros')`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku ON inventory (sku)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sales (id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, quantity INTEGER NOT NULL, sale_date TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (event_type VARCHAR(64) NOT NULL, event_key VARCHAR(128) NOT NULL, processed_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (event_type, event_key))`);
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name VARCHAR(200)`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'otros'`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_group VARCHAR(50)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(100)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(200)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`).catch(() => {});

  // Fase 1 del roadmap de expansión comercial (ver aidlc-docs/): proveedores
  // y productos ampliados. Las "variantes" (talla/color/presentación) se
  // modelan como otra fila de inventory con parent_sku apuntando al SKU base,
  // en vez de una tabla product_variants separada — mismo modelo flat que ya
  // usa el proyecto, evita mantener dos entidades de catálogo en paralelo.
  await pool.query(`CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, rut VARCHAR(20), phone VARCHAR(30),
    email VARCHAR(200), address VARCHAR(300), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'unidad'`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price_includes_tax BOOLEAN DEFAULT true`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS parent_sku VARCHAR(100)`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_label VARCHAR(100)`).catch(() => {});

  await ensureTenantColumns();
}

// Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): backfill al
// tenant id=1 "logify", el mismo id fijo usado en las migraciones de los
// otros 3 servicios (no hay FK cross-database entre las 4 bases).
async function ensureTenantColumns() {
  for (const table of ['inventory', 'sales', 'processed_events', 'suppliers']) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
    await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
  }
}

// Fase 4C del roadmap multi-tenant: sku deja de ser unico globalmente y pasa
// a ser unico por tenant (dos empresas pueden vender ambas el sku "COCA-2L").
// processed_events (hoy sin uso real, ver wiki/Multi-Tenant.md) tambien
// incorpora tenant_id a su PK compuesta por consistencia futura.
async function ensureTenantConstraints() {
  await pool.query(`DROP INDEX IF EXISTS idx_inventory_sku`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_inventory_tenant_sku ON inventory (tenant_id, sku)`);
  await pool.query(`ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_pkey`).catch(() => {});
  await pool.query(`ALTER TABLE processed_events ADD PRIMARY KEY (tenant_id, event_type, event_key)`).catch(() => {});
}

async function ensureProcedures() {
  // Fase 4C: ambos SP reciben p_tenant_id y filtran por el. drop previo
  // porque cambia la firma, CREATE OR REPLACE no permite eso.
  await pool.query(`DROP FUNCTION IF EXISTS fn_adjust_stock(TEXT, INT)`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_adjust_stock(p_sku TEXT, p_delta INT, p_tenant_id INT)
    RETURNS TABLE(sku_out TEXT, new_stock INT, delta INT, success BOOLEAN, error_msg TEXT)
    AS $fn$
    DECLARE v_new_stock INT; v_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM inventory WHERE sku = p_sku AND tenant_id = p_tenant_id) INTO v_exists;
      IF NOT v_exists THEN
        RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'SKU no encontrado'::TEXT; RETURN;
      END IF;
      UPDATE inventory SET stock = stock + p_delta WHERE sku = p_sku AND tenant_id = p_tenant_id AND stock + p_delta >= 0 RETURNING stock INTO v_new_stock;
      IF v_new_stock IS NOT NULL THEN
        RETURN QUERY SELECT p_sku, v_new_stock, p_delta, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'Stock insuficiente'::TEXT;
      END IF;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP FUNCTION IF EXISTS fn_upsert_product(TEXT, TEXT, INT, INT, INT, TEXT, INT)`).catch(() => {});
  await pool.query(`DROP FUNCTION IF EXISTS fn_upsert_product(TEXT, TEXT, INT, INT, INT, TEXT, TEXT, NUMERIC, BOOLEAN, INT)`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_upsert_product(
      p_sku TEXT, p_name TEXT, p_stock INT, p_price INT, p_cost INT, p_category TEXT,
      p_unit_of_measure TEXT, p_tax_rate NUMERIC, p_active BOOLEAN, p_tenant_id INT
    )
    RETURNS TABLE(sku_out TEXT, created BOOLEAN) AS $fn$
    BEGIN
      RETURN QUERY
        INSERT INTO inventory (sku, name, stock, price, cost, category, unit_of_measure, tax_rate, active, tenant_id)
        VALUES (p_sku, p_name, p_stock, p_price, p_cost, p_category, p_unit_of_measure, p_tax_rate, p_active, p_tenant_id)
        ON CONFLICT (tenant_id, sku) DO UPDATE SET
          name = EXCLUDED.name, stock = EXCLUDED.stock, price = EXCLUDED.price,
          cost = EXCLUDED.cost, category = EXCLUDED.category, unit_of_measure = EXCLUDED.unit_of_measure,
          tax_rate = EXCLUDED.tax_rate, active = EXCLUDED.active
        RETURNING sku::TEXT, (xmax = 0);
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP FUNCTION IF EXISTS fn_get_inventory_report()`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_get_inventory_report(p_tenant_id INT)
    RETURNS TABLE(sku VARCHAR, stock INT, stock_level TEXT)
    AS $fn$
    BEGIN
      RETURN QUERY
        SELECT i.sku, i.stock,
          CASE WHEN i.stock = 0 THEN 'SIN_STOCK' WHEN i.stock < 10 THEN 'CRITICO'
               WHEN i.stock < 30 THEN 'BAJO' ELSE 'NORMAL' END::TEXT
        FROM inventory i WHERE i.tenant_id = p_tenant_id ORDER BY i.stock ASC;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
}

app.get('/api/inventory', authMiddleware, requireTenant, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM inventory WHERE tenant_id=$1 ORDER BY id', [req.tenantId])).rows); }
  catch (err) { sendError(res, 500, 'Failed to list inventory', err); }
});

app.get('/api/inventory/report', authMiddleware, requireTenant, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM fn_get_inventory_report($1)', [req.tenantId])).rows); }
  catch (err) { sendError(res, 500, 'Failed to get inventory report', err); }
});

// ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

app.get('/api/inventory/report/pdf', authMiddleware, requireTenant, async (req, res) => {
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

let indicadoresCache = { data: null, fetchedAt: 0 };
const INDICADORES_TTL_MS = 60 * 60 * 1000;

app.get('/api/inventory/indicadores', authMiddleware, requireTenant, async (_req, res) => {
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

app.get('/api/inventory/geocode', authMiddleware, requireTenant, async (req, res) => {
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

app.get('/api/inventory/image-search', authMiddleware, requireTenant, async (req, res) => {
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

app.put('/api/inventory/:sku/image', authMiddleware, requireTenant, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl es requerido' });
    const r = await pool.query('UPDATE inventory SET image_url=$1 WHERE sku=$2 AND tenant_id=$3 RETURNING *', [imageUrl, req.params.sku, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update image', err); }
});

// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/inventory/:sku', authMiddleware, requireTenant, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM inventory WHERE sku=$1 AND tenant_id=$2', [req.params.sku, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to get inventory', err); }
});

app.post('/api/inventory', authMiddleware, requireTenant, async (req, res) => {
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

app.put('/api/inventory/:sku', authMiddleware, requireTenant, async (req, res) => {
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
app.put('/api/inventory/:sku/details', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
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

app.delete('/api/inventory/:sku', authMiddleware, requireTenant, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM inventory WHERE sku=$1 AND tenant_id=$2 RETURNING *', [req.params.sku, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json({ deleted: true, sku: req.params.sku });
  } catch (err) { sendError(res, 500, 'Failed to delete', err); }
});

app.get('/api/inventory/:sku/qr', authMiddleware, requireTenant, async (req, res) => {
  try {
    const { sku } = req.params;
    if (!(await pool.query('SELECT 1 FROM inventory WHERE sku=$1 AND tenant_id=$2', [sku, req.tenantId])).rows.length)
      return res.status(404).json({ error: 'SKU no encontrado' });
    const size = req.query.size || '200x200';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent('LOGIFY-SKU:' + sku)}&format=png&margin=10`;
    const qrRes = await fetch(qrUrl);
    if (!qrRes.ok) throw new Error('QR service error');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await qrRes.arrayBuffer()));
  } catch (err) { sendError(res, 500, 'QR failed', err); }
});

app.post('/api/inventory/:sku/adjust', authMiddleware, requireTenant, async (req, res) => {
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

app.get('/api/sales', authMiddleware, requireTenant, async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT s.*, i.name AS product_name
       FROM sales s LEFT JOIN inventory i ON i.sku = s.sku AND i.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
       ORDER BY s.sale_date DESC`, [req.tenantId])).rows;
    // Agrupa las filas por sale_group (una venta POS inserta una fila por item)
    const groups = new Map();
    for (const r of rows) {
      const key = r.sale_group || `sale-${r.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: r.id,
          items: [],
          total: 0,
          paymentMethod: r.payment_method || 'cash',
          vendorId: r.vendor_id || '',
          vendorName: r.vendor_name || '',
          createdAt: r.sale_date,
        });
      }
      const g = groups.get(key);
      const subtotal = r.total || (r.unit_price || 0) * r.quantity;
      g.items.push({ sku: r.sku, name: r.product_name || r.sku, quantity: r.quantity, unitPrice: r.unit_price || 0, subtotal });
      g.total += subtotal;
    }
    res.json(Array.from(groups.values()).map(g => ({ ...g, items: JSON.stringify(g.items) })));
  } catch (err) { sendError(res, 500, 'Failed to list sales', err); }
});

app.post('/api/sales', authMiddleware, requireTenant, async (req, res) => {
  const client = await pool.connect();
  const tenantId = req.tenantId;
  try {
    const errors = validateSaleBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    if (req.body.items) {
      let saleItems;
      try {
        saleItems = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
      } catch {
        return res.status(400).json({ error: 'items debe ser un JSON valido' });
      }
      if (!Array.isArray(saleItems) || saleItems.length === 0) {
        return res.status(400).json({ error: 'items debe ser un arreglo no vacio' });
      }

      await client.query('BEGIN');

      // lock all rows first to prevent race conditions
      const insufficient = [];
      for (const item of saleItems) {
        if (!item.sku || !item.quantity || item.quantity < 1) {
          insufficient.push(`Item invalido: sku=${item.sku} qty=${item.quantity}`);
          continue;
        }
        const r = await client.query(
          'SELECT stock FROM inventory WHERE sku=$1 AND tenant_id=$2 FOR UPDATE',
          [item.sku, tenantId]
        );
        if (!r.rows.length) {
          insufficient.push(`SKU no encontrado: ${item.sku}`);
        } else if (r.rows[0].stock < item.quantity) {
          insufficient.push(`Stock insuficiente: ${item.sku} (disponible: ${r.rows[0].stock}, solicitado: ${item.quantity})`);
        }
      }

      if (insufficient.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: insufficient.join('; ') });
      }

      const saleGroup = `POS-${Date.now()}`;
      const results = [];

      for (const item of saleItems) {
        await client.query(
          'UPDATE inventory SET stock=stock-$1 WHERE sku=$2 AND tenant_id=$3',
          [item.quantity, item.sku, tenantId]
        );
        const sale = (await client.query(
          'INSERT INTO sales (sku, quantity, sale_group, payment_method, vendor_id, vendor_name, unit_price, total, sale_date, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) RETURNING *',
          [item.sku, item.quantity, saleGroup, req.body.paymentMethod || 'cash', req.body.vendorId || 'unknown', req.body.vendorName || '', item.unitPrice || 0, item.subtotal || 0, tenantId]
        )).rows[0];
        results.push(sale);
      }

      await client.query('COMMIT');
      client.release();

      res.status(201).json({ saleGroup, items: results, total: req.body.total });
      return;
    }

    // single-item sale
    const r = await client.query(
      'UPDATE inventory SET stock=stock-$1 WHERE sku=$2 AND tenant_id=$3 AND stock>=$1 RETURNING *',
      [req.body.quantity, req.body.sku, tenantId]
    );
    if (!r.rows.length) {
      const exists = await client.query('SELECT 1 FROM inventory WHERE sku=$1 AND tenant_id=$2', [req.body.sku, tenantId]);
      client.release();
      return res.status(exists.rows.length ? 400 : 404).json({ error: exists.rows.length ? 'Stock insuficiente' : 'SKU no encontrado' });
    }
    const sale = (await client.query('INSERT INTO sales (sku, quantity, tenant_id) VALUES ($1,$2,$3) RETURNING *', [req.body.sku, req.body.quantity, tenantId])).rows[0];
    client.release();
    res.status(201).json(sale);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    sendError(res, 500, 'Failed to record sale', err);
  }
});

// ═══ PROVEEDORES ═══════════════════════════════════════════════════════════════

app.get('/api/suppliers', authMiddleware, requireTenant, async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM suppliers WHERE tenant_id=$1 ORDER BY name', [req.tenantId])).rows); }
  catch (err) { sendError(res, 500, 'Failed to list suppliers', err); }
});

app.get('/api/suppliers/:id', authMiddleware, requireTenant, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM suppliers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to get supplier', err); }
});

app.post('/api/suppliers', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
  try {
    const { name, rut, phone, email, address } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await pool.query(
      'INSERT INTO suppliers (name, rut, phone, email, address, tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name.trim(), rut || null, phone || null, email || null, address || null, req.tenantId]);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to create supplier', err); }
});

app.put('/api/suppliers/:id', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
  try {
    const { name, rut, phone, email, address, active } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await pool.query(
      'UPDATE suppliers SET name=$1, rut=$2, phone=$3, email=$4, address=$5, active=$6 WHERE id=$7 AND tenant_id=$8 RETURNING *',
      [name.trim(), rut || null, phone || null, email || null, address || null, active !== false, req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update supplier', err); }
});

app.delete('/api/suppliers/:id', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM suppliers WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor eliminado correctamente' });
  } catch (err) { sendError(res, 500, 'Failed to delete supplier', err); }
});

// ═══ IMPORTACIÓN CSV DE PRODUCTOS ═══════════════════════════════════════════════

const CSV_TEMPLATE_HEADERS = ['sku', 'nombre', 'categoria', 'stock', 'precio', 'costo', 'unidad', 'iva', 'activo'];
const CSV_REQUIRED_HEADERS = ['sku', 'nombre'];

// Parser simple: no soporta comas dentro de campos entre comillas (el
// template no las necesita: sku/nombre/categoria/etc. son valores simples).
function parseInventoryCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [], errors: ['El CSV está vacío'] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const missing = CSV_REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) return { headers, rows: [], errors: [`Faltan columnas requeridas: ${missing.join(', ')}`] };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const raw = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
    if (!raw.sku || !raw.nombre) {
      errors.push(`Fila ${i + 1}: sku y nombre son obligatorios`);
      continue;
    }
    rows.push({
      sku: raw.sku,
      name: raw.nombre,
      category: raw.categoria || 'otros',
      stock: raw.stock ? parseInt(raw.stock, 10) || 0 : 0,
      price: raw.precio ? parseInt(raw.precio, 10) || 0 : 0,
      cost: raw.costo ? parseInt(raw.costo, 10) || 0 : 0,
      unitOfMeasure: raw.unidad || 'unidad',
      taxRate: raw.iva ? parseFloat(raw.iva) || 0 : 0,
      active: raw.activo ? /^(si|sí|true|1)$/i.test(raw.activo) : true,
    });
  }
  return { headers, rows, errors };
}

app.get('/api/inventory/import/template', authMiddleware, requireTenant, (_req, res) => {
  const example = 'COCA-2L,Coca Cola 2L,bebidas,20,2500,1500,unidad,19,SI';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=plantilla-productos.csv');
  res.send(`${CSV_TEMPLATE_HEADERS.join(',')}\n${example}\n`);
});

const MAX_IMPORT_ROWS = 2000;

app.post('/api/inventory/import', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
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

if (require.main === module) {
  (async () => { await ensureTables(); await ensureTenantConstraints(); await ensureProcedures(); start(); })();
}

module.exports = { app };
