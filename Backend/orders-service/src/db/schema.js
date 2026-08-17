const log = require('../../shared/logger');

// DDL de orders-service: creación/evolución idempotente del esquema, seed de
// usuarios demo y sus perfiles de seguridad.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL/lógica).
module.exports = function createSchemaManager(pool) {
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
    await pool.query(`CREATE TABLE IF NOT EXISTS user_invitations (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, email VARCHAR(200) NOT NULL,
      role VARCHAR(50) NOT NULL, token VARCHAR(64) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending',
      invited_by VARCHAR(100), expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
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
    const bcrypt = require('bcryptjs');
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
    const bcrypt = require('bcryptjs');
    const answerHash = await bcrypt.hash(DEMO_SECRET_ANSWER, 10);
    for (const [username, profile] of Object.entries(SECURITY_PROFILES)) {
      await pool.query(
        `UPDATE users SET rut=$1, email=$2, secret_question=$3, secret_answer_hash=$4
         WHERE username=$5 AND rut IS NULL`,
        [profile.rut, profile.email, DEMO_SECRET_QUESTION, answerHash, username]
      );
    }
  }

  return { ensureTables, ensureTenants, ensureTenantConstraints, seedUsers, ensureSecurityProfiles };
};
