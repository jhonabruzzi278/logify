const { randomUUID } = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { verifyToken } = require('../shared/auth');
const { isClerkConfigured, verifyClerkToken } = require('../shared/clerk-auth');

const subscribers = new Map();

function cartKey(tenantId, userId) {
  return `${tenantId}:${userId}`;
}

function getUserId(req) {
  return String(req.user?.sub || req.user?.username || '').trim();
}

function publish(tenantId, userId, payload) {
  const listeners = subscribers.get(cartKey(tenantId, userId));
  if (!listeners) return;
  const message = JSON.stringify({ type: 'cart', cart: payload });
  for (const socket of listeners) {
    if (socket.readyState === WebSocket.OPEN) {
      try { socket.send(message); } catch { socket.terminate(); }
    }
  }
}

async function authenticateSocket(request) {
  const protocols = String(request.headers['sec-websocket-protocol'] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (!protocols.includes('logify-cart-v1')) throw new Error('Protocolo no soportado');
  const bearerProtocol = protocols.find((value) => value.startsWith('auth.'));
  const token = bearerProtocol?.slice(5);
  if (!token) throw new Error('Token requerido');
  if (isClerkConfigured()) {
    try { return await verifyClerkToken(token); } catch { /* probar JWT local */ }
  }
  return verifyToken(token);
}

function registerPosCartWebSocket(server) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => protocols.has('logify-cart-v1') ? 'logify-cart-v1' : false,
  });

  server.on('upgrade', async (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/api/pos/cart/ws') { socket.destroy(); return; }
    try {
      const user = await authenticateSocket(request);
      if (!user?.sub || !user?.tenant_id || !['owner', 'vendor'].includes(String(user.role || '').toLowerCase())) {
        throw new Error('Acceso denegado');
      }
      request.cartIdentity = { tenantId: Number(user.tenant_id), userId: String(user.sub) };
      wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit('connection', webSocket, request));
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (socket, request) => {
    const { tenantId, userId } = request.cartIdentity;
    const key = cartKey(tenantId, userId);
    const listeners = subscribers.get(key) || new Set();
    listeners.add(socket);
    subscribers.set(key, listeners);
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.send(JSON.stringify({ type: 'connected' }));
    socket.on('close', () => {
      listeners.delete(socket);
      if (!listeners.size) subscribers.delete(key);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 25000);
  heartbeat.unref?.();
  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

async function ensurePosCartTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS pos_carts (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pos_cart_items (
    id VARCHAR(36) PRIMARY KEY,
    cart_id VARCHAR(36) NOT NULL REFERENCES pos_carts(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL,
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL DEFAULT 0,
    is_manual_amount BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, sku)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pos_cart_items_tenant ON pos_cart_items (tenant_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pos_cart_mutations (
    tenant_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    mutation_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id, mutation_id)
  )`);
}

async function ensureCart(client, tenantId, userId) {
  const id = randomUUID();
  return (await client.query(
    `WITH inserted AS (
       INSERT INTO pos_carts (id, tenant_id, user_id) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, user_id) DO NOTHING RETURNING *
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT * FROM pos_carts WHERE tenant_id=$2 AND user_id=$3
     LIMIT 1`,
    [id, tenantId, userId]
  )).rows[0];
}

async function readCart(client, tenantId, userId) {
  const cart = await ensureCart(client, tenantId, userId);
  const rows = (await client.query(
    `SELECT ci.*, i.id AS product_id, i.barcode, i.stock, i.cost, i.category,
            i.image_url, i.unit_of_measure, i.tax_rate, i.active
       FROM pos_cart_items ci
       LEFT JOIN inventory i ON i.tenant_id=ci.tenant_id AND i.sku=ci.sku
      WHERE ci.cart_id=$1 ORDER BY ci.created_at, ci.id`,
    [cart.id]
  )).rows;
  return {
    id: cart.id,
    version: Number(cart.version),
    updatedAt: cart.updated_at,
    items: rows.map((row) => ({
      id: row.id,
      quantity: Number(row.quantity),
      isManualAmount: row.is_manual_amount,
      product: {
        id: row.product_id != null ? String(row.product_id) : row.id,
        sku: row.sku,
        barcode: row.barcode || undefined,
        name: row.product_name,
        stock: row.is_manual_amount ? 1 : Number(row.stock || 0),
        price: Number(row.unit_price),
        cost: Number(row.cost || 0),
        category: row.category || 'otros',
        imageUrl: row.image_url || undefined,
        unitOfMeasure: row.unit_of_measure || 'unidad',
        taxRate: Number(row.tax_rate || 0),
        active: row.active !== false,
        status: Number(row.stock || 0) <= 0 ? 'out' : Number(row.stock || 0) <= 5 ? 'low' : 'healthy',
        updatedAt: row.updated_at,
      },
    })),
  };
}

function registerPosCartRoutes({ app, pool, authMiddleware, requireTenant, requireRole, sendError }) {
  const access = [authMiddleware, requireTenant, requireRole('owner', 'vendor')];

  app.get('/api/pos/cart', ...access, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });
      res.json(await readCart(pool, req.tenantId, userId));
    } catch (err) { sendError(res, 500, 'Failed to load POS cart', err); }
  });

  async function mutate(req, res, operation) {
    const userId = getUserId(req);
    const mutationId = String(req.body?.mutationId || '').trim();
    if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });
    if (!mutationId || mutationId.length > 100) return res.status(400).json({ error: 'mutationId es requerido' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cart = await ensureCart(client, req.tenantId, userId);
      await client.query('SELECT id FROM pos_carts WHERE id=$1 FOR UPDATE', [cart.id]);
      const inserted = await client.query(
        `INSERT INTO pos_cart_mutations (tenant_id,user_id,mutation_id) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING RETURNING mutation_id`,
        [req.tenantId, userId, mutationId]
      );
      if (inserted.rows.length) {
        await operation(client, cart);
        await client.query('UPDATE pos_carts SET version=version+1, updated_at=NOW() WHERE id=$1', [cart.id]);
      }
      const result = await readCart(client, req.tenantId, userId);
      await client.query('COMMIT');
      publish(req.tenantId, userId, result);
      return res.json(result);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      sendError(res, 500, 'Failed to update POS cart', err);
    } finally { client.release(); }
  }

  app.post('/api/pos/cart/items', ...access, (req, res) => mutate(req, res, async (client, cart) => {
    const sku = String(req.body?.sku || '').trim();
    const quantity = Number.parseInt(req.body?.quantity, 10);
    if (!sku || !Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('sku y quantity positiva son requeridos'), { statusCode: 400 });
    const product = (await client.query(
      'SELECT sku,name,price,stock,active FROM inventory WHERE tenant_id=$1 AND sku=$2 FOR UPDATE',
      [req.tenantId, sku]
    )).rows[0];
    if (!product || product.active === false) throw Object.assign(new Error('Producto no encontrado o inactivo'), { statusCode: 404 });
    const current = (await client.query('SELECT quantity FROM pos_cart_items WHERE cart_id=$1 AND sku=$2', [cart.id, sku])).rows[0];
    if (Number(current?.quantity || 0) + quantity > Number(product.stock)) throw Object.assign(new Error(`Stock insuficiente para ${product.name}`), { statusCode: 409 });
    await client.query(
      `INSERT INTO pos_cart_items (id,cart_id,tenant_id,sku,product_name,quantity,unit_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (cart_id,sku) DO UPDATE SET quantity=pos_cart_items.quantity+EXCLUDED.quantity,
         product_name=EXCLUDED.product_name,unit_price=EXCLUDED.unit_price,updated_at=NOW()`,
      [randomUUID(), cart.id, req.tenantId, product.sku, product.name || product.sku, quantity, Number(product.price || 0)]
    );
  }));

  app.post('/api/pos/cart/manual-items', ...access, (req, res) => mutate(req, res, async (client, cart) => {
    const label = String(req.body?.label || '').trim();
    const amount = Number(req.body?.amount);
    if (!label || !Number.isFinite(amount)) throw Object.assign(new Error('label y amount son requeridos'), { statusCode: 400 });
    const id = randomUUID();
    await client.query(
      `INSERT INTO pos_cart_items (id,cart_id,tenant_id,sku,product_name,quantity,unit_price,is_manual_amount)
       VALUES ($1,$2,$3,$4,$5,1,$6,true)`,
      [id, cart.id, req.tenantId, `MANUAL-${id}`, label, Math.round(amount)]
    );
  }));

  app.patch('/api/pos/cart/items/:itemId', ...access, (req, res) => mutate(req, res, async (client, cart) => {
    const quantity = Number.parseInt(req.body?.quantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) throw Object.assign(new Error('quantity debe ser positiva'), { statusCode: 400 });
    const item = (await client.query(
      `SELECT ci.*,i.stock FROM pos_cart_items ci LEFT JOIN inventory i ON i.tenant_id=ci.tenant_id AND i.sku=ci.sku
       WHERE ci.id=$1 AND ci.cart_id=$2 FOR UPDATE OF ci`, [req.params.itemId, cart.id]
    )).rows[0];
    if (!item) throw Object.assign(new Error('Línea no encontrada'), { statusCode: 404 });
    if (!item.is_manual_amount && quantity > Number(item.stock || 0)) throw Object.assign(new Error('Stock insuficiente'), { statusCode: 409 });
    await client.query('UPDATE pos_cart_items SET quantity=$1,updated_at=NOW() WHERE id=$2', [quantity, item.id]);
  }));

  app.delete('/api/pos/cart/items/:itemId', ...access, (req, res) => mutate(req, res, async (client, cart) => {
    const removed = await client.query('DELETE FROM pos_cart_items WHERE id=$1 AND cart_id=$2 RETURNING id', [req.params.itemId, cart.id]);
    if (!removed.rows.length) throw Object.assign(new Error('Línea no encontrada'), { statusCode: 404 });
  }));

  app.delete('/api/pos/cart', ...access, (req, res) => mutate(req, res, async (client, cart) => {
    await client.query('DELETE FROM pos_cart_items WHERE cart_id=$1', [cart.id]);
  }));

  app.post('/api/pos/cart/checkout', ...access, async (req, res) => {
    const userId = getUserId(req);
    const mutationId = String(req.body?.mutationId || '').trim();
    if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });
    if (!mutationId) return res.status(400).json({ error: 'mutationId es requerido' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cart = await ensureCart(client, req.tenantId, userId);
      await client.query('SELECT id FROM pos_carts WHERE id=$1 FOR UPDATE', [cart.id]);
      const duplicate = (await client.query('SELECT 1 FROM pos_cart_mutations WHERE tenant_id=$1 AND user_id=$2 AND mutation_id=$3', [req.tenantId, userId, mutationId])).rows.length;
      if (duplicate) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Esta venta ya fue procesada' });
      }
      const items = (await client.query('SELECT * FROM pos_cart_items WHERE cart_id=$1 ORDER BY created_at FOR UPDATE', [cart.id])).rows;
      if (!items.length) throw Object.assign(new Error('El carrito está vacío'), { statusCode: 400 });
      const saleGroup = `POS-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const sales = [];
      let total = 0;
      for (const item of items) {
        let cost = null;
        if (!item.is_manual_amount) {
          const product = (await client.query('SELECT stock,cost FROM inventory WHERE tenant_id=$1 AND sku=$2 FOR UPDATE', [req.tenantId, item.sku])).rows[0];
          if (!product || Number(product.stock) < Number(item.quantity)) throw Object.assign(new Error(`Stock insuficiente para ${item.product_name}`), { statusCode: 409 });
          cost = product.cost;
          await client.query('UPDATE inventory SET stock=stock-$1 WHERE tenant_id=$2 AND sku=$3', [item.quantity, req.tenantId, item.sku]);
        }
        const subtotal = Number(item.unit_price) * Number(item.quantity);
        total += subtotal;
        sales.push((await client.query(
          `INSERT INTO sales (sku,quantity,sale_group,payment_method,vendor_id,vendor_name,unit_price,total,customer_id,customer_name,cost,sale_date,tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12) RETURNING *`,
          [item.is_manual_amount ? item.product_name : item.sku, item.quantity, saleGroup, req.body.paymentMethod || 'cash',
           req.body.vendorId || userId, req.body.vendorName || '', item.unit_price, subtotal, req.body.customerId || null,
           req.body.customerName || null, cost, req.tenantId]
        )).rows[0]);
      }
      await client.query('DELETE FROM pos_cart_items WHERE cart_id=$1', [cart.id]);
      await client.query('UPDATE pos_carts SET version=version+1,updated_at=NOW() WHERE id=$1', [cart.id]);
      await client.query('INSERT INTO pos_cart_mutations (tenant_id,user_id,mutation_id) VALUES ($1,$2,$3)', [req.tenantId, userId, mutationId]);
      await client.query('COMMIT');
      const emptyCart = await readCart(pool, req.tenantId, userId);
      publish(req.tenantId, userId, emptyCart);
      res.status(201).json({ saleGroup, items: sales, total, cart: emptyCart });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      sendError(res, 500, 'Failed to checkout POS cart', err);
    } finally { client.release(); }
  });
}

module.exports = { ensurePosCartTables, registerPosCartRoutes, registerPosCartWebSocket, authenticateSocket, publishCartUpdate: publish };
