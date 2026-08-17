// Verificación de sesión de Clerk, opcional y aditiva (ver
// aidlc-docs/design-artifacts/ADR/ADR-004-clerk-como-idaas-para-autenticacion.md).
//
// Este módulo NUNCA se activa solo -- shared/auth.js decide si lo intenta,
// y solo si CLERK_SECRET_KEY está configurada. Si no lo está, ningun codigo
// de este archivo se ejecuta y el sistema sigue funcionando exactamente
// igual que antes de que este modulo existiera.
const { verifyToken } = require('@clerk/backend');

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || null;

function isClerkConfigured() {
  return Boolean(CLERK_SECRET_KEY);
}

// Traduce el payload verificado de Clerk a la MISMA forma que ya produce
// shared/auth.js#verifyToken para JWT propios -- shared/auth.js#authMiddleware
// no debe notar la diferencia, ni requireRole/requireTenant/
// extractRoleFromRequest, ni ningun handler de ruta en los 4 servicios.
//
// "sub" es el username (claim custom del JWT Template), NUNCA el Clerk user
// ID -- el codigo existente compara req.user.sub contra users.username (ej.
// orders-service/src/routes/auth.routes.js, DELETE /users/:id) y eso debe
// seguir funcionando sin tocar esos call sites.
function toAppUser(clerkPayload) {
  return {
    sub: clerkPayload.username,
    name: clerkPayload.name,
    role: clerkPayload.role,
    tenant_id: clerkPayload.tenant_id != null ? Number(clerkPayload.tenant_id) : undefined,
    tenant_slug: clerkPayload.tenant_slug,
    'cognito:groups': [clerkPayload.role],
  };
}

// Verifica un token de sesion de Clerk (JWT Template custom con claims
// username/name/role/tenant_id/tenant_slug -- ver el checklist de
// configuracion manual en el ADR-004). Lanza si el token no es valido o no
// tiene los claims esperados; el llamador (shared/auth.js) decide que hacer
// con ese error (cae al JWT propio).
async function verifyClerkToken(token) {
  const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  if (!payload.username || !payload.role || payload.tenant_id == null) {
    throw new Error('Token de Clerk valido pero sin los claims custom esperados (revisar el JWT Template en el dashboard de Clerk)');
  }
  return toAppUser(payload);
}

module.exports = { isClerkConfigured, verifyClerkToken };
