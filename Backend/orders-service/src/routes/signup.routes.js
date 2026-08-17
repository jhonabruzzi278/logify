const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendEmail, buildWelcomeEmail } = require('../../shared/email');
const { validatePasswordStrength } = require('../security-module');
const { validateSlugFormat } = require('../lib/tenant');

const TRIAL_DAYS = 30;
const SUPPORT_WHATSAPP_URL = process.env.SUPPORT_WHATSAPP_URL || 'https://wa.me/56938980598';

// ═══ SIGNUP SELF-SERVICE (Fase 4E) ═══════════════════════════════════════════════
// Publico, sin JWT: crea el tenant y su primer usuario ("owner") en una sola
// transaccion. Rate limit propio, mas estricto que el global de
// shared/security.js, porque este endpoint escribe filas nuevas sin
// autenticacion previa.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/signup', signupRoutes({ pool, sendError })).
module.exports = function signupRoutes({ pool, sendError }) {
  const router = express.Router();

  const signupRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.SIGNUP_RATE_LIMIT_MAX || '5', 10),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: 'Demasiados intentos de registro, intenta de nuevo mas tarde' },
  });

  router.get('/check-slug', async (req, res) => {
    try {
      const slug = (req.query.slug || '').toString().trim().toLowerCase();
      const formatError = validateSlugFormat(slug);
      if (formatError) return res.json({ available: false, reason: formatError });
      const exists = await pool.query('SELECT 1 FROM tenants WHERE slug=$1', [slug]);
      if (exists.rows.length) return res.json({ available: false, reason: 'Ese subdominio ya esta en uso' });
      res.json({ available: true });
    } catch (err) { sendError(res, 500, 'Failed to check slug', err); }
  });

  router.post('/', signupRateLimit, async (req, res) => {
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

    const bcrypt = require('bcryptjs');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const slugTaken = await client.query('SELECT 1 FROM tenants WHERE slug=$1', [slug]);
      if (slugTaken.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ese subdominio ya esta en uso' });
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
          business_phone, business_industry, used_pos_before, onboarding_goals)
         VALUES ($1,$2,'trial','pro','trialing',$3,$4,$5,$6,$7,$8) RETURNING id, slug, name, trial_ends_at`,
        [slug, companyName.trim(), contactEmail.trim(), trialEndsAt,
         phone || null, businessIndustry || null, usedPosBefore ?? null, JSON.stringify(goals || [])]
      )).rows[0];

      const usernameNorm = ownerUsername.trim().toLowerCase();
      const hash = await bcrypt.hash(ownerPassword, 10);
      const owner = (await client.query(
        `INSERT INTO users (username, password_hash, name, role, email, tenant_id)
         VALUES ($1,$2,$3,'owner',$4,$5) RETURNING id, username, name, role`,
        [usernameNorm, hash, ownerName.trim(), contactEmail.trim(), tenant.id]
      )).rows[0];

      if (coupon) {
        await client.query('UPDATE coupons SET redemptions_count = redemptions_count + 1 WHERE id=$1', [coupon.id]);
        await client.query('INSERT INTO coupon_redemptions (tenant_id, coupon_id) VALUES ($1,$2)', [tenant.id, coupon.id]);
      }

      await client.query('COMMIT');

      const appUrl = `https://${tenant.slug}.logify.cl`;
      const welcomeEmail = buildWelcomeEmail({
        ownerName: ownerName.trim(),
        companyName: companyName.trim(),
        slug: tenant.slug,
        ownerUsername: owner.username,
        trialEndsAt: tenant.trial_ends_at,
        supportWhatsappUrl: SUPPORT_WHATSAPP_URL
      });
      sendEmail({ to: contactEmail.trim(), subject: welcomeEmail.subject, html: welcomeEmail.html }).catch(() => {});

      res.status(201).json({ tenantSlug: tenant.slug, appUrl, trialEndsAt: tenant.trial_ends_at, ownerUsername: owner.username });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      sendError(res, 500, 'Signup failed', err);
    } finally {
      client.release();
    }
  });

  return router;
};
