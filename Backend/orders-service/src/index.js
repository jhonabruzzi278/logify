const { createApp } = require('../shared/app');
const { validateOrderBody, validateOrderStatus } = require('../shared/validate');
const { sendEmail, buildOrderConfirmationEmail, buildWelcomeEmail } = require('../shared/email');
const { signToken, authMiddleware, requireRole, requireTenant, extractRoleFromRequest } = require('../shared/auth');
const { attachTenantDb } = require('../shared/rls');
const { registerSecurityModule, validatePasswordStrength } = require('./security-module');
const { requireAdminKey } = require('../shared/admin');
const { requirePlatformAdmin } = require('../shared/platform-auth');
const log = require('../shared/logger');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const { app, pool, runtimePool, sendError, start } = createApp('orders_db', process.env.PORT || 8081);
const withTenantDb = attachTenantDb(runtimePool);

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8082';
const SHIPPING_URL = process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:8084';
// Trafico interno entre contenedores dentro de la red privada de Docker
// (logify-net), nunca sale a internet -- mismo patron que INVENTORY_URL/
// SHIPPING_URL arriba, que ya usan http:// sin TLS por el mismo motivo.
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8085'; // NOSONAR
const DEFAULT_TENANT_SLUG = 'logify';
// Las invitaciones se aceptan en el portal de la aplicación. APP_URL también
// se usa para enlaces de la landing y puede apuntar a logify.cl, por eso no se
// reutiliza aquí: un enlace de invitación en la landing termina en 404.
const INVITE_APP_URL = process.env.INVITE_APP_URL || 'https://app.logify.cl';

// Identificadores internos reservados para infraestructura. Aunque ya no son
// subdominios de clientes, el slug sigue siendo una clave estable del tenant.
const RESERVED_TENANT_SLUGS = new Set(['www', 'api', 'app', 'gestion', 'admin', 'mail', 'logify', 'static', 'landing', 'demo', 'status']);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const TRIAL_DAYS = 30;
const SUPPORT_WHATSAPP_URL = process.env.SUPPORT_WHATSAPP_URL || 'https://wa.me/56938980598';

function configuredBillingProviders() {
  return [
    {
      id: 'flow',
      name: 'Flow',
      configured: Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY),
    },
    {
      id: 'mercado_pago',
      name: 'Mercado Pago',
      configured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    },
  ];
}

let bcrypt;

// Fase 4C del roadmap multi-tenant (ver wiki/Multi-Tenant.md): resuelve el
// tenant desde el slug del subdominio, con fallback al tenant por defecto
// cuando no viene header (desarrollo local, o cualquier cliente que no lo
// mande). Usado antes de tener JWT (login, forgot-password).
async function resolveTenant(slug) {
  const r = await pool.query('SELECT * FROM tenants WHERE slug=$1', [(slug || DEFAULT_TENANT_SLUG).toLowerCase()]);
  return r.rows[0] || null;
}

// Fase 4E: valida formato + reserva de un slug candidato para signup. No
// chequea disponibilidad contra la base (eso requiere una query aparte,
// usada tanto en /api/signup como en /api/signup/check-slug).
function validateSlugFormat(slug) {
  const value = (slug || '').trim().toLowerCase();
  if (!value) return 'El identificador es obligatorio';
  if (!SLUG_PATTERN.test(value)) return 'El identificador debe tener 3-63 caracteres: minusculas, numeros y guiones, sin empezar ni terminar en guion';
  if (RESERVED_TENANT_SLUGS.has(value)) return 'Ese identificador esta reservado, elige otro';
  return null;
}

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
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS province VARCHAR(100)`);

  // Fase 2 del roadmap de expansión comercial (ver aidlc-docs/): apertura a
  // B2C. customer_type distingue consumidor final ('individual', sin RUT
  // obligatorio) de empresa ('company', el comportamiento previo por
  // defecto). credit_limit/credit_balance soportan cuenta corriente/fiado —
  // el saldo se cachea en la columna y se ajusta atómicamente vía
  // fn_adjust_customer_credit (mismo patrón que fn_adjust_stock en
  // inventory-service), con el detalle en customer_credit_movements.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) NOT NULL DEFAULT 'company'`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_balance NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_credit_movements (
    id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
    type VARCHAR(10) NOT NULL, amount NUMERIC NOT NULL, balance_after NUMERIC NOT NULL,
    reference_type VARCHAR(20), reference_id VARCHAR(100), note VARCHAR(255),
    created_by VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_credit_movements_tenant ON customer_credit_movements (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_credit_movements_customer ON customer_credit_movements (customer_id)`);
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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
  // Groundwork Clerk (ver ADR-004): puente hacia el usuario de Clerk. Nullable
  // porque la mayoria de los usuarios existentes no tienen equivalente en
  // Clerk todavia -- se completa via el webhook de sincronizacion
  // (routes/webhooks.routes.js) cuando un tenant migra. password_hash deja de
  // ser obligatorio para usuarios gestionados por Clerk (Clerk guarda la
  // credencial, no Logify).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(100) UNIQUE`);
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, email VARCHAR(200) NOT NULL,
    role VARCHAR(50) NOT NULL, token VARCHAR(64) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending',
    invited_by VARCHAR(100), expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW(),
    clerk_invitation_id VARCHAR(100))`);
  await pool.query(`ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS clerk_invitation_id VARCHAR(100)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant ON user_invitations (tenant_id)`);
  await ensureTenants();
}

// Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): agrega la tabla
// tenants y una columna tenant_id nullable->backfill->NOT NULL en las tablas
// de este servicio. El tenant id=1 "logify" agrupa todos los datos existentes
// y es el mismo id fijo que usan las migraciones de los otros 3 servicios,
// ya que no hay FK entre bases (Postgres no lo permite cross-database).
async function ensureTenants() {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY, slug VARCHAR(63) NOT NULL UNIQUE, name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'trial', plan VARCHAR(50) NOT NULL DEFAULT 'trial',
    contact_email VARCHAR(200), settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`
    INSERT INTO tenants (id, slug, name, status, plan)
    VALUES (1, 'logify', 'Logify', 'active', 'enterprise')
    ON CONFLICT (id) DO NOTHING`);
  await pool.query(`SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants), 1))`);
  // Configuración del negocio (Fase 1 del roadmap de expansión comercial, ver
  // aidlc-docs/): datos que aparecen en tickets/reportes. Los toggles de
  // sistema (caja, redondeo, etc.) no necesitan tabla propia, viven en el
  // JSONB `settings` que ya existía sin uso.
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_rut VARCHAR(20)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_country VARCHAR(100)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_industry VARCHAR(100)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_phone VARCHAR(30)`);

  // Groundwork Clerk (ver ADR-004): puente hacia la Organization de Clerk.
  // 1 Organization de Clerk = 1 fila de tenants. Nullable porque los tenants
  // existentes no tienen Organization todavia -- se completa via el webhook
  // de sincronizacion cuando se crea/vincula la Organization en Clerk.
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS clerk_org_id VARCHAR(100) UNIQUE`);

  // Fase 4E del roadmap multi-tenant (ver wiki/Multi-Tenant.md): provisioning
  // self-service. trial_ends_at soporta la demo gratuita de 30 dias;
  // subscription_status/plan_price_clp/billing_provider/billing_customer_id
  // quedan preparados para cuando se active el cobro real (un unico plan
  // mensual) pero ningun proveedor de pago se integra todavia — todos
  // nullable/con default neutro para no romper tenants existentes.
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) NOT NULL DEFAULT 'trialing'`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_price_clp INTEGER`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_provider VARCHAR(30)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_customer_id VARCHAR(100)`);

  // Onboarding sin friccion (wizard tipo typeform en Landing/pages/registro.js):
  // datos adicionales recolectados al crear la cuenta, para segmentar y
  // personalizar la activacion del tenant nuevo.
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS used_pos_before BOOLEAN`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_goals JSONB DEFAULT '[]'`);
  // Los tenants existentes quedan marcados como configurados al crear la
  // columna. Inmediatamente se retira el default para que cada tenant nuevo
  // deba completar el onboarding después de su primer login.
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE tenants ALTER COLUMN onboarding_completed_at DROP DEFAULT`);

  // Cupones de bienvenida: dias extra de demo gratuita, canjeables una vez
  // por tenant. Tabla a nivel plataforma (sin tenant_id propio).
  await pool.query(`CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
    extra_trial_days INTEGER NOT NULL DEFAULT 90,
    max_redemptions INTEGER, redemptions_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP, active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, coupon_id INTEGER NOT NULL,
    redeemed_at TIMESTAMP DEFAULT NOW(), UNIQUE(tenant_id, coupon_id))`);

  for (const table of ['users', 'customers', 'orders']) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
    await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
  }
}

// Fase 4C del roadmap multi-tenant: username y rut dejan de ser unicos
// globalmente y pasan a ser unicos por tenant (dos empresas pueden tener
// ambas un usuario "admin"). Se elimina el UNIQUE global original
// (declarado inline en la columna) y se crea el indice compuesto.
async function ensureTenantConstraints() {
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key`);
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rut_key`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_users_tenant_username ON users (tenant_id, username)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_users_tenant_rut ON users (tenant_id, rut)`);
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
    await pool.query('INSERT INTO users (username, password_hash, name, role, tenant_id) VALUES ($1,$2,$3,$4,1)',
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
  // Fase 4C del roadmap multi-tenant: ambos SP ahora reciben p_tenant_id y
  // filtran por el, ademas del status/id. drop previo porque cambia la firma
  // (numero/orden de parametros), CREATE OR REPLACE no permite eso.
  await pool.query(`DROP FUNCTION IF EXISTS fn_get_orders_with_customer(TEXT)`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_get_orders_with_customer(p_status TEXT, p_tenant_id INT)
    RETURNS TABLE(order_id INT, customer_name VARCHAR, customer_email VARCHAR,
                  sku VARCHAR, quantity INT, status VARCHAR, created_at TIMESTAMP, assigned_to VARCHAR)
    AS $fn$
    BEGIN
      RETURN QUERY
        SELECT o.id, COALESCE(c.name,'Sin cliente'), COALESCE(c.email,''),
               o.sku, o.quantity, o.status, o.created_at, o.assigned_to
        FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.tenant_id = p_tenant_id AND (p_status IS NULL OR o.status = p_status)
        ORDER BY o.created_at DESC;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP FUNCTION IF EXISTS fn_cancel_order(INT, TEXT)`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_cancel_order(p_order_id INT, p_reason TEXT, p_tenant_id INT)
    RETURNS SETOF orders AS $fn$
    BEGIN
      UPDATE orders SET status = 'CANCELADO', cancel_reason = p_reason
      WHERE id = p_order_id AND tenant_id = p_tenant_id AND status <> 'CANCELADO';
      RETURN QUERY SELECT * FROM orders WHERE id = p_order_id AND tenant_id = p_tenant_id;
    END;
    $fn$ LANGUAGE plpgsql;
  `);

  // Fase 2 del roadmap de expansión comercial: ajuste atómico del saldo de
  // cuenta corriente, mismo patrón de locking que fn_adjust_stock en
  // inventory-service (SELECT ... FOR UPDATE, rechaza si viola el invariante
  // — aquí, superar el límite de crédito del cliente).
  await pool.query(`DROP FUNCTION IF EXISTS fn_adjust_customer_credit(INT, NUMERIC, INT)`).catch(() => {});
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_adjust_customer_credit(p_customer_id INT, p_delta NUMERIC, p_tenant_id INT)
    RETURNS TABLE(new_balance NUMERIC, success BOOLEAN, error_msg TEXT)
    AS $fn$
    DECLARE v_new_balance NUMERIC; v_limit NUMERIC;
    BEGIN
      SELECT credit_limit INTO v_limit FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::NUMERIC, FALSE, 'Cliente no encontrado'::TEXT; RETURN;
      END IF;
      UPDATE customers SET credit_balance = credit_balance + p_delta
        WHERE id = p_customer_id AND tenant_id = p_tenant_id
          AND (v_limit IS NULL OR credit_balance + p_delta <= v_limit)
        RETURNING credit_balance INTO v_new_balance;
      IF v_new_balance IS NOT NULL THEN
        RETURN QUERY SELECT v_new_balance, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT NULL::NUMERIC, FALSE, 'El cargo supera el límite de crédito del cliente'::TEXT;
      END IF;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
}

// Row Level Security (ver wiki/Seguridad-y-RLS.md y el hallazgo de la
// auditoria de produccion): las politicas de abajo son la red de seguridad
// a nivel de base de datos para el aislamiento multi-tenant, complementando
// (no reemplazando) los WHERE tenant_id=$N que ya tiene cada query. Un
// superusuario de Postgres SIEMPRE bypassea RLS sin importar FORCE ROW LEVEL
// SECURITY, asi que esto solo protege de verdad si las queries de request
// corren con el rol restringido "app_runtime" (ver shared/rls.js) -- por eso
// existe runtimePool/DB_RUNTIME_URL separado de la conexion de superusuario
// que usa ensureTables/seedUsers al arrancar.
const RLS_TABLES = [
  { name: 'orders', tenantColumn: 'tenant_id' },
  { name: 'customers', tenantColumn: 'tenant_id' },
  { name: 'customer_credit_movements', tenantColumn: 'tenant_id' },
  { name: 'user_invitations', tenantColumn: 'tenant_id' },
  { name: 'users', tenantColumn: 'tenant_id' },
  { name: 'tenants', tenantColumn: 'id' },
];

async function ensureRuntimeRole() {
  const password = process.env.DB_RUNTIME_PASSWORD;
  if (!password) {
    log.warn('DB_RUNTIME_PASSWORD no esta configurada; se omite la creacion del rol restringido de runtime (RLS no estara activo)');
    return;
  }
  const escapedPassword = password.replace(/'/g, "''");
  const exists = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname='app_runtime'`);
  if (exists.rows.length) {
    await pool.query(`ALTER ROLE app_runtime WITH PASSWORD '${escapedPassword}'`);
  } else {
    await pool.query(`CREATE ROLE app_runtime WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  }
  await pool.query(`GRANT CONNECT ON DATABASE orders_db TO app_runtime`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO app_runtime`);
  for (const { name } of RLS_TABLES) {
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${name} TO app_runtime`);
  }
  await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime`);
  await pool.query(`GRANT EXECUTE ON FUNCTION fn_get_orders_with_customer(TEXT, INT) TO app_runtime`).catch(() => {});
  await pool.query(`GRANT EXECUTE ON FUNCTION fn_cancel_order(INT, TEXT, INT) TO app_runtime`).catch(() => {});
  await pool.query(`GRANT EXECUTE ON FUNCTION fn_adjust_customer_credit(INT, NUMERIC, INT) TO app_runtime`).catch(() => {});
}

async function ensureRls() {
  for (const { name, tenantColumn } of RLS_TABLES) {
    await pool.query(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${name} FORCE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${name}`);
    await pool.query(`
      CREATE POLICY tenant_isolation ON ${name}
      USING (${tenantColumn} = current_setting('app.tenant_id', true)::int)
      WITH CHECK (${tenantColumn} = current_setting('app.tenant_id', true)::int)
    `);
  }
}

// Roles that must NOT receive client_code in any response
const RESTRICTED_ROLES = new Set(['shipper', 'customer', 'vendor']);

function stripClientCode(rows) {
  rows.forEach(r => { delete r.client_code; });
  return rows;
}

// ═══ AUTH ENDPOINTS ═══════════════════════════════════════════════════════════════

registerSecurityModule(app, pool, sendError, resolveTenant);

let clerkClient;
// Lazy, igual que verifyWebhook mas abajo: sin CLERK_SECRET_KEY (entornos sin
// Clerk todavia) esta funcion nunca se llama de verdad porque el webhook
// completo responde 501 antes de llegar aca.
function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  if (!clerkClient) {
    const { createClerkClient } = require('@clerk/backend');
    clerkClient = createClerkClient({ secretKey });
  }
  return clerkClient;
}

// ═══ WEBHOOK DE SINCRONIZACION CON CLERK (groundwork, ver ADR-004) ══════════════════
// Publico (sin JWT ni requireAdminKey): la autenticidad se prueba con la
// firma Svix del payload, no con un secreto compartido en un header. Requiere
// req.rawBody (agregado de forma aditiva en shared/app.js) porque la firma
// se calcula sobre el body EXACTO tal como Clerk lo envio, no sobre una
// reserializacion de req.body ya parseado.
//
// Sin CLERK_WEBHOOK_SIGNING_SECRET configurada, esta ruta responde 501 y no
// toca la base de datos -- no se activa sola.
app.post('/api/webhooks/clerk', async (req, res) => {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    return res.status(501).json({ error: 'CLERK_WEBHOOK_SIGNING_SECRET no esta configurada' });
  }
  let evt;
  try {
    const { verifyWebhook } = require('@clerk/backend/webhooks');
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const request = new Request(url, { method: 'POST', headers, body: req.rawBody });
    evt = await verifyWebhook(request, { signingSecret });
  } catch (err) {
    log.warn('Clerk webhook signature verification failed', { message: err.message });
    return res.status(400).json({ error: 'Firma de webhook invalida' });
  }

  try {
    if (evt.type === 'organization.created' || evt.type === 'organization.updated') {
      const org = evt.data;
      const tenantSlug = org.public_metadata?.tenant_slug || org.slug;
      // Vincula por slug si el tenant ya existia en Logify (caso: la
      // Organization se creo en Clerk apuntando a un tenant preexistente);
      // si no, crea el tenant nuevo con este org como fuente de verdad.
      const existing = (await pool.query(
        'SELECT id, slug FROM tenants WHERE clerk_org_id=$1 OR slug=$2', [org.id, tenantSlug]
      )).rows[0];
      let tenantId, tenantSlugFinal;
      if (existing) {
        await pool.query('UPDATE tenants SET clerk_org_id=$1, name=$2, updated_at=NOW() WHERE id=$3', [org.id, org.name, existing.id]);
        tenantId = existing.id;
        tenantSlugFinal = existing.slug;
      } else {
        const inserted = (await pool.query(
          `INSERT INTO tenants (slug, name, status, plan, clerk_org_id) VALUES ($1,$2,'trial','pro',$3) RETURNING id`,
          [tenantSlug, org.name, org.id]
        )).rows[0];
        tenantId = inserted.id;
        tenantSlugFinal = tenantSlug;
      }
      // El JWT Template "logify-api" lee tenant_id/tenant_slug desde
      // organization.public_metadata -- sin este write-back, cualquier token
      // pedido para esta Organization sale con los placeholders del template
      // sin interpolar y authMiddleware lo rechaza (ver shared/clerk-auth.js).
      // Solo se escribe si falta o no coincide, para no generar un
      // organization.updated en loop innecesario.
      const currentMeta = org.public_metadata || {};
      if (currentMeta.tenant_id !== tenantId || currentMeta.tenant_slug !== tenantSlugFinal) {
        const clerkClient = getClerkClient();
        if (clerkClient) {
          await clerkClient.organizations.updateOrganization(org.id, {
            publicMetadata: { ...currentMeta, tenant_id: tenantId, tenant_slug: tenantSlugFinal },
          });
        } else {
          log.warn('Clerk webhook: no se pudo escribir tenant_id/tenant_slug en publicMetadata (CLERK_SECRET_KEY no configurada)', { orgId: org.id });
        }
      }
    } else if (evt.type === 'organizationMembership.created' || evt.type === 'organizationMembership.updated') {
      const membership = evt.data;
      const tenant = (await pool.query('SELECT id FROM tenants WHERE clerk_org_id=$1', [membership.organization.id])).rows[0];
      if (!tenant) {
        log.warn('Clerk membership webhook: tenant no sincronizado todavia', { orgId: membership.organization.id });
      } else {
        const clerkUserId = membership.public_user_data.user_id;
        const role = membership.public_metadata?.role || 'customer';
        const name = [membership.public_user_data.first_name, membership.public_user_data.last_name].filter(Boolean).join(' ') || membership.public_user_data.identifier;
        const username = membership.public_metadata?.username || membership.public_user_data.identifier;
        const existingUser = (await pool.query('SELECT id, tenant_id FROM users WHERE clerk_user_id=$1', [clerkUserId])).rows[0];
        let membershipApplied = false;
        if (existingUser && existingUser.tenant_id !== tenant.id) {
          // Guard de multi-org (Fase 2 de la migracion a Clerk, ver PR #67):
          // este Clerk User ya es un usuario Logify de OTRO tenant. Sin este
          // guard, el UPDATE de abajo reasignaria tenant_id en la fila
          // existente y moveria en silencio el acceso de un tenant a otro --
          // bug real encontrado en auditoria de produccion. Logify todavia no
          // soporta que una persona pertenezca a mas de un tenant, asi que la
          // membership nueva se ignora (200, sin reintentos de Clerk) en vez
          // de aplicarse mal.
          log.warn('Clerk membership webhook: el usuario ya pertenece a otro tenant, se ignora la membership nueva (multi-org no soportado todavia)', {
            clerkUserId, existingTenantId: existingUser.tenant_id, newTenantId: tenant.id,
          });
        } else if (existingUser) {
          await pool.query('UPDATE users SET name=$1, role=$2, updated_at=NOW() WHERE id=$3', [name, role, existingUser.id]);
          membershipApplied = true;
        } else {
          await pool.query(
            `INSERT INTO users (username, name, role, tenant_id, clerk_user_id) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (tenant_id, username) DO UPDATE SET clerk_user_id=EXCLUDED.clerk_user_id, role=EXCLUDED.role, name=EXCLUDED.name`,
            [username, name, role, tenant.id, clerkUserId]
          );
          membershipApplied = true;
        }
        if (membershipApplied && membership.public_user_data.identifier) {
          await pool.query(
            `UPDATE user_invitations SET status='accepted'
             WHERE tenant_id=$1 AND LOWER(email)=LOWER($2) AND status='pending'`,
            [tenant.id, membership.public_user_data.identifier]
          );
        }
      }
    } else if (evt.type === 'organizationMembership.deleted') {
      const membership = evt.data;
      // Desvincula en vez de borrar: un webhook duplicado/reintentado no
      // debe poder destruir la fila; el desaprovisionamiento real de un
      // usuario sigue siendo una accion manual de administracion.
      await pool.query('UPDATE users SET clerk_user_id=NULL WHERE clerk_user_id=$1', [membership.public_user_data.user_id]);
    }
    res.status(200).json({ received: true, type: evt.type });
  } catch (err) {
    sendError(res, 500, 'Failed to process Clerk webhook', err);
  }
});

// ═══ SIGNUP SELF-SERVICE (Fase 4E) ═══════════════════════════════════════════════
// Publico, sin JWT: crea el tenant y su primer usuario ("owner") en una sola
// transaccion. Rate limit propio, mas estricto que el global de
// shared/security.js, porque este endpoint escribe filas nuevas sin
// autenticacion previa.
const signupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SIGNUP_RATE_LIMIT_MAX || '5', 10),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Demasiados intentos de registro, intenta de nuevo mas tarde' },
});

function requireSignupEnabled(_req, res, next) {
  if (process.env.SIGNUP_ENABLED === 'false') {
    return res.status(503).json({
      error: 'El registro automático está temporalmente deshabilitado. Contacta a soporte para activar tu cuenta.',
      code: 'SIGNUP_DISABLED',
    });
  }
  next();
}

function buildClerkSafeOwnerUsername(value, tenantId) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  const suffix = `t${tenantId}`;
  const stem = normalized.length >= 3 ? normalized : 'usuario';
  return `${stem.slice(0, 64 - suffix.length)}${suffix}`;
}

app.get('/api/signup/check-slug', requireSignupEnabled, async (req, res) => {
  try {
    const slug = (req.query.slug || '').toString().trim().toLowerCase();
    const formatError = validateSlugFormat(slug);
    if (formatError) return res.json({ available: false, reason: formatError });
    const exists = await pool.query('SELECT 1 FROM tenants WHERE slug=$1', [slug]);
    if (exists.rows.length) return res.json({ available: false, reason: 'Ese identificador ya esta en uso' });
    res.json({ available: true });
  } catch (err) { sendError(res, 500, 'Failed to check slug', err); }
});

app.post('/api/signup', requireSignupEnabled, signupRateLimit, async (req, res) => {
  const { companyName, slug: rawSlug, contactEmail, ownerName, ownerUsername, ownerPassword, couponCode,
    phone, businessIndustry, usedPosBefore, goals } = req.body;
  const slug = (rawSlug || '').trim().toLowerCase();

  if (!companyName || !companyName.trim()) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
  const slugError = validateSlugFormat(slug);
  if (slugError) return res.status(400).json({ error: slugError });
  if (!contactEmail || !contactEmail.trim()) return res.status(400).json({ error: 'El email de contacto es obligatorio' });
  if (!ownerName || !ownerName.trim()) return res.status(400).json({ error: 'Tu nombre es obligatorio' });
  if (!ownerUsername || !ownerUsername.trim()) return res.status(400).json({ error: 'El usuario es obligatorio' });
  const passwordErrors = validatePasswordStrength(ownerPassword);
  if (passwordErrors.length) return res.status(400).json({ error: passwordErrors.join('. ') });

  const centralClerk = getClerkClient();
  if (!centralClerk) {
    return res.status(503).json({
      error: 'El registro automático no está disponible temporalmente. Intenta nuevamente más tarde.',
      code: 'SIGNUP_AUTH_UNAVAILABLE',
    });
  }

  bcrypt = require('bcryptjs');
  const client = await pool.connect();
  let createdClerkOrganization = null;
  let createdClerkUser = null;
  let signupStage = 'database';
  try {
    await client.query('BEGIN');

    const slugTaken = await client.query('SELECT 1 FROM tenants WHERE slug=$1', [slug]);
    if (slugTaken.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese identificador ya esta en uso', code: 'TENANT_SLUG_TAKEN' });
    }

    let extraDays = 0;
    let coupon = null;
    if (couponCode && couponCode.trim()) {
      const couponResult = await client.query(
        `SELECT * FROM coupons WHERE code=$1 AND active=true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)`,
        [couponCode.trim().toUpperCase()]
      );
      if (!couponResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cupón inválido, expirado o agotado' });
      }
      coupon = couponResult.rows[0];
      extraDays = coupon.extra_trial_days;
    }

    const trialEndsAt = new Date(Date.now() + (TRIAL_DAYS + extraDays) * 24 * 60 * 60 * 1000);

    const tenant = (await client.query(
      `INSERT INTO tenants (slug, name, status, plan, subscription_status, contact_email, trial_ends_at,
        business_phone, business_industry, used_pos_before, onboarding_goals, onboarding_completed_at)
       VALUES ($1,$2,'trial','pro','trialing',$3,$4,$5,$6,$7,$8,NOW()) RETURNING id, slug, name, trial_ends_at`,
      [slug, companyName.trim(), contactEmail.trim(), trialEndsAt,
       phone || null, businessIndustry || null, usedPosBefore ?? null, JSON.stringify(goals || [])]
    )).rows[0];

    // Clerk restringe los usernames a 4-64 caracteres y puede rechazar
    // puntuación. El id del tenant evita colisiones globales entre empresas.
    const usernameNorm = buildClerkSafeOwnerUsername(ownerUsername, tenant.id);
    const hash = await bcrypt.hash(ownerPassword, 10);
    const owner = (await client.query(
      `INSERT INTO users (username, password_hash, name, role, email, tenant_id)
       VALUES ($1,$2,$3,'owner',$4,$5) RETURNING id, username, name, role`,
      [usernameNorm, hash, ownerName.trim(), contactEmail.trim(), tenant.id]
    )).rows[0];

    // El alta pública deja lista la misma identidad que usa app.logify.cl.
    // El slug se conserva únicamente como identificador interno del tenant;
    // ya no se expone como dominio ni se requiere durante el login.
    const clerkSlugSuffix = `-${tenant.id}`;
    const clerkOrganizationSlug = `${tenant.slug.slice(0, 64 - clerkSlugSuffix.length)}${clerkSlugSuffix}`;
    signupStage = 'organization';
    createdClerkOrganization = await centralClerk.organizations.createOrganization({
      name: companyName.trim(),
      slug: clerkOrganizationSlug,
      publicMetadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
    });
    const nameParts = ownerName.trim().split(/\s+/);
    // El correo es la credencial universal del acceso central. No enviamos
    // `username` a Clerk porque ese identificador es opcional por instancia;
    // el username interno sigue viajando en metadata para permisos y UI.
    signupStage = 'identity';
    createdClerkUser = await centralClerk.users.createUser({
      emailAddress: [contactEmail.trim().toLowerCase()],
      password: ownerPassword,
      firstName: nameParts.shift(),
      lastName: nameParts.join(' ') || undefined,
    });
    signupStage = 'membership';
    await centralClerk.organizations.createOrganizationMembership({
      organizationId: createdClerkOrganization.id,
      userId: createdClerkUser.id,
      role: 'org:admin',
    });
    signupStage = 'membership_metadata';
    await centralClerk.organizations.updateOrganizationMembershipMetadata({
      organizationId: createdClerkOrganization.id,
      userId: createdClerkUser.id,
      publicMetadata: { role: 'owner', username: usernameNorm },
    });
    signupStage = 'linking';
    await client.query('UPDATE tenants SET clerk_org_id=$1 WHERE id=$2', [createdClerkOrganization.id, tenant.id]);
    await client.query('UPDATE users SET clerk_user_id=$1 WHERE id=$2', [createdClerkUser.id, owner.id]);

    if (coupon) {
      await client.query('UPDATE coupons SET redemptions_count = redemptions_count + 1 WHERE id=$1', [coupon.id]);
      await client.query('INSERT INTO coupon_redemptions (tenant_id, coupon_id) VALUES ($1,$2)', [tenant.id, coupon.id]);
    }

    await client.query('COMMIT');

    const appUrl = 'https://app.logify.cl';
    const welcomeEmail = buildWelcomeEmail({
      ownerName: ownerName.trim(),
      companyName: companyName.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      ownerUsername: owner.username,
      trialEndsAt: tenant.trial_ends_at,
      supportWhatsappUrl: SUPPORT_WHATSAPP_URL
    });
    sendEmail({ to: contactEmail.trim(), subject: welcomeEmail.subject, html: welcomeEmail.html }).catch(() => {});

    res.status(201).json({ appUrl, trialEndsAt: tenant.trial_ends_at, ownerUsername: owner.username });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Compensación exacta: si Clerk alcanzó a crear recursos pero Postgres no
    // pudo confirmar el alta, no dejamos identidades u organizaciones huérfanas.
    if (createdClerkUser) {
      await centralClerk.users.deleteUser(createdClerkUser.id).catch((cleanupErr) => {
        log.error('Signup cleanup: no se pudo eliminar el usuario Clerk', { userId: createdClerkUser.id, message: cleanupErr.message });
      });
    }
    if (createdClerkOrganization) {
      await centralClerk.organizations.deleteOrganization(createdClerkOrganization.id).catch((cleanupErr) => {
        log.error('Signup cleanup: no se pudo eliminar la organización Clerk', { organizationId: createdClerkOrganization.id, message: cleanupErr.message });
      });
    }
    const clerkCodes = Array.isArray(err.errors) ? err.errors.map((item) => item.code) : [];
    if (err.status === 422 && clerkCodes.some((code) => ['form_identifier_exists', 'duplicate_record'].includes(code))) {
      return res.status(409).json({ error: 'Ese correo o usuario ya tiene una cuenta. Inicia sesión o usa otros datos.', code: 'ACCOUNT_EXISTS' });
    }
    if (err.status === 422) {
      return res.status(400).json({
        error: 'No pudimos crear la identidad con esos datos. Revisa el correo y la contraseña.',
        code: 'SIGNUP_IDENTITY_INVALID',
      });
    }
    const stageMessages = {
      database: 'No pudimos preparar la cuenta en este momento.',
      organization: 'No pudimos crear la empresa en el sistema de acceso.',
      identity: 'No pudimos crear la identidad de acceso.',
      membership: 'No pudimos vincular la cuenta con la empresa.',
      membership_metadata: 'No pudimos completar los permisos de la cuenta.',
      linking: 'No pudimos guardar la vinculación final de la cuenta.',
    };
    log.warn('Signup failed', {
      stage: signupStage,
      error: err?.message || String(err),
      upstreamStatus: err?.status,
    });
    return res.status(500).json({
      error: `${stageMessages[signupStage]} Intenta nuevamente o contacta a soporte.`,
      code: `SIGNUP_${signupStage.toUpperCase()}_FAILED`,
    });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    bcrypt = require('bcryptjs');
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    const tenant = await resolveTenant(req.tenantSlug);
    if (!tenant) return res.status(401).json({ error: 'Credenciales invalidas' });
    // Fase 4E: un tenant recien creado por signup queda en status='trial', no
    // 'active' — debe poder loguear mientras el trial este vigente. Solo se
    // bloquea si esta suspendido/cancelado, o si el trial ya vencio.
    if (!['active', 'trial'].includes(tenant.status)) {
      return res.status(403).json({ error: 'La cuenta de tu empresa no está activa' });
    }
    if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
      return res.status(403).json({ error: 'Tu periodo de prueba terminó. Contáctanos para activar tu plan.' });
    }
    const r = await pool.query('SELECT * FROM users WHERE username=$1 AND tenant_id=$2', [username.trim().toLowerCase(), tenant.id]);
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciales invalidas' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales invalidas' });
    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    const token = signToken({ ...user, tenant_slug: tenant.slug });
    res.json({ token, role: user.role, name: user.name, username: user.username, rut: user.rut || null, email: user.email || null });
  } catch (err) { sendError(res, 500, 'Login failed', err); }
});

app.post('/api/auth/register', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
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
    const exists = await req.db.query('SELECT 1 FROM users WHERE username=$1 AND tenant_id=$2', [username.trim().toLowerCase(), req.tenantId]);
    if (exists.rows.length) return res.status(409).json({ error: 'El usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const secretAnswerHash = secretAnswer ? await bcrypt.hash(secretAnswer.trim().toLowerCase(), 10) : null;
    const user = (await req.db.query(
      `INSERT INTO users (username, password_hash, name, role, rut, email, secret_question, secret_answer_hash, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, username, name, role, rut, email, secret_question, created_at`,
      [username.trim().toLowerCase(), hash, name.trim(), role.toLowerCase(), rut || null, email || null, secretQuestion || null, secretAnswerHash, req.tenantId])).rows[0];
    res.status(201).json(user);
  } catch (err) { sendError(res, 500, 'Register failed', err); }
});

app.get('/api/auth/users', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const rows = (await req.db.query('SELECT id, username, name, role, rut, email, secret_question, created_at, updated_at, last_login_at FROM users WHERE tenant_id=$1 ORDER BY username', [req.tenantId])).rows;
    res.json(rows);
  } catch (err) { sendError(res, 500, 'Failed to list users', err); }
});

app.put('/api/auth/users/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    bcrypt = require('bcryptjs');
    const { name, role, password } = req.body;
    if (role && !VALID_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({ error: 'Rol invalido. Validos: ' + VALID_ROLES.join(', ') });
    }
    const existing = (await req.db.query('SELECT * FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });
    const newName = name || existing.name;
    const newRole = role ? role.toLowerCase() : existing.role;
    // LIMITACION CONOCIDA: los JWT son stateless (shared/auth.js no consulta la
    // DB en cada request) y llevan el rol embebido, asi que si el usuario tiene
    // una sesion activa sigue operando con el rol viejo hasta que su token
    // expire (JWT_EXPIRES_IN, 8h por defecto) o vuelva a iniciar sesion. Arreglar
    // esto de raiz requiere versionar el token (columna token_version en users +
    // chequeo en authMiddleware de los 4 servicios) - cambio mayor, fuera de
    // alcance de este fix puntual.
    // Mismo resguardo que en DELETE /api/auth/users/:id: si el unico owner
    // del tenant se degrada a si mismo (u otro lo degrada) queda la cuenta
    // sin administrador y sin panel de super-admin para recuperarla.
    if (existing.role === 'owner' && newRole !== 'owner') {
      const ownerCount = (await req.db.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE tenant_id=$1 AND role='owner'", [req.tenantId]
      )).rows[0].count;
      if (ownerCount <= 1) {
        return res.status(400).json({ error: 'No puedes quitar el rol de administrador al único owner de la cuenta.' });
      }
    }
    const hash = password ? await bcrypt.hash(password, 10) : existing.password_hash;
    const updated = (await req.db.query(
      'UPDATE users SET name=$1, role=$2, password_hash=$3, updated_at=NOW() WHERE id=$4 AND tenant_id=$5 RETURNING id, username, name, role, created_at, updated_at',
      [newName, newRole, hash, req.params.id, req.tenantId])).rows[0];
    res.json(updated);
  } catch (err) { sendError(res, 500, 'Failed to update user', err); }
});

app.delete('/api/auth/users/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const target = (await req.db.query('SELECT id, username, role FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId])).rows[0];
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    // req.user.sub es el username del token (ver shared/auth.js signToken) -- el
    // JWT no lleva el id numerico, por eso se compara por username. Sin este
    // check un admin puede autoeliminarse y quedar sin forma de volver a
    // entrar (no hay panel de super-admin todavia, ver Fase 4E pendiente).
    if (target.username === req.user.sub) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }
    if (target.role === 'owner') {
      const ownerCount = (await req.db.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE tenant_id=$1 AND role='owner'", [req.tenantId]
      )).rows[0].count;
      if (ownerCount <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar al único administrador de la cuenta.' });
      }
    }
    const r = await req.db.query('DELETE FROM users WHERE id=$1 AND tenant_id=$2 RETURNING id, username', [req.params.id, req.tenantId]);
    res.json({ message: 'Usuario eliminado', user: r.rows[0] });
  } catch (err) { sendError(res, 500, 'Failed to delete user', err); }
});

// ═══ ORDER ENDPOINTS ═══════════════════════════════════════════════════════════════

app.get('/api/orders/test', (_req, res) => res.send('orders-service UP'));

// Public tracking — only safe fields, no contact data. req.tenantSlug cae al
// tenant por defecto si no viene header (ver resolveTenant).
app.get('/api/orders/track/:clientCode', async (req, res) => {
  try {
    const tenant = await resolveTenant(req.tenantSlug);
    if (!tenant) return res.status(404).json({ error: 'Código de cliente no encontrado' });
    const r = await pool.query(
      `SELECT o.id, o.sku, o.quantity, o.status, o.created_at, o.client_code, o.cancel_reason,
              c.name as customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.client_code = $1 AND o.tenant_id = $2`,
      [req.params.clientCode.toUpperCase(), tenant.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Código de cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to track order', err); }
});

app.get('/api/orders/report', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const status = req.query.status ? req.query.status.toUpperCase() : null;
    const r = await req.db.query('SELECT * FROM fn_get_orders_with_customer($1, $2)', [status, req.tenantId]);
    res.json(r.rows);
  } catch (err) { sendError(res, 500, 'Failed to get orders report', err); }
});

app.post('/api/orders', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
  try {
    const errors = validateOrderBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    const { customerId, sku, quantity } = req.body;
    const clientCode = 'SL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const order = (await req.db.query(
      "INSERT INTO orders (customer_id, sku, quantity, status, created_at, client_code, tenant_id) VALUES ($1,$2,$3,'CREATED',NOW(),$4,$5) RETURNING *",
      [customerId, sku, quantity, clientCode, req.tenantId])).rows[0];

    const customer = (await req.db.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [customerId, req.tenantId])).rows[0];
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

app.get('/api/orders', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const role = extractRoleFromRequest(req);
    const limit = req.query.limit ? Math.min(500, Math.max(1, parseInt(req.query.limit))) : null;
    const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
    let query = `SELECT o.*, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.tenant_id = $1
       ORDER BY o.created_at DESC`;
    const params = [req.tenantId];
    if (limit && page) {
      const offset = (page - 1) * limit;
      query += ' LIMIT $2 OFFSET $3';
      params.push(limit, offset);
    }
    const rows = (await req.db.query(query, params)).rows;
    if (RESTRICTED_ROLES.has(role)) stripClientCode(rows);
    res.json(rows);
  }
  catch (err) { sendError(res, 500, 'Failed to list orders', err); }
});

app.get('/api/orders/:id', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const role = extractRoleFromRequest(req);
    const r = await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const row = r.rows[0];
    if (RESTRICTED_ROLES.has(role)) delete row.client_code;
    res.json(row);
  } catch (err) { sendError(res, 500, 'Failed to get order', err); }
});

app.put('/api/orders/:id/status', authMiddleware, requireTenant, withTenantDb, requireRole('owner'), async (req, res) => {
  try {
    const statusErr = validateOrderStatus(req.query.status?.toUpperCase() || '');
    if (statusErr.length) return res.status(400).json({ error: statusErr.join(', ') });
    const result = await req.db.query('UPDATE orders SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [req.query.status.toUpperCase(), req.params.id, req.tenantId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update status', err); }
});

// Saga de confirmacion (ver aidlc-docs/design-artifacts/ADR/ADR-001): sin
// orquestador ni transacciones distribuidas reales, asi que la consistencia
// se logra a mano. inventory solo se descuenta si el paso anterior no fallo,
// y si shipping falla DESPUES de que el stock ya se desconto, se compensa
// revirtiendo ese descuento (en vez de dejar stock reservado sin envio real).
// Si la compensacion en si falla, la orden queda en CREATED igual (para
// permitir reintentar) pero el warning marca que requiere revision manual,
// porque en ese caso el stock puede haber quedado descontado sin envio.
app.put('/api/orders/:id/confirm', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [orderId, req.tenantId])).rows[0];
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const errors = [];

    let inventoryAdjusted = false;
    try {
      await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=-${order.quantity}`, { method: 'POST' });
      inventoryAdjusted = true;
    } catch (e) {
      log.error('Inventory adjustment failed', { orderId, message: e.message });
      errors.push(`Inventario: ${e.message}`);
    }

    let shipmentCreated = false;
    if (inventoryAdjusted) {
      try {
        await req.forwardedFetch(`${SHIPPING_URL}/api/shipments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: parseInt(orderId), customerId: order.customer_id, sku: order.sku, quantity: order.quantity }) });
        shipmentCreated = true;
      } catch (e) {
        log.error('Shipment creation failed', { orderId, message: e.message });
        errors.push(`Envío: ${e.message}`);
        try {
          await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=+${order.quantity}`, { method: 'POST' });
          log.warn('Stock compensado tras fallo de envío', { orderId });
        } catch (compErr) {
          log.error('Compensación de stock falló — requiere revisión manual', { orderId, message: compErr.message });
          errors.push(`Compensación de stock falló, requiere revisión manual: ${compErr.message}`);
        }
      }
    }

    const sagaOk = inventoryAdjusted && shipmentCreated;
    let updated = order;
    if (sagaOk) {
      await req.db.query("UPDATE orders SET status='EN_PREPARACION' WHERE id=$1 AND tenant_id=$2", [orderId, req.tenantId]);
      updated = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [orderId, req.tenantId])).rows[0];
    }
    log.info('Order confirm attempted', { orderId, sagaOk });
    res.json({ ...updated, warnings: errors.length ? errors : undefined });
  } catch (err) { sendError(res, 500, 'Failed to confirm order', err); }
});

app.put('/api/orders/:id/cancel', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
  try {
    const order = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId])).rows[0];
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

    const cancelled = (await req.db.query('SELECT * FROM fn_cancel_order($1,$2,$3)', [req.params.id, reason, req.tenantId])).rows[0];
    res.json(cancelled);
  } catch (err) { sendError(res, 500, 'Failed to cancel order', err); }
});

app.put('/api/orders/:id/assign', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
  try {
    const transporter = (req.query.transporter || '').substring(0, 100);
    if (!transporter) return res.status(400).json({ error: 'transporter es requerido' });
    const result = await req.db.query('UPDATE orders SET assigned_to=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [transporter, req.params.id, req.tenantId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to assign', err); }
});

app.delete('/api/orders/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner'), async (req, res) => {
  try {
    const result = await req.db.query('DELETE FROM orders WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
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

app.get('/api/customers/address-suggest', authMiddleware, requireTenant, async (req, res) => {
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

app.get('/api/orders/:id/pdf', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const r = await req.db.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
              c.address AS customer_address, c.phone AS customer_phone, c.rut AS customer_rut
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id=$1 AND o.tenant_id=$2`,
      [req.params.id, req.tenantId]
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

app.get('/api/customers', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try { res.json((await req.db.query('SELECT * FROM customers WHERE tenant_id=$1 ORDER BY name', [req.tenantId])).rows); }
  catch (err) { sendError(res, 500, 'Failed to list customers', err); }
});

app.get('/api/customers/:id', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const r = await req.db.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to get customer', err); }
});

app.post('/api/customers', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
  try {
    const { name, phone, address, email, rut, province, customerType, creditLimit } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const type = customerType === 'individual' ? 'individual' : 'company';
    const c = (await req.db.query(
      `INSERT INTO customers (name, phone, address, email, rut, province, customer_type, credit_limit, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name.trim(), phone || null, address || null, email || null, rut || null, province || null,
       type, creditLimit != null && creditLimit !== '' ? Number(creditLimit) : null, req.tenantId])).rows[0];
    res.status(201).json(c);
  } catch (err) { sendError(res, 500, 'Failed to create customer', err); }
});

app.put('/api/customers/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
  try {
    const { name, phone, address, email, rut, province, customerType, creditLimit } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const type = customerType === 'individual' ? 'individual' : 'company';
    const r = await req.db.query(
      `UPDATE customers SET name=$1, phone=$2, address=$3, email=$4, rut=$5, province=$6,
        customer_type=$7, credit_limit=$8 WHERE id=$9 AND tenant_id=$10 RETURNING *`,
      [name.trim(), phone || null, address || null, email || null, rut || null, province || null,
       type, creditLimit != null && creditLimit !== '' ? Number(creditLimit) : null, req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update customer', err); }
});

app.delete('/api/customers/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
  try {
    const r = await req.db.query('DELETE FROM customers WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (err) { sendError(res, 500, 'Failed to delete customer', err); }
});

// ═══ CUENTA CORRIENTE / FIADO ══════════════════════════════════════════════════

app.get('/api/customers/:id/credit', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
  try {
    const customer = (await req.db.query(
      'SELECT id, credit_limit, credit_balance FROM customers WHERE id=$1 AND tenant_id=$2',
      [req.params.id, req.tenantId])).rows[0];
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
    const movements = (await req.db.query(
      'SELECT * FROM customer_credit_movements WHERE customer_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 100',
      [req.params.id, req.tenantId])).rows;
    res.json({ creditLimit: customer.credit_limit, creditBalance: customer.credit_balance, movements });
  } catch (err) { sendError(res, 500, 'Failed to get customer credit', err); }
});

async function applyCreditMovement(req, res, { type, sign }) {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount debe ser un número mayor a 0' });
    const delta = sign * amount;
    const result = (await req.db.query(
      'SELECT * FROM fn_adjust_customer_credit($1,$2,$3)', [req.params.id, delta, req.tenantId])).rows[0];
    if (!result.success) {
      const status = result.error_msg === 'Cliente no encontrado' ? 404 : 400;
      return res.status(status).json({ error: result.error_msg });
    }
    const movement = (await req.db.query(
      `INSERT INTO customer_credit_movements
        (customer_id, tenant_id, type, amount, balance_after, reference_type, reference_id, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, req.tenantId, type, amount, result.new_balance,
       req.body.referenceType || null, req.body.referenceId || null, req.body.note || null, req.user?.sub || null]
    )).rows[0];
    res.status(201).json({ creditBalance: result.new_balance, movement });
  } catch (err) { sendError(res, 500, 'Failed to record credit movement', err); }
}

app.post('/api/customers/:id/credit/charge', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin', 'vendor'), async (req, res) => {
  await applyCreditMovement(req, res, { type: 'charge', sign: 1 });
});

app.post('/api/customers/:id/credit/payment', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin', 'vendor'), async (req, res) => {
  await applyCreditMovement(req, res, { type: 'payment', sign: -1 });
});

// ═══ CONFIGURACIÓN DEL NEGOCIO Y DEL SISTEMA ══════════════════════════════════

function toBusinessSettingsDto(tenant) {
  return {
    name: tenant.name,
    contactEmail: tenant.contact_email,
    businessRut: tenant.business_rut,
    businessCountry: tenant.business_country,
    businessIndustry: tenant.business_industry,
    businessPhone: tenant.business_phone,
  };
}

function toOnboardingDto(tenant) {
  return {
    completed: Boolean(tenant.onboarding_completed_at),
    name: tenant.name,
    contactEmail: tenant.contact_email,
    businessCountry: tenant.business_country,
    businessIndustry: tenant.business_industry,
    businessPhone: tenant.business_phone,
    usedPosBefore: tenant.used_pos_before,
    goals: Array.isArray(tenant.onboarding_goals) ? tenant.onboarding_goals : [],
  };
}

app.get('/api/onboarding', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const r = await req.db.query('SELECT * FROM tenants WHERE id=$1', [req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(toOnboardingDto(r.rows[0]));
  } catch (err) { sendError(res, 500, 'Failed to get onboarding status', err); }
});

app.put('/api/onboarding', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, contactEmail, businessCountry, businessIndustry, businessPhone, usedPosBefore, goals } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
    if (!businessIndustry || !businessIndustry.trim()) return res.status(400).json({ error: 'Selecciona el rubro del negocio' });
    if (typeof usedPosBefore !== 'boolean') return res.status(400).json({ error: 'Indica si ya utilizabas un sistema de ventas' });
    if (!Array.isArray(goals) || goals.length === 0 || goals.some((goal) => typeof goal !== 'string')) {
      return res.status(400).json({ error: 'Selecciona al menos un objetivo' });
    }
    const sanitizedGoals = [...new Set(goals.map((goal) => goal.trim()).filter(Boolean))].slice(0, 6);
    if (!sanitizedGoals.length) return res.status(400).json({ error: 'Selecciona al menos un objetivo' });
    const r = await req.db.query(
      `UPDATE tenants SET name=$1, contact_email=$2, business_country=$3, business_industry=$4,
        business_phone=$5, used_pos_before=$6, onboarding_goals=$7, onboarding_completed_at=NOW(),
        updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name.trim(), contactEmail || null, businessCountry || null, businessIndustry.trim(),
       businessPhone || null, usedPosBefore, JSON.stringify(sanitizedGoals), req.tenantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(toOnboardingDto(r.rows[0]));
  } catch (err) { sendError(res, 500, 'Failed to complete onboarding', err); }
});

app.get('/api/settings/business', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const r = await req.db.query('SELECT * FROM tenants WHERE id=$1', [req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(toBusinessSettingsDto(r.rows[0]));
  } catch (err) { sendError(res, 500, 'Failed to get business settings', err); }
});

app.put('/api/settings/business', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, contactEmail, businessRut, businessCountry, businessIndustry, businessPhone } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
    const r = await req.db.query(
      `UPDATE tenants SET name=$1, contact_email=$2, business_rut=$3, business_country=$4,
        business_industry=$5, business_phone=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name.trim(), contactEmail || null, businessRut || null, businessCountry || null,
       businessIndustry || null, businessPhone || null, req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(toBusinessSettingsDto(r.rows[0]));
  } catch (err) { sendError(res, 500, 'Failed to update business settings', err); }
});

app.get('/api/settings/system', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const r = await req.db.query('SELECT settings FROM tenants WHERE id=$1', [req.tenantId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(r.rows[0].settings || {});
  } catch (err) { sendError(res, 500, 'Failed to get system settings', err); }
});

app.put('/api/settings/system', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const current = await req.db.query('SELECT settings FROM tenants WHERE id=$1', [req.tenantId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
    const merged = { ...(current.rows[0].settings || {}), ...req.body };
    const r = await req.db.query('UPDATE tenants SET settings=$1, updated_at=NOW() WHERE id=$2 RETURNING settings', [JSON.stringify(merged), req.tenantId]);
    res.json(r.rows[0].settings || {});
  } catch (err) { sendError(res, 500, 'Failed to update system settings', err); }
});

// ═══ INVITACIONES DE USUARIO ══════════════════════════════════════════════════

const VALID_ROLES = ['owner', 'ops', 'warehouse', 'shipper', 'vendor', 'support', 'customer'];
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function getTenantAppUrl(slug) {
  return slug && !RESERVED_TENANT_SLUGS.has(slug) ? `https://${slug}.logify.cl` : INVITE_APP_URL;
}

app.post('/api/auth/invite', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'El email es obligatorio' });
    if (!role || !VALID_ROLES.includes(role.toLowerCase())) {
      return res.status(400).json({ error: 'Rol inválido. Válidos: ' + VALID_ROLES.join(', ') });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRole = role.toLowerCase();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    let clerkInvitationId = null;
    let deliveredByClerk = false;
    const clerk = getClerkClient();
    const tenant = (await req.db.query(
      'SELECT slug, clerk_org_id FROM tenants WHERE id=$1',
      [req.tenantId]
    )).rows[0];
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (clerk && tenant.clerk_org_id) {
      const clerkInvitation = await clerk.organizations.createOrganizationInvitation({
        organizationId: tenant.clerk_org_id,
        emailAddress: normalizedEmail,
        role: 'org:member',
        expiresInDays: 7,
        publicMetadata: { role: normalizedRole, username: normalizedEmail },
        redirectUrl: `${INVITE_APP_URL}/accept-invitation`,
      });
      clerkInvitationId = clerkInvitation.id;
      deliveredByClerk = true;
    }

    const invitation = (await req.db.query(
      `INSERT INTO user_invitations (tenant_id, email, role, token, invited_by, expires_at, clerk_invitation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, role, status, expires_at`,
      [req.tenantId, normalizedEmail, normalizedRole, token, req.user?.sub || req.user?.name || null, expiresAt, clerkInvitationId])).rows[0];

    if (!deliveredByClerk) {
      const acceptUrl = `${getTenantAppUrl(tenant.slug)}/invite/${token}`;
      sendEmail({
        to: invitation.email,
        subject: 'Te invitaron a unirte a Logify',
        html: `<p>Te invitaron a unirte con el rol <b>${invitation.role}</b>. Acepta la invitación aquí: <a href="${acceptUrl}">${acceptUrl}</a></p>`
      }).catch(() => {});
    }

    res.status(201).json({ ...invitation, delivery: deliveredByClerk ? 'clerk' : 'legacy' });
  } catch (err) { sendError(res, 500, 'No se pudo crear la invitación', err); }
});

app.post('/api/auth/invite/:token/accept', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'El usuario, la contraseña y el nombre son obligatorios' });
    }
    const invitation = (await pool.query(
      `SELECT i.*, t.slug AS tenant_slug FROM user_invitations i
       JOIN tenants t ON t.id=i.tenant_id
       WHERE i.token=$1 AND i.status='pending' AND i.expires_at > NOW()`,
      [req.params.token])).rows[0];
    if (!invitation) return res.status(404).json({ error: 'Invitación inválida o expirada' });

    const exists = await pool.query('SELECT 1 FROM users WHERE username=$1 AND tenant_id=$2', [username.trim().toLowerCase(), invitation.tenant_id]);
    if (exists.rows.length) return res.status(409).json({ error: 'El usuario ya existe' });

    bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const user = (await pool.query(
      `INSERT INTO users (username, password_hash, name, role, email, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, name, role, created_at`,
      [username.trim().toLowerCase(), hash, name.trim(), invitation.role, invitation.email, invitation.tenant_id])).rows[0];

    await pool.query(`UPDATE user_invitations SET status='accepted' WHERE id=$1`, [invitation.id]);
    res.status(201).json({ ...user, tenantSlug: invitation.tenant_slug, loginUrl: `${getTenantAppUrl(invitation.tenant_slug)}/login` });
  } catch (err) { sendError(res, 500, 'No se pudo aceptar la invitación', err); }
});

// ═══ GESTIÓN DE PLATAFORMA ════════════════════════════════════════════════════════
// Superficie exclusiva de gestion.logify.cl. A diferencia de /api/admin, que
// conserva PLATFORM_ADMIN_KEY para automatizaciones server-to-server, estas
// rutas aceptan únicamente sesiones Clerk de usuarios globales allowlisted.
app.get('/api/platform/overview', requirePlatformAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_tenants,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing')::int AS trialing_tenants,
        COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active_tenants,
        COUNT(*) FILTER (WHERE subscription_status IN ('past_due', 'suspended'))::int AS attention_tenants,
        COALESCE(SUM(plan_price_clp) FILTER (WHERE subscription_status = 'active'), 0)::bigint AS active_mrr_clp
      FROM tenants
    `);
    const stats = result.rows[0] || {};
    res.json({
      totalTenants: Number(stats.total_tenants || 0),
      trialingTenants: Number(stats.trialing_tenants || 0),
      activeTenants: Number(stats.active_tenants || 0),
      attentionTenants: Number(stats.attention_tenants || 0),
      activeMrrClp: Number(stats.active_mrr_clp || 0),
    });
  } catch (err) {
    sendError(res, 500, 'Failed to load platform overview', err);
  }
});

app.get('/api/platform/tenants', requirePlatformAdmin, async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim();
    const values = [];
    let where = '';
    if (search) {
      values.push(`%${search}%`);
      where = 'WHERE name ILIKE $1 OR slug ILIKE $1 OR contact_email ILIKE $1';
    }
    const result = await pool.query(`
      SELECT id, slug, name, status, plan, contact_email, subscription_status,
        plan_price_clp, billing_provider, trial_ends_at, created_at
      FROM tenants
      ${where}
      ORDER BY created_at DESC
      LIMIT 200
    `, values);
    res.json(result.rows.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      contactEmail: tenant.contact_email,
      subscriptionStatus: tenant.subscription_status,
      planPriceClp: tenant.plan_price_clp == null ? null : Number(tenant.plan_price_clp),
      billingProvider: tenant.billing_provider,
      trialEndsAt: tenant.trial_ends_at,
      createdAt: tenant.created_at,
    })));
  } catch (err) {
    sendError(res, 500, 'Failed to load platform tenants', err);
  }
});

app.get('/api/platform/billing/providers', requirePlatformAdmin, (_req, res) => {
  const defaultProvider = process.env.BILLING_DEFAULT_PROVIDER || 'none';
  res.json({
    defaultProvider,
    providers: configuredBillingProviders().map((provider) => ({
      ...provider,
      active: provider.id === defaultProvider,
    })),
  });
});

// ═══ ADMIN DE CUPONES (Fase 4E) ═══════════════════════════════════════════════════
// No hay rol de super-admin en el sistema todavia (ver wiki/Multi-Tenant.md,
// Fase 4E pendiente: panel de super-admin). Mientras tanto, estos endpoints
// se protegen con un secreto compartido de plataforma via header (ver
// shared/admin.js), pensados para gestionarse por curl/Postman, no por UI.
app.post('/api/admin/coupons', requireAdminKey, async (req, res) => {
  try {
    const { code, extraTrialDays, maxRedemptions, expiresAt } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'El código es obligatorio' });
    const coupon = (await pool.query(
      `INSERT INTO coupons (code, extra_trial_days, max_redemptions, expires_at)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [code.trim().toUpperCase(), extraTrialDays || 90, maxRedemptions || null, expiresAt || null]
    )).rows[0];
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cupón con ese código' });
    sendError(res, 500, 'Failed to create coupon', err);
  }
});

// Recuperacion de tenants bloqueados (ver postmortem
// 2026-08-07-admin-autoeliminacion.md): si el unico admin de un tenant se
// elimina a si mismo (bug ya corregido, pero esto recupera cuentas ya
// afectadas) no hay panel de super-admin para recrearlo. Este endpoint
// crea o resetea un usuario 'owner' para un tenant via su slug, protegido
// con el mismo PLATFORM_ADMIN_KEY que /api/admin/coupons.
app.post('/api/admin/tenants/:slug/reset-owner', requireAdminKey, async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username?.trim()) return res.status(400).json({ error: 'El usuario es obligatorio' });
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length) return res.status(400).json({ error: passwordErrors.join('. ') });

    const tenant = await resolveTenant(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    bcrypt = require('bcryptjs');
    const usernameNorm = username.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const existing = (await pool.query('SELECT id FROM users WHERE username=$1 AND tenant_id=$2', [usernameNorm, tenant.id])).rows[0];

    let user, created;
    if (existing) {
      user = (await pool.query(
        `UPDATE users SET password_hash=$1, role='owner', name=$2, updated_at=NOW() WHERE id=$3
         RETURNING id, username, name, role`,
        [hash, name.trim(), existing.id]
      )).rows[0];
      created = false;
    } else {
      user = (await pool.query(
        `INSERT INTO users (username, password_hash, name, role, tenant_id)
         VALUES ($1,$2,$3,'owner',$4) RETURNING id, username, name, role`,
        [usernameNorm, hash, name.trim(), tenant.id]
      )).rows[0];
      created = true;
    }
    res.status(created ? 201 : 200).json({ message: created ? 'Owner creado' : 'Owner actualizado', user, tenantSlug: tenant.slug });
  } catch (err) { sendError(res, 500, 'Failed to reset tenant owner', err); }
});

// Eliminacion completa e irreversible de un tenant y todos sus datos. Los 4
// microservicios tienen bases de datos separadas (Postgres no soporta FK
// cross-database, ver Backend/shared/app.js), asi que este endpoint orquesta
// la purga en inventory-service, shipping-service y notification-service via
// HTTP interno antes de borrar los datos propios de orders-service y,
// finalmente, la fila de tenants. No hay soft-delete ni papelera: pensado
// para gestionarse por curl con el mismo PLATFORM_ADMIN_KEY, requiriendo
// re-escribir el slug en el body como confirmacion extra (un typo en la URL
// no alcanza para borrar el tenant equivocado).
app.delete('/api/admin/tenants/:slug', requireAdminKey, async (req, res) => {
  const slug = (req.params.slug || '').trim().toLowerCase();
  try {
    if (slug === DEFAULT_TENANT_SLUG) {
      return res.status(400).json({ error: 'No se puede eliminar el tenant demo de la plataforma' });
    }
    if (req.body?.confirmSlug !== slug) {
      return res.status(400).json({ error: 'Falta confirmar: confirmSlug en el body debe ser igual al slug de la URL' });
    }
    const tenant = await resolveTenant(slug);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const adminKey = process.env.PLATFORM_ADMIN_KEY;
    const remoteServices = [
      { name: 'inventory-service', url: `${INVENTORY_URL}/api/admin/tenants/${tenant.id}/purge` },
      { name: 'shipping-service', url: `${SHIPPING_URL}/api/admin/tenants/${tenant.id}/purge` },
      { name: 'notification-service', url: `${NOTIFICATION_URL}/api/admin/tenants/${tenant.id}/purge` },
    ];
    const purged = {};
    for (const { name, url } of remoteServices) {
      let response;
      try {
        response = await fetch(url, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
      } catch (err) {
        return res.status(502).json({ error: `No se pudo contactar a ${name}: ${err.message}`, purgedSoFar: purged });
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return res.status(502).json({ error: `Fallo al purgar ${name}: HTTP ${response.status} ${body}`, purgedSoFar: purged });
      }
      purged[name] = await response.json().catch(() => ({}));
    }

    // Todos los servicios remotos purgaron OK -- recien ahora se tocan los
    // datos locales (orden inverso al del reintento: si esto fallara, el
    // DELETE completo es reintentable porque los DELETE WHERE tenant_id=$1
    // de arriba son idempotentes).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const localCounts = {};
      for (const table of ['customer_credit_movements', 'orders', 'customers', 'user_invitations', 'users', 'coupon_redemptions']) {
        const r = await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant.id]);
        localCounts[table] = r.rowCount;
      }
      await client.query('DELETE FROM tenants WHERE id=$1', [tenant.id]);
      await client.query('COMMIT');
      res.json({ message: 'Tenant eliminado completamente', tenantSlug: slug, purged: { ...purged, 'orders-service': localCounts } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { sendError(res, 500, 'Failed to delete tenant', err); }
});

app.get('/api/admin/coupons', requireAdminKey, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM coupons ORDER BY created_at DESC')).rows;
    res.json(rows);
  } catch (err) { sendError(res, 500, 'Failed to list coupons', err); }
});

if (require.main === module) {
  (async () => {
    await ensureTables();
    await ensureTenantConstraints();
    await seedUsers();
    await ensureSecurityProfiles();
    await ensureProcedures();
    await ensureRuntimeRole();
    await ensureRls();
    start();
  })();
}

module.exports = { app, ensureTables, ensureTenants, ensureTenantConstraints, seedUsers, ensureSecurityProfiles, ensureRuntimeRole, ensureRls };
