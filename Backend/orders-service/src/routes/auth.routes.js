const express = require('express');
const crypto = require('crypto');
const { signToken, authMiddleware, requireRole, requireTenant } = require('../../shared/auth');
const { sendEmail } = require('../../shared/email');

const VALID_ROLES = ['owner', 'ops', 'warehouse', 'shipper', 'vendor', 'support', 'customer'];
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/auth', authRoutes({ pool, sendError, withTenantDb, resolveTenant })).
module.exports = function authRoutes({ pool, sendError, withTenantDb, resolveTenant }) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
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

  router.post('/register', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
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

  router.get('/users', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const rows = (await req.db.query('SELECT id, username, name, role, rut, email, secret_question, created_at, updated_at, last_login_at FROM users WHERE tenant_id=$1 ORDER BY username', [req.tenantId])).rows;
      res.json(rows);
    } catch (err) { sendError(res, 500, 'Failed to list users', err); }
  });

  router.put('/users/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
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

  router.delete('/users/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
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

  // ═══ INVITACIONES DE USUARIO ══════════════════════════════════════════════════

  router.post('/invite', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const { email, role } = req.body;
      if (!email || !email.trim()) return res.status(400).json({ error: 'El email es obligatorio' });
      if (!role || !VALID_ROLES.includes(role.toLowerCase())) {
        return res.status(400).json({ error: 'Rol invalido. Validos: ' + VALID_ROLES.join(', ') });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
      const invitation = (await req.db.query(
        `INSERT INTO user_invitations (tenant_id, email, role, token, invited_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, role, status, expires_at`,
        [req.tenantId, email.trim().toLowerCase(), role.toLowerCase(), token, req.user?.sub || req.user?.name || null, expiresAt])).rows[0];

      const acceptUrl = `${process.env.APP_URL || 'https://app.logify.cl'}/invite/${token}`;
      sendEmail({
        to: invitation.email,
        subject: 'Te invitaron a unirte a Logify',
        html: `<p>Te invitaron a unirte con el rol <b>${invitation.role}</b>. Acepta la invitación aquí: <a href="${acceptUrl}">${acceptUrl}</a></p>`
      }).catch(() => {});

      res.status(201).json(invitation);
    } catch (err) { sendError(res, 500, 'Failed to create invitation', err); }
  });

  router.post('/invite/:token/accept', async (req, res) => {
    try {
      const { username, password, name } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ error: 'username, password y name son requeridos' });
      }
      const invitation = (await pool.query(
        `SELECT i.*, t.slug AS tenant_slug FROM user_invitations i
         JOIN tenants t ON t.id=i.tenant_id
         WHERE i.token=$1 AND i.status='pending' AND i.expires_at > NOW()`,
        [req.params.token])).rows[0];
      if (!invitation) return res.status(404).json({ error: 'Invitación inválida o expirada' });

      const exists = await pool.query('SELECT 1 FROM users WHERE username=$1 AND tenant_id=$2', [username.trim().toLowerCase(), invitation.tenant_id]);
      if (exists.rows.length) return res.status(409).json({ error: 'El usuario ya existe' });

      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      const user = (await pool.query(
        `INSERT INTO users (username, password_hash, name, role, email, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, name, role, created_at`,
        [username.trim().toLowerCase(), hash, name.trim(), invitation.role, invitation.email, invitation.tenant_id])).rows[0];

      await pool.query(`UPDATE user_invitations SET status='accepted' WHERE id=$1`, [invitation.id]);
      res.status(201).json({ ...user, tenantSlug: invitation.tenant_slug });
    } catch (err) { sendError(res, 500, 'Failed to accept invitation', err); }
  });

  return router;
};
