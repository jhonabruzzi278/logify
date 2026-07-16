// ═══ MÓDULO DE SEGURIDAD: recuperación de clave con pregunta secreta ═══════════════
// No reemplaza el login por username existente. Agrega un segundo factor de
// recuperación (RUT + correo en el perfil, pregunta secreta) para cuando un
// trabajador olvida su contraseña.
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../shared/auth');
const log = require('../shared/logger');

const RESET_TOKEN_EXPIRES_IN = '10m';
const GENERIC_QUESTION = '¿Cuál es el nombre de tu primera mascota?';

function validatePasswordStrength(password) {
  const errors = [];
  const value = password || '';
  if (value.length < 10) errors.push('Debe tener al menos 10 caracteres');
  if (!/[A-Z]/.test(value)) errors.push('Debe incluir una letra mayúscula');
  if (!/[a-z]/.test(value)) errors.push('Debe incluir una letra minúscula');
  if (!/[0-9]/.test(value)) errors.push('Debe incluir un número');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Debe incluir un símbolo (ej: ! @ # $)');
  return errors;
}

// Fase 4C del roadmap multi-tenant (ver wiki/Multi-Tenant.md): resuelve el
// tenant desde req.tenantSlug (cae al tenant "logify" por defecto si no
// viene header, para no romper desarrollo local) y lo usa para acotar la
// busqueda de usuarios. Necesario porque tras 4C el username ya no es
// unico globalmente, solo por tenant.
function registerSecurityModule(app, pool, sendError, resolveTenant) {
  const getBcrypt = () => require('bcryptjs');

  // Paso 1: pide la pregunta secreta de un usuario.
  // Siempre responde 200 con una pregunta (genérica si el usuario o el
  // tenant no existen) para no revelar qué usernames son válidos.
  app.get('/api/security/forgot-password/question', async (req, res) => {
    try {
      const username = (req.query.username || '').toString().trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'username es requerido' });
      const tenant = await resolveTenant(req.tenantSlug);
      if (!tenant) return res.json({ question: GENERIC_QUESTION });
      const r = await pool.query('SELECT secret_question FROM users WHERE username=$1 AND tenant_id=$2', [username, tenant.id]);
      res.json({ question: r.rows[0]?.secret_question || GENERIC_QUESTION });
    } catch (err) { sendError(res, 500, 'Failed to get secret question', err); }
  });

  // Paso 2: verifica la respuesta secreta y, si es correcta, entrega un token
  // de recuperación de corta duración (10 min) para el paso 3.
  app.post('/api/security/forgot-password/verify', async (req, res) => {
    try {
      const bcrypt = getBcrypt();
      const username = (req.body.username || '').toString().trim().toLowerCase();
      const secretAnswer = (req.body.secretAnswer || '').toString().trim().toLowerCase();
      if (!username || !secretAnswer) {
        return res.status(400).json({ error: 'username y secretAnswer son requeridos' });
      }

      const invalidResponse = () => res.status(400).json({ error: 'Usuario o respuesta secreta incorrecta' });

      const tenant = await resolveTenant(req.tenantSlug);
      if (!tenant) return invalidResponse();

      const r = await pool.query('SELECT username, secret_answer_hash FROM users WHERE username=$1 AND tenant_id=$2', [username, tenant.id]);
      const user = r.rows[0];

      if (!user || !user.secret_answer_hash) return invalidResponse();

      const matches = await bcrypt.compare(secretAnswer, user.secret_answer_hash);
      if (!matches) return invalidResponse();

      const resetToken = jwt.sign({ sub: user.username, tenant_id: tenant.id, purpose: 'password-reset' }, JWT_SECRET, {
        expiresIn: RESET_TOKEN_EXPIRES_IN,
      });
      res.json({ resetToken, expiresIn: RESET_TOKEN_EXPIRES_IN });
    } catch (err) { sendError(res, 500, 'Failed to verify secret answer', err); }
  });

  // Paso 3: con el token de recuperación válido, define clave nueva + confirmación.
  app.post('/api/security/forgot-password/reset', async (req, res) => {
    try {
      const bcrypt = getBcrypt();
      const { resetToken, newPassword, confirmPassword } = req.body || {};
      if (!resetToken) return res.status(400).json({ error: 'resetToken es requerido' });
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'La confirmación no coincide con la contraseña nueva' });
      }

      const strengthErrors = validatePasswordStrength(newPassword);
      if (strengthErrors.length) return res.status(400).json({ error: strengthErrors.join('; ') });

      let payload;
      try {
        payload = jwt.verify(resetToken, JWT_SECRET);
      } catch {
        return res.status(400).json({ error: 'El enlace de recuperación expiró o no es válido. Solicítalo de nuevo.' });
      }
      if (payload.purpose !== 'password-reset' || !payload.sub || !payload.tenant_id) {
        return res.status(400).json({ error: 'Token de recuperación inválido' });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      const result = await pool.query(
        'UPDATE users SET password_hash=$1, updated_at=NOW() WHERE username=$2 AND tenant_id=$3 RETURNING username',
        [hash, payload.sub, payload.tenant_id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

      log.info('Password reset via secret question', { username: payload.sub });
      res.json({ success: true });
    } catch (err) { sendError(res, 500, 'Failed to reset password', err); }
  });
}

module.exports = { registerSecurityModule, validatePasswordStrength };
