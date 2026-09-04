'use strict';

const VALID_TYPES = new Set(['count', 'restock']);
const VALID_STATUSES = new Set(['draft', 'finalized', 'cancelled']);

function asNumber(value) {
  return value == null ? null : Number(value);
}

function formatSession(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    type: row.type,
    name: row.name,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at,
    cancelledAt: row.cancelled_at,
    totalProducts: Number(row.total_products || 0),
    scannedProducts: Number(row.scanned_products || 0),
    totalDifference: Number(row.total_difference || 0),
  };
}

function formatItem(row, type) {
  const initialStock = Number(row.initial_stock || 0);
  const quantity = Number(row.counted_quantity || 0);
  const currentStock = Number(row.current_stock ?? initialStock);
  const calculatedFinal = type === 'count' ? quantity : currentStock + quantity;
  return {
    id: Number(row.id),
    sku: row.sku,
    barcode: row.barcode,
    name: row.product_name || row.sku,
    initialStock,
    currentStock,
    quantity,
    scanned: Boolean(row.scanned),
    difference: quantity - initialStock,
    finalStock: asNumber(row.final_stock) ?? calculatedFinal,
    appliedDelta: asNumber(row.applied_delta),
    stockChanged: row.status === 'draft' && currentStock !== initialStock,
    updatedAt: row.updated_at,
  };
}

async function ensureInventorySessionTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS inventory_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('count', 'restock')),
    name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'cancelled')),
    created_by VARCHAR(100),
    created_by_name VARCHAR(200),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMP,
    cancelled_at TIMESTAMP)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_sessions_tenant ON inventory_sessions (tenant_id, started_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_inventory_sessions_active_tenant
    ON inventory_sessions (tenant_id) WHERE status='draft'`);

  await pool.query(`CREATE TABLE IF NOT EXISTS inventory_session_items (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    product_name VARCHAR(200),
    initial_stock INTEGER NOT NULL DEFAULT 0,
    counted_quantity INTEGER NOT NULL DEFAULT 0 CHECK (counted_quantity >= 0),
    scanned BOOLEAN NOT NULL DEFAULT false,
    final_stock INTEGER,
    applied_delta INTEGER,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, sku))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_session_items_tenant ON inventory_session_items (tenant_id, session_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    session_id INTEGER REFERENCES inventory_sessions(id),
    sku VARCHAR(100) NOT NULL,
    movement_type VARCHAR(30) NOT NULL,
    quantity_delta INTEGER NOT NULL,
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant ON inventory_movements (tenant_id, created_at DESC)`);
}

async function getSession(db, sessionId, tenantId) {
  const sessionResult = await db.query(
    `SELECT s.*,
       COUNT(i.id)::int AS total_products,
       COUNT(i.id) FILTER (WHERE i.scanned)::int AS scanned_products,
       COALESCE(SUM(CASE WHEN s.type='count' THEN i.counted_quantity-i.initial_stock ELSE i.counted_quantity END), 0)::int AS total_difference
     FROM inventory_sessions s
     LEFT JOIN inventory_session_items i ON i.session_id=s.id AND i.tenant_id=s.tenant_id
     WHERE s.id=$1 AND s.tenant_id=$2
     GROUP BY s.id`,
    [sessionId, tenantId],
  );
  if (!sessionResult.rows.length) return null;
  const session = formatSession(sessionResult.rows[0]);
  const itemResult = await db.query(
    `SELECT i.*, COALESCE(inv.stock, i.initial_stock) AS current_stock, s.status
     FROM inventory_session_items i
     JOIN inventory_sessions s ON s.id=i.session_id AND s.tenant_id=i.tenant_id
     LEFT JOIN inventory inv ON inv.sku=i.sku AND inv.tenant_id=i.tenant_id
     WHERE i.session_id=$1 AND i.tenant_id=$2
     ORDER BY i.scanned DESC, i.updated_at DESC, i.product_name ASC`,
    [sessionId, tenantId],
  );
  return { ...session, items: itemResult.rows.map((row) => formatItem(row, session.type)) };
}

async function rollbackQuietly(client) {
  await client.query('ROLLBACK').catch(() => {});
}

function registerInventorySessionRoutes({ app, pool, authMiddleware, requireTenant, requireRole, sendError }) {
  const ownerOnly = [authMiddleware, requireTenant, requireRole('owner')];

  app.get('/api/inventory-sessions', ...ownerOnly, async (req, res) => {
    try {
      const params = [req.tenantId];
      const filters = ['s.tenant_id=$1'];
      if (req.query.status) {
        if (!VALID_STATUSES.has(String(req.query.status))) return res.status(400).json({ error: 'Estado de inventario inválido' });
        params.push(String(req.query.status));
        filters.push(`s.status=$${params.length}`);
      }
      if (req.query.type) {
        if (!VALID_TYPES.has(String(req.query.type))) return res.status(400).json({ error: 'Tipo de inventario inválido' });
        params.push(String(req.query.type));
        filters.push(`s.type=$${params.length}`);
      }
      const result = await pool.query(
        `SELECT s.*,
           COUNT(i.id)::int AS total_products,
           COUNT(i.id) FILTER (WHERE i.scanned)::int AS scanned_products,
           COALESCE(SUM(CASE WHEN s.type='count' THEN i.counted_quantity-i.initial_stock ELSE i.counted_quantity END), 0)::int AS total_difference
         FROM inventory_sessions s
         LEFT JOIN inventory_session_items i ON i.session_id=s.id AND i.tenant_id=s.tenant_id
         WHERE ${filters.join(' AND ')}
         GROUP BY s.id
         ORDER BY s.started_at DESC`,
        params,
      );
      res.json(result.rows.map(formatSession));
    } catch (err) {
      sendError(res, 500, 'No se pudo cargar el historial de inventarios', err);
    }
  });

  app.post('/api/inventory-sessions', ...ownerOnly, async (req, res) => {
    const type = String(req.body?.type || '');
    if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'Selecciona Conteo físico o Agregar inventario' });
    const defaultName = type === 'count' ? 'Conteo físico' : 'Ingreso de inventario';
    const name = String(req.body?.name || defaultName).trim().slice(0, 200) || defaultName;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        `SELECT id, name, type FROM inventory_sessions WHERE tenant_id=$1 AND status='draft' LIMIT 1 FOR UPDATE`,
        [req.tenantId],
      );
      if (active.rows.length) {
        await rollbackQuietly(client);
        return res.status(409).json({ error: 'Ya existe un inventario guardado en proceso', activeSessionId: Number(active.rows[0].id) });
      }
      const inserted = await client.query(
        `INSERT INTO inventory_sessions (tenant_id, type, name, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.tenantId, type, name, req.user?.sub || null, req.user?.name || null],
      );
      const sessionId = inserted.rows[0].id;
      if (type === 'count') {
        await client.query(
          `INSERT INTO inventory_session_items
             (session_id, tenant_id, sku, barcode, product_name, initial_stock)
           SELECT $1, tenant_id, sku, barcode, COALESCE(name, sku), stock
           FROM inventory
           WHERE tenant_id=$2 AND active IS NOT FALSE`,
          [sessionId, req.tenantId],
        );
      }
      const session = await getSession(client, sessionId, req.tenantId);
      await client.query('COMMIT');
      res.status(201).json(session);
    } catch (err) {
      await rollbackQuietly(client);
      if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un inventario guardado en proceso' });
      sendError(res, 500, 'No se pudo crear el inventario', err);
    } finally {
      client.release();
    }
  });

  app.get('/api/inventory-sessions/:id', ...ownerOnly, async (req, res) => {
    try {
      const session = await getSession(pool, req.params.id, req.tenantId);
      if (!session) return res.status(404).json({ error: 'Inventario no encontrado' });
      res.json(session);
    } catch (err) {
      sendError(res, 500, 'No se pudo cargar el inventario', err);
    }
  });

  app.post('/api/inventory-sessions/:id/scan', ...ownerOnly, async (req, res) => {
    const code = String(req.body?.code || '').trim();
    const delta = req.body?.delta == null ? 1 : Number(req.body.delta);
    if (!code) return res.status(400).json({ error: 'Escanea o escribe un código de barras' });
    if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'La cantidad debe ser un número entero distinto de cero' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(
        `SELECT * FROM inventory_sessions WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
        [req.params.id, req.tenantId],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        await rollbackQuietly(client);
        return res.status(404).json({ error: 'Inventario no encontrado' });
      }
      if (session.status !== 'draft') {
        await rollbackQuietly(client);
        return res.status(409).json({ error: 'Este inventario ya no admite cambios' });
      }
      const productResult = await client.query(
        `SELECT sku, barcode, COALESCE(name, sku) AS product_name, stock
         FROM inventory
         WHERE tenant_id=$1 AND active IS NOT FALSE AND (barcode=$2 OR LOWER(sku)=LOWER($2))
         LIMIT 1`,
        [req.tenantId, code],
      );
      if (!productResult.rows.length) {
        await rollbackQuietly(client);
        return res.status(404).json({ error: 'Producto no encontrado', code });
      }
      const product = productResult.rows[0];
      const itemResult = await client.query(
        `INSERT INTO inventory_session_items
           (session_id, tenant_id, sku, barcode, product_name, initial_stock, counted_quantity, scanned)
         VALUES ($1,$2,$3,$4,$5,$6,GREATEST(0,$7),true)
         ON CONFLICT (session_id, sku) DO UPDATE SET
           counted_quantity=GREATEST(0, inventory_session_items.counted_quantity + $7),
           barcode=EXCLUDED.barcode,
           product_name=EXCLUDED.product_name,
           scanned=true,
           updated_at=NOW()
         RETURNING *`,
        [req.params.id, req.tenantId, product.sku, product.barcode, product.product_name, product.stock, delta],
      );
      await client.query(`UPDATE inventory_sessions SET updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId]);
      await client.query('COMMIT');
      res.json(formatItem({ ...itemResult.rows[0], current_stock: product.stock, status: 'draft' }, session.type));
    } catch (err) {
      await rollbackQuietly(client);
      sendError(res, 500, 'No se pudo registrar el producto escaneado', err);
    } finally {
      client.release();
    }
  });

  app.put('/api/inventory-sessions/:id/items/:sku', ...ownerOnly, async (req, res) => {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor o igual a cero' });
    try {
      const result = await pool.query(
        `UPDATE inventory_session_items i SET counted_quantity=$1, scanned=true, updated_at=NOW()
         FROM inventory_sessions s, inventory inv
         WHERE i.session_id=s.id AND i.session_id=$2 AND i.tenant_id=$3 AND i.sku=$4 AND s.status='draft'
           AND inv.tenant_id=i.tenant_id AND inv.sku=i.sku
         RETURNING i.*, inv.stock AS current_stock, s.type, s.status`,
        [quantity, req.params.id, req.tenantId, req.params.sku],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Producto o inventario en proceso no encontrado' });
      res.json(formatItem(result.rows[0], result.rows[0].type));
    } catch (err) {
      sendError(res, 500, 'No se pudo actualizar la cantidad', err);
    }
  });

  app.post('/api/inventory-sessions/:id/finalize', ...ownerOnly, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(
        `SELECT * FROM inventory_sessions WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
        [req.params.id, req.tenantId],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        await rollbackQuietly(client);
        return res.status(404).json({ error: 'Inventario no encontrado' });
      }
      if (session.status === 'finalized') {
        const finalized = await getSession(client, req.params.id, req.tenantId);
        await client.query('COMMIT');
        return res.json({ ...finalized, alreadyFinalized: true });
      }
      if (session.status !== 'draft') {
        await rollbackQuietly(client);
        return res.status(409).json({ error: 'El inventario fue anulado y no se puede finalizar' });
      }

      const itemResult = await client.query(
        `SELECT i.*, inv.stock AS current_stock
         FROM inventory_session_items i
         JOIN inventory inv ON inv.sku=i.sku AND inv.tenant_id=i.tenant_id
         WHERE i.session_id=$1 AND i.tenant_id=$2
         ORDER BY i.id
         FOR UPDATE OF i, inv`,
        [req.params.id, req.tenantId],
      );
      if (!itemResult.rows.length) {
        await rollbackQuietly(client);
        return res.status(400).json({ error: 'Escanea al menos un producto antes de finalizar' });
      }

      if (session.type === 'count') {
        const unscanned = itemResult.rows.filter((item) => !item.scanned);
        if (unscanned.length && req.body?.confirmUnscannedAsZero !== true) {
          await rollbackQuietly(client);
          return res.status(409).json({
            error: 'Hay productos sin escanear. Confirma si deseas registrarlos con cantidad cero.',
            code: 'UNSCANNED_PRODUCTS',
            count: unscanned.length,
          });
        }
        const changed = itemResult.rows.filter((item) => Number(item.current_stock) !== Number(item.initial_stock));
        if (changed.length && req.body?.confirmStockChanges !== true) {
          await rollbackQuietly(client);
          return res.status(409).json({
            error: 'El stock cambió mientras realizabas el conteo. Revisa y confirma antes de continuar.',
            code: 'STOCK_CHANGED',
            count: changed.length,
          });
        }
      }

      for (const item of itemResult.rows) {
        const stockBefore = Number(item.current_stock);
        const quantity = Number(item.counted_quantity);
        const stockAfter = session.type === 'count' ? quantity : stockBefore + quantity;
        const appliedDelta = stockAfter - stockBefore;
        await client.query(
          `UPDATE inventory SET stock=$1 WHERE tenant_id=$2 AND sku=$3`,
          [stockAfter, req.tenantId, item.sku],
        );
        await client.query(
          `UPDATE inventory_session_items SET final_stock=$1, applied_delta=$2, updated_at=NOW()
           WHERE session_id=$3 AND tenant_id=$4 AND sku=$5`,
          [stockAfter, appliedDelta, req.params.id, req.tenantId, item.sku],
        );
        await client.query(
          `INSERT INTO inventory_movements
             (tenant_id, session_id, sku, movement_type, quantity_delta, stock_before, stock_after, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.tenantId, req.params.id, item.sku, session.type === 'count' ? 'physical_count' : 'restock', appliedDelta, stockBefore, stockAfter, req.user?.sub || null],
        );
      }

      await client.query(
        `UPDATE inventory_sessions SET status='finalized', finalized_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId],
      );
      const finalized = await getSession(client, req.params.id, req.tenantId);
      await client.query('COMMIT');
      res.json(finalized);
    } catch (err) {
      await rollbackQuietly(client);
      sendError(res, 500, 'No se pudo finalizar el inventario', err);
    } finally {
      client.release();
    }
  });

  app.delete('/api/inventory-sessions/:id', ...ownerOnly, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE inventory_sessions SET status='cancelled', cancelled_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2 AND status='draft' RETURNING id`,
        [req.params.id, req.tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Inventario en proceso no encontrado' });
      res.json({ id: Number(result.rows[0].id), status: 'cancelled' });
    } catch (err) {
      sendError(res, 500, 'No se pudo anular el inventario', err);
    }
  });
}

module.exports = {
  ensureInventorySessionTables,
  registerInventorySessionRoutes,
  formatSession,
  formatItem,
};
