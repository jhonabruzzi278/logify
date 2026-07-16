const { createApp } = require('../shared/app');
const { validateOrderBody, validateOrderStatus } = require('../shared/validate');
const { sendEmail, buildOrderConfirmationEmail } = require('../shared/email');
const { signToken, authMiddleware, requireRole, extractRoleFromRequest } = require('../shared/auth');
const { registerSecurityModule } = require('./security-module');
const log = require('../shared/logger');

const { app, pool, sendError, start } = createApp('orders_db', process.env.PORT || 8081);

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8082';
const SHIPPING_URL = process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:8084';

let bcrypt;

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL, status VARCHAR(30) DEFAULT 'CREATED',
    created_at TIMESTAMP DEFAULT NOW(), assigned_to VARCHAR(100), cancel_reason VARCHAR(255))`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_code VARCHAR(20) UNIQUE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, phone VARCHAR(30),
    address VARCHAR(300), email VARCHAR(200), created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS rut VARCHAR(20)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL, role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  // Módulo de seguridad: RUT + correo del trabajador y pregunta secreta para
  // recuperar la clave sin depender de un correo real (SMTP) en el examen.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rut VARCHAR(20) UNIQUE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_question VARCHAR(200)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_answer_hash VARCHAR(255)`);
}

async function seedUsers() {
  bcrypt = require('bcryptjs');
  const existing = await pool.query('SELECT COUNT(*) as cnt FROM users');
  if (parseInt(existing.rows[0].cnt) > 0) return;

  const users = [
    { username: 'admin',        password: 'Admin123!', name: 'Andrés Soto',       role: 'owner' },
    { username: 'operaciones',  password: 'Ops123!',   name: 'Marcela Fuentes',   role: 'ops' },
    { username: 'bodega',       password: 'Bodega123!',name: 'Patricio Salazar',  role: 'warehouse' },
    { username: 'transportista',password: 'Trans123!',  name: 'Luis Carvajal',     role: 'shipper' },
    { username: 'vendedor1',    password: 'Vend123!',   name: 'María González',    role: 'vendor' },
    { username: 'vendedor2',    password: 'Vend123!',   name: 'Carlos Muñoz',      role: 'vendor' },
    { username: 'soporte',      password: 'Sop123!',    name: 'Camila Torres',     role: 'support' },
    { username: 'cliente',      password: 'Cli123!',    name: 'Rosa Mardones',      role: 'customer' },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query('INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)',
      [u.username, hash, u.name, u.role]);
  }
  log.info('Demo users seeded');
}

// Perfil de seguridad de cada usuario demo: RUT (con dígito verificador válido),
// correo asociado y pregunta secreta para recuperación de clave. Todas las cuentas
// demo comparten la misma respuesta ("Firulais") para simplificar la demo en vivo.
const SECURITY_PROFILES = {
  admin:         { rut: '15.845.679-6', email: 'andres.soto@logify.cl' },
  operaciones:   { rut: '16.230.987-0', email: 'marcela.fuentes@logify.cl' },
  bodega:        { rut: '17.384.562-6', email: 'patricio.salazar@logify.cl' },
  transportista: { rut: '18.923.456-2', email: 'luis.carvajal@logify.cl' },
  vendedor1:     { rut: '14.567.890-0', email: 'maria.gonzalez@logify.cl' },
  vendedor2:     { rut: '16.789.012-1', email: 'carlos.munoz@logify.cl' },
  soporte:       { rut: '13.456.780-5', email: 'camila.torres@logify.cl' },
  cliente:       { rut: '19.876.543-0', email: 'rosa.mardones@logify.cl' },
};
const DEMO_SECRET_QUESTION = '¿Cuál es el nombre de tu primera mascota?';
const DEMO_SECRET_ANSWER = 'firulais';

async function ensureSecurityProfiles() {
  bcrypt = require('bcryptjs');
  const answerHash = await bcrypt.hash(DEMO_SECRET_ANSWER, 10);
  for (const [username, profile] of Object.entries(SECURITY_PROFILES)) {
    await pool.query(
      `UPDATE users SET rut=$1, email=$2, secret_question=$3, secret_answer_hash=$4
       WHERE username=$5 AND rut IS NULL`,
      [profile.rut, profile.email, DEMO_SECRET_QUESTION, answerHash, username]
    );
  }
}

async function ensureProcedures() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_get_orders_with_customer(p_status TEXT DEFAULT NULL)
    RETURNS TABLE(order_id INT, customer_name VARCHAR, customer_email VARCHAR,
                  sku VARCHAR, quantity INT, status VARCHAR, created_at TIMESTAMP, assigned_to VARCHAR)
    AS $fn$
    BEGIN
      RETURN QUERY
        SELECT o.id, COALESCE(c.name,'Sin cliente'), COALESCE(c.email,''),
               o.sku, o.quantity, o.status, o.created_at, o.assigned_to
        FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE p_status IS NULL OR o.status = p_status
        ORDER BY o.created_at DESC;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_cancel_order(p_order_id INT, p_reason TEXT DEFAULT '')
    RETURNS SETOF orders AS $fn$
    BEGIN
      UPDATE orders SET status = 'CANCELADO', cancel_reason = p_reason
      WHERE id = p_order_id AND status <> 'CANCELADO';
      RETURN QUERY SELECT * FROM orders WHERE id = p_order_id;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
}

// Roles that must NOT receive client_code in any response
const RESTRICTED_ROLES = new Set(['shipper', 'customer', 'vendor']);

function stripClientCode(rows) {
  rows.forEach(r => { delete r.client_code; });
  return rows;
}

// ═══ AUTH ENDPOINTS ═══════════════════════════════════════════════════════════════

registerSecurityModule(app, pool, sendError);

app.post('/api/auth/login', async (req, res) => {
  try {
    bcrypt = require('bcryptjs');
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    const r = await pool.query('SELECT * FROM users WHERE username=$1', [username.trim().toLowerCase()]);
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciales invalidas' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales invalidas' });
    const token = signToken(user);
    res.json({ token, role: user.role, name: user.name, username: user.username, rut: user.rut || null, email: user.email || null });
  } catch (err) { sendError(res, 500, 'Login failed', err); }
});

app.post('/api/auth/register', authMiddleware, requireRole('owner', 'admin'), async (req, res) => {
  try {
    bcrypt = require('bcryptjs');
    const { username, password, name, role, rut, email, secretQuestion, secretAnswer } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({ error: 'username, password, name y role son requeridos' });
    }
    const validRoles = ['owner', 'ops', 'warehouse', 'shipper', 'vendor', 'support', 'customer'];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({ error: 'Rol invalido. Validos: ' + validRoles.join(', ') });
    }
    const exists = await pool.query('SELECT 1 FROM users WHERE username=$1', [username.trim().toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'El usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const secretAnswerHash = secretAnswer ? await bcrypt.hash(secretAnswer.trim().toLowerCase(), 10) : null;
    const user = (await pool.query(
      `INSERT INTO users (username, password_hash, name, role, rut, email, secret_question, secret_answer_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, username, name, role, rut, email, secret_question, created_at`,
      [username.trim().toLowerCase(), hash, name.trim(), role.toLowerCase(), rut || null, email || null, secretQuestion || null, secretAnswerHash])).rows[0];
    res.status(201).json(user);
  } catch (err) { sendError(res, 500, 'Register failed', err); }
});

app.get('/api/auth/users', authMiddleware, requireRole('owner', 'admin'), async (_req, res) => {
  try {
    const rows = (await pool.query('SELECT id, username, name, role, rut, email, secret_question, created_at, updated_at FROM users ORDER BY username')).rows;
    res.json(rows);
  } catch (err) { sendError(res, 500, 'Failed to list users', err); }
});

app.put('/api/auth/users/:id', authMiddleware, requireRole('owner', 'admin'), async (req, res) => {
  try {
    bcrypt = require('bcryptjs');
    const { name, role, password } = req.body;
    const existing = (await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });
    const newName = name || existing.name;
    const newRole = role || existing.role;
    const hash = password ? await bcrypt.hash(password, 10) : existing.password_hash;
    const updated = (await pool.query(
      'UPDATE users SET name=$1, role=$2, password_hash=$3, updated_at=NOW() WHERE id=$4 RETURNING id, username, name, role, created_at, updated_at',
      [newName, newRole.toLowerCase(), hash, req.params.id])).rows[0];
    res.json(updated);
  } catch (err) { sendError(res, 500, 'Failed to update user', err); }
});

app.delete('/api/auth/users/:id', authMiddleware, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM users WHERE id=$1 RETURNING id, username', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado', user: r.rows[0] });
  } catch (err) { sendError(res, 500, 'Failed to delete user', err); }
});

// ═══ ORDER ENDPOINTS ═══════════════════════════════════════════════════════════════

app.get('/api/orders/test', (_req, res) => res.send('orders-service UP'));

// Public tracking — only safe fields, no contact data
app.get('/api/orders/track/:clientCode', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.sku, o.quantity, o.status, o.created_at, o.client_code, o.cancel_reason,
              c.name as customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.client_code = $1`,
      [req.params.clientCode.toUpperCase()]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Código de cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to track order', err); }
});

app.get('/api/orders/report', authMiddleware, async (req, res) => {
  try {
    const status = req.query.status ? req.query.status.toUpperCase() : null;
    const r = await pool.query('SELECT * FROM fn_get_orders_with_customer($1)', [status]);
    res.json(r.rows);
  } catch (err) { sendError(res, 500, 'Failed to get orders report', err); }
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const errors = validateOrderBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    const { customerId, sku, quantity } = req.body;
    const clientCode = 'SL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const order = (await pool.query(
      "INSERT INTO orders (customer_id, sku, quantity, status, created_at, client_code) VALUES ($1,$2,$3,'CREATED',NOW(),$4) RETURNING *",
      [customerId, sku, quantity, clientCode])).rows[0];

    const customer = (await pool.query('SELECT * FROM customers WHERE id=$1', [customerId])).rows[0];
    const customerCode = order.client_code;

    if (customer && customer.email) {
      const { subject, html } = buildOrderConfirmationEmail({
        customerName: customer.name,
        orderId: order.id,
        sku: order.sku,
        quantity: order.quantity,
        customerCode
      });
      sendEmail({ to: customer.email, subject, html }).catch(() => {});
    }

    res.status(201).json({
      orderId: order.id, status: order.status, sku: order.sku,
      quantity: order.quantity, customerId: order.customer_id,
      message: 'Orden creada correctamente', createdAt: order.created_at,
      customerCode
    });
  } catch (err) { sendError(res, 500, 'Failed to create order', err); }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const role = extractRoleFromRequest(req);
    const limit = req.query.limit ? Math.min(500, Math.max(1, parseInt(req.query.limit))) : null;
    const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
    let query = `SELECT o.*, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC`;
    const params = [];
    if (limit && page) {
      const offset = (page - 1) * limit;
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    const rows = (await pool.query(query, params)).rows;
    if (RESTRICTED_ROLES.has(role)) stripClientCode(rows);
    res.json(rows);
  }
  catch (err) { sendError(res, 500, 'Failed to list orders', err); }
});

app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const role = extractRoleFromRequest(req);
    const r = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const row = r.rows[0];
    if (RESTRICTED_ROLES.has(role)) delete row.client_code;
    res.json(row);
  } catch (err) { sendError(res, 500, 'Failed to get order', err); }
});

app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const statusErr = validateOrderStatus(req.query.status?.toUpperCase() || '');
    if (statusErr.length) return res.status(400).json({ error: statusErr.join(', ') });
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [req.query.status.toUpperCase(), req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update status', err); }
});

app.put('/api/orders/:id/confirm', authMiddleware, async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const errors = [];

    try { await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=-${order.quantity}`, { method: 'POST' }); }
    catch (e) { log.error('Inventory adjustment failed', { orderId, message: e.message }); errors.push(`Inventario: ${e.message}`); }

    try { await req.forwardedFetch(`${SHIPPING_URL}/api/shipments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: parseInt(orderId), customerId: order.customer_id, sku: order.sku, quantity: order.quantity }) }); }
    catch (e) { log.error('Shipment creation failed', { orderId, message: e.message }); errors.push(`Envío: ${e.message}`); }

    await pool.query("UPDATE orders SET status='EN_PREPARACION' WHERE id=$1", [orderId]);
    const updated = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    log.info('Order confirmed', { orderId, hasErrors: errors.length > 0 });
    res.json({ ...updated, warnings: errors.length ? errors : undefined });
  } catch (err) { sendError(res, 500, 'Failed to confirm order', err); }
});

app.put('/api/orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id])).rows[0];
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const reason = (req.body.reason || '').substring(0, 255);

    if (order.status === 'EN_PREPARACION' || order.status === 'EN_REPARTO') {
      try { await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=+${order.quantity}`, { method: 'POST' }); }
      catch (e) { log.error('Stock restore failed', { orderId: req.params.id, message: e.message }); }

      try {
        const shipmentResp = await req.forwardedFetch(`${SHIPPING_URL}/api/shipments/${order.id}`, { method: 'GET' });
        const shipment = await shipmentResp.json();
        if (shipment && shipment.id && shipment.status !== 'CANCELADO') {
          await req.forwardedFetch(`${SHIPPING_URL}/api/shipments/${shipment.id}/stage?stage=CANCELADO`, { method: 'PUT' });
          log.info('Linked shipment cancelled', { orderId: req.params.id, shipmentId: shipment.id });
        }
      } catch (e) { log.warn('Shipment cancel failed', { orderId: req.params.id, message: e.message }); }
    }

    const cancelled = (await pool.query('SELECT * FROM fn_cancel_order($1,$2)', [req.params.id, reason])).rows[0];
    res.json(cancelled);
  } catch (err) { sendError(res, 500, 'Failed to cancel order', err); }
});

app.put('/api/orders/:id/assign', authMiddleware, async (req, res) => {
  try {
    const transporter = (req.query.transporter || '').substring(0, 100);
    if (!transporter) return res.status(400).json({ error: 'transporter es requerido' });
    const result = await pool.query('UPDATE orders SET assigned_to=$1 WHERE id=$2 RETURNING *', [transporter, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to assign', err); }
});

app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    log.info('Order deleted', { orderId: req.params.id });
    res.json({ message: 'Orden eliminada correctamente', order: result.rows[0] });
  } catch (err) { sendError(res, 500, 'Failed to delete order', err); }
});

// ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

function validateRutChileno(rut) {
  const clean = String(rut).replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return { valid: false, error: 'Formato inválido. Ejemplo: 12345678-9' };
  const digits = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + expectedDv;
  return { valid: dv === expectedDv, formatted, digitoVerificador: expectedDv };
}

app.get('/api/customers/validate-rut', async (req, res) => {
  const { rut } = req.query;
  if (!rut) return res.status(400).json({ error: 'rut es requerido. Ej: ?rut=12345678-9' });
  res.json(validateRutChileno(rut));
});

app.get('/api/customers/address-suggest', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.status(400).json({ error: 'q debe tener al menos 3 caracteres' });
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Chile')}&format=json&addressdetails=1&limit=5&countrycodes=cl`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Logify/1.0 (logistica@logify.cl)', 'Accept-Language': 'es' } });
    if (!response.ok) throw new Error(`Nominatim error ${response.status}`);
    const data = await response.json();
    res.json(data.map(item => ({
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      address: {
        road: item.address?.road,
        houseNumber: item.address?.house_number,
        city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality,
        state: item.address?.state,
        postcode: item.address?.postcode
      }
    })));
  } catch (err) { sendError(res, 500, 'Address suggest failed', err); }
});

app.get('/api/orders/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
              c.address AS customer_address, c.phone AS customer_phone, c.rut AS customer_rut
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const order = r.rows[0];

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=orden-${order.id}.pdf`);
    doc.pipe(res);

    doc.fontSize(22).fillColor('#0f172a').text('Logify', { align: 'center' });
    doc.fontSize(13).fillColor('#475569').text('Comprobante de Pedido', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`Pedido #${order.id}`, { continued: true }).text(`  Estado: ${order.status}`, { align: 'right' });
    doc.text(`Fecha: ${new Date(order.created_at).toLocaleDateString('es-CL')}`, { continued: true });
    if (order.client_code) doc.text(`  Código: ${order.client_code}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).fillColor('#334155').text('Detalle del Pedido', { underline: true });
    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`SKU: ${order.sku}`);
    doc.text(`Cantidad: ${order.quantity}`);
    if (order.assigned_to) doc.text(`Asignado a: ${order.assigned_to}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#334155').text('Cliente', { underline: true });
    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`Nombre: ${order.customer_name || 'Sin asignar'}`);
    if (order.customer_rut) doc.text(`RUT: ${order.customer_rut}`);
    if (order.customer_email) doc.text(`Email: ${order.customer_email}`);
    if (order.customer_phone) doc.text(`Teléfono: ${order.customer_phone}`);
    if (order.customer_address) doc.text(`Dirección: ${order.customer_address}`);
    doc.moveDown(2);

    doc.fontSize(9).fillColor('#94a3b8').text('Documento generado por Logify — ' + new Date().toLocaleString('es-CL'), { align: 'center' });
    doc.end();
  } catch (err) { sendError(res, 500, 'PDF generation failed', err); }
});

// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/customers', authMiddleware, async (_req, res) => {
  try { res.json((await pool.query('SELECT * FROM customers ORDER BY name')).rows); }
  catch (err) { sendError(res, 500, 'Failed to list customers', err); }
});

app.get('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to get customer', err); }
});

app.post('/api/customers', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, email, rut } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const c = (await pool.query(
      'INSERT INTO customers (name, phone, address, email, rut) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name.trim(), phone || null, address || null, email || null, rut || null])).rows[0];
    res.status(201).json(c);
  } catch (err) { sendError(res, 500, 'Failed to create customer', err); }
});

app.put('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, email, rut } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await pool.query(
      'UPDATE customers SET name=$1, phone=$2, address=$3, email=$4, rut=$5 WHERE id=$6 RETURNING *',
      [name.trim(), phone || null, address || null, email || null, rut || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update customer', err); }
});

app.delete('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM customers WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (err) { sendError(res, 500, 'Failed to delete customer', err); }
});

if (require.main === module) {
  (async () => { await ensureTables(); await seedUsers(); await ensureSecurityProfiles(); await ensureProcedures(); start(); })();
}

module.exports = { app };
