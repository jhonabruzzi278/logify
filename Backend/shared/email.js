const log = require('./logger');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || '587';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@logify.cl';
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || '';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendEmail({ to, subject, html, replyTo }) {
  if (!to) {
    log.warn('Email skipped: no recipient');
    return { sent: false, reason: 'No recipient' };
  }

  if (!SMTP_HOST) {
    log.info('[EMAIL DEMO]', { to, subject });
    log.info('[EMAIL DEMO] Body:', html.replace(/<[^>]*>/g, '').substring(0, 200));
    return { sent: false, reason: 'SMTP not configured (demo mode)', to, subject };
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: SMTP_PORT === '465',
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from: SMTP_FROM, to, subject, html, replyTo: replyTo || SMTP_REPLY_TO || undefined });
    log.info('Email sent', { to, subject });
    return { sent: true, to, subject };
  } catch (err) {
    log.error('Email failed', { to, subject, error: err.message });
    return { sent: false, reason: err.message, to, subject };
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeCode(code) {
  return code || '---';
}

// ── Shared layout wrapper ─────────────────────────────────────────────────────
function layout(content) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;600;700;800&display=swap');</style>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F9;font-family:'Lato',Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F9;padding:32px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;box-shadow:0 18px 50px -22px rgba(15,23,42,0.35)">

      <!-- HEADER -->
      <tr>
        <td style="background:#172554;padding:24px 40px;border-radius:12px 12px 0 0" align="center">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#2563EB;width:32px;height:32px;border-radius:8px;text-align:center;vertical-align:middle" align="center" valign="middle">
                      <span style="font-size:16px;font-weight:900;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;line-height:32px">S</span>
                    </td>
                    <td style="padding-left:10px">
                      <span style="font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px">Logify</span>
                    </td>
                  </tr>
                </table>
              </td>
              <td align="right">
                <span style="font-size:11px;color:#93A5C9;text-transform:uppercase;letter-spacing:1px">POS &amp; Inventario</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="background:#FFFFFF;padding:0;border-radius:0 0 12px 12px">
          ${content}
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:24px 40px" align="center">
          <p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#334155;letter-spacing:-0.2px">Logify</p>
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
            Este correo fue enviado de forma automatica.<br>
            Si tienes dudas, contacta a nuestro equipo de soporte.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Code block component ───────────────────────────────────────────────────────
function codeBlock({ label, code, description, color = '#2563EB', bgColor = '#EFF6FF' }) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0">
    <tr>
      <td style="background:${bgColor};border:2px solid ${color};border-radius:10px;padding:20px 24px" align="center">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1.5px">${escapeHtml(label)}</p>
        <p style="margin:0 0 8px;font-size:32px;font-weight:800;color:#0F172A;letter-spacing:4px;font-family:'Courier New',monospace">${escapeHtml(code)}</p>
        ${description ? `<p style="margin:0;font-size:12px;color:#64748B;line-height:1.5">${description}</p>` : ''}
      </td>
    </tr>
  </table>`;
}

// ── Button component ───────────────────────────────────────────────────────────
function ctaButton(url, text) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr>
      <td align="center">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px">${escapeHtml(text)}</a>
      </td>
    </tr>
  </table>`;
}

// ── Info row component ─────────────────────────────────────────────────────────
function infoRow(label, value) {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #F1F5F9">
      <span style="font-size:13px;color:#94A3B8;display:block;margin-bottom:2px">${escapeHtml(label)}</span>
      <span style="font-size:14px;font-weight:700;color:#0F172A">${escapeHtml(value)}</span>
    </td>
  </tr>`;
}

// ── Alert box component ────────────────────────────────────────────────────────
function alertBox(text, color = '#D97706', bgColor = '#FFFBEB') {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
    <tr>
      <td style="background:${bgColor};border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 18px">
        <p style="margin:0;font-size:13px;color:#0F172A;line-height:1.6">${text}</p>
      </td>
    </tr>
  </table>`;
}

// ── EMAIL 1: Orden creada ──────────────────────────────────────────────────────
function buildOrderConfirmationEmail({ customerName, orderId, sku, quantity, customerCode }) {
  const code = safeCode(customerCode);
  const trackingUrl = customerCode ? `${APP_URL}/tracking/${customerCode}` : APP_URL;
  const name = escapeHtml(customerName);
  const firstName = name ? name.split(' ')[0] : 'Cliente';

  const content = `
    <!-- Status banner -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#ECFDF5;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:1px">✓ Pedido Registrado</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0F172A">Hola, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0F172A">#${escapeHtml(orderId)}</strong> fue registrado con exito y esta siendo preparado.
          </p>

          <!-- Codigo de cliente -->
          ${codeBlock({
            label: 'Tu codigo de seguimiento y retiro',
            code: code,
            description: 'Guarda este codigo. Lo necesitas para rastrear tu pedido<br>y deberas mostrarlo al transportista cuando recibas tu entrega.',
            color: '#2563EB',
            bgColor: '#EFF6FF'
          })}

          ${alertBox('&#128274; <strong>Importante:</strong> Este codigo es personal e intransferible. El transportista lo solicitara junto con tu RUT para confirmar la entrega. No lo compartas con terceros.')}

          <!-- Detalle del pedido -->
          <p style="margin:24px 0 12px;font-size:13px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px">Detalle del pedido</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Numero de orden', '#' + orderId)}
            ${infoRow('Producto (SKU)', escapeHtml(sku))}
            ${infoRow('Cantidad', quantity + ' unidad' + (quantity !== 1 ? 'es' : ''))}
            ${infoRow('Estado actual', 'En preparacion')}
          </table>

          ${customerCode ? ctaButton(trackingUrl, 'Rastrear mi pedido →') : ''}
        </td>
      </tr>
    </table>`;

  return {
    subject: `Logify — Tu pedido #${orderId} fue registrado`,
    html: layout(content)
  };
}

// ── EMAIL 2: Envio en reparto ──────────────────────────────────────────────────
function buildShipmentInTransitEmail({ customerName, orderId, clientCode, trackingCode }) {
  const code = safeCode(clientCode);
  const trackingUrl = clientCode ? `${APP_URL}/tracking/${clientCode}` : APP_URL;
  const name = escapeHtml(customerName);
  const firstName = name ? name.split(' ')[0] : 'Cliente';

  const content = `
    <!-- Status banner -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#FFFBEB;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:1px">&#128666; Tu pedido esta en camino</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0F172A">&#128666; En reparto, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0F172A">#${escapeHtml(orderId)}</strong> esta en camino. Un transportista lo llevara a tu direccion hoy.
          </p>

          ${alertBox('&#128072; <strong>Ten este codigo listo:</strong> El transportista te lo pedira en el momento de la entrega para verificar tu identidad.', '#D97706', '#FFFBEB')}

          <!-- Codigo de retiro -->
          ${codeBlock({
            label: 'Codigo de retiro — mostrar al transportista',
            code: code,
            description: 'El transportista verificara este codigo junto con tu RUT.<br>Sin este codigo no se podra confirmar la entrega.',
            color: '#D97706',
            bgColor: '#FFFBEB'
          })}

          <!-- Numero de envio — referencia interna -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
            <tr>
              <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 20px">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <span style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Numero de envio (referencia interna)</span>
                      <span style="font-size:15px;font-weight:700;color:#475569;font-family:'Courier New',monospace">${escapeHtml(trackingCode) || 'En asignacion'}</span>
                    </td>
                    <td align="right">
                      <span style="font-size:11px;color:#94A3B8">Solo para referencia</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          ${clientCode ? ctaButton(trackingUrl, 'Ver estado del envio →') : ''}
        </td>
      </tr>
    </table>`;

  return {
    subject: `Logify — Tu pedido #${orderId} esta en camino`,
    html: layout(content)
  };
}

// ── EMAIL 3: Entregado ─────────────────────────────────────────────────────────
function buildShipmentDeliveredEmail({ customerName, orderId, clientCode, trackingCode }) {
  const code = safeCode(clientCode);
  const trackingUrl = clientCode ? `${APP_URL}/tracking/${clientCode}` : APP_URL;
  const name = escapeHtml(customerName);
  const firstName = name ? name.split(' ')[0] : 'Cliente';

  const content = `
    <!-- Status banner -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#ECFDF5;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:1px">&#10003; Entrega confirmada</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0F172A">&#127881; Entregado, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0F172A">#${escapeHtml(orderId)}</strong> fue entregado correctamente. La entrega quedo registrada en nuestro sistema.
          </p>

          <!-- Confirmacion visual -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr>
              <td style="background:#ECFDF5;border:2px solid #10B981;border-radius:10px;padding:24px" align="center">
                <p style="margin:0 0 6px;font-size:40px">&#10003;</p>
                <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#065F46">Entrega exitosa</p>
                <p style="margin:0;font-size:13px;color:#047857">Identidad verificada con codigo y RUT</p>
              </td>
            </tr>
          </table>

          <!-- Resumen -->
          <table width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Numero de orden', '#' + orderId)}
            ${infoRow('Tu codigo de seguimiento', code)}
            ${trackingCode ? infoRow('Numero de envio', escapeHtml(trackingCode)) : ''}
            ${infoRow('Estado final', 'Entregado ✓')}
          </table>

          ${clientCode ? ctaButton(trackingUrl, 'Ver comprobante de entrega →') : ''}

          <p style="margin:16px 0 0;font-size:14px;color:#64748B;text-align:center;line-height:1.6">
            Gracias por confiar en Logify.<br>
            <strong style="color:#0F172A">Buena recepcion.</strong>
          </p>
        </td>
      </tr>
    </table>`;

  return {
    subject: `Logify — Tu pedido #${orderId} fue entregado`,
    html: layout(content)
  };
}

// ── EMAIL 4: Bienvenida (signup) ───────────────────────────────────────────────
function buildWelcomeEmail({ ownerName, companyName, ownerUsername, trialEndsAt, supportWhatsappUrl }) {
  const loginUrl = 'https://app.logify.cl/login';
  const firstName = escapeHtml(ownerName ? ownerName.split(' ')[0] : 'Hola');
  const trialDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('es-CL') : '';

  const content = `
    <!-- Status banner -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#ECFDF5;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:1px">&#127881; Cuenta creada</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0F172A">Bienvenido, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            La cuenta de <strong style="color:#0F172A">${escapeHtml(companyName)}</strong> en Logify ya está lista para usarse.
          </p>

          <!-- Credencial de acceso central -->
          ${codeBlock({
            label: 'Tu usuario de acceso es',
            code: ownerUsername,
            description: 'También puedes iniciar sesión con el correo usado durante el registro.',
            color: '#2563EB',
            bgColor: '#EFF6FF'
          })}

          <table width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Tu panel', 'app.logify.cl')}
            ${infoRow('Usuario', ownerUsername)}
            ${trialDate ? infoRow('Tu prueba gratuita vence', trialDate) : ''}
          </table>

          ${ctaButton(loginUrl, 'Ingresar a mi panel →')}

          ${alertBox('&#128161; <strong>Tip:</strong> todos los clientes ingresan desde <a href="https://app.logify.cl/login" style="color:#0F172A">app.logify.cl/login</a>. No necesitas recordar un subdominio.')}

          ${supportWhatsappUrl ? `<p style="margin:24px 0 0;font-size:14px;color:#64748B;text-align:center;line-height:1.6">
            ¿Dudas para arrancar? <a href="${escapeHtml(supportWhatsappUrl)}" style="color:#2563EB;font-weight:700;text-decoration:none">Escríbenos por WhatsApp</a>
          </p>` : ''}
        </td>
      </tr>
    </table>`;

  return {
    subject: `Bienvenido a Logify — ${companyName}`,
    html: layout(content)
  };
}

// ── Backwards-compatible wrapper para EN_REPARTO / ENTREGADO ──────────────────
function buildShipmentUpdateEmail({ customerName, orderId, clientCode, trackingCode, stage }) {
  if (stage === 'ENTREGADO') {
    return buildShipmentDeliveredEmail({ customerName, orderId, clientCode, trackingCode });
  }
  return buildShipmentInTransitEmail({ customerName, orderId, clientCode, trackingCode });
}

module.exports = {
  sendEmail,
  buildOrderConfirmationEmail,
  buildShipmentUpdateEmail,
  buildShipmentInTransitEmail,
  buildShipmentDeliveredEmail,
  buildWelcomeEmail
};
