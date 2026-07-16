const log = require('./logger');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || '587';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@logify.cl';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendEmail({ to, subject, html }) {
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
    await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:32px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- HEADER -->
      <tr>
        <td style="background:#0D1B2A;padding:24px 40px;border-radius:12px 12px 0 0" align="center">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px">Smart</span><span style="font-size:22px;font-weight:800;color:#4B98CF;letter-spacing:-0.5px">Logix</span>
              </td>
              <td align="right">
                <span style="font-size:11px;color:#8BA3BB;text-transform:uppercase;letter-spacing:1px">Gestion Logistica</span>
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
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6">
            Este correo fue enviado por Logify de forma automatica.<br>
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
function codeBlock({ label, code, description, color = '#4B98CF', bgColor = '#EBF4FF' }) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0">
    <tr>
      <td style="background:${bgColor};border:2px solid ${color};border-radius:10px;padding:20px 24px" align="center">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1.5px">${escapeHtml(label)}</p>
        <p style="margin:0 0 8px;font-size:32px;font-weight:800;color:#0D1B2A;letter-spacing:4px;font-family:'Courier New',monospace">${escapeHtml(code)}</p>
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
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#4B98CF;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">${escapeHtml(text)}</a>
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
      <span style="font-size:14px;font-weight:700;color:#0D1B2A">${escapeHtml(value)}</span>
    </td>
  </tr>`;
}

// ── Alert box component ────────────────────────────────────────────────────────
function alertBox(text, color = '#F59E0B', bgColor = '#FFFBEB') {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
    <tr>
      <td style="background:${bgColor};border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 18px">
        <p style="margin:0;font-size:13px;color:#0D1B2A;line-height:1.6">${text}</p>
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
        <td style="background:#E8F5E9;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#2E7D32;text-transform:uppercase;letter-spacing:1px">✓ Pedido Registrado</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0D1B2A">Hola, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0D1B2A">#${escapeHtml(orderId)}</strong> fue registrado con exito y esta siendo preparado.
          </p>

          <!-- Codigo de cliente -->
          ${codeBlock({
            label: 'Tu codigo de seguimiento y retiro',
            code: code,
            description: 'Guarda este codigo. Lo necesitas para rastrear tu pedido<br>y deberas mostrarlo al transportista cuando recibas tu entrega.',
            color: '#4B98CF',
            bgColor: '#EBF4FF'
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
        <td style="background:#FFF8E1;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:1px">&#128666; Tu pedido esta en camino</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0D1B2A">&#128666; En reparto, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0D1B2A">#${escapeHtml(orderId)}</strong> esta en camino. Un transportista lo llevara a tu direccion hoy.
          </p>

          ${alertBox('&#128072; <strong>Ten este codigo listo:</strong> El transportista te lo pedira en el momento de la entrega para verificar tu identidad.', '#E65100', '#FFF8E1')}

          <!-- Codigo de retiro -->
          ${codeBlock({
            label: 'Codigo de retiro — mostrar al transportista',
            code: code,
            description: 'El transportista verificara este codigo junto con tu RUT.<br>Sin este codigo no se podra confirmar la entrega.',
            color: '#E65100',
            bgColor: '#FFF8E1'
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
        <td style="background:#E8F5E9;padding:16px 40px" align="center">
          <span style="font-size:13px;font-weight:700;color:#2E7D32;text-transform:uppercase;letter-spacing:1px">&#10003; Entrega confirmada</span>
        </td>
      </tr>
    </table>

    <!-- Main content -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px">
      <tr>
        <td>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0D1B2A">&#127881; Entregado, ${firstName}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6">
            Tu pedido <strong style="color:#0D1B2A">#${escapeHtml(orderId)}</strong> fue entregado correctamente. La entrega quedo registrada en nuestro sistema.
          </p>

          <!-- Confirmacion visual -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr>
              <td style="background:#E8F5E9;border:2px solid #4CAF50;border-radius:10px;padding:24px" align="center">
                <p style="margin:0 0 6px;font-size:40px">&#10003;</p>
                <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#1B5E20">Entrega exitosa</p>
                <p style="margin:0;font-size:13px;color:#2E7D32">Identidad verificada con codigo y RUT</p>
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
            <strong style="color:#0D1B2A">Buena recepcion.</strong>
          </p>
        </td>
      </tr>
    </table>`;

  return {
    subject: `Logify — Tu pedido #${orderId} fue entregado`,
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
  buildShipmentDeliveredEmail
};
