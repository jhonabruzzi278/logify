# 2026-08-07 — Login y recuperación de contraseña rotos para todo tenant real (falta header de tenant)

## Resumen

Al crear una cuenta de prueba nueva (`minimarketelsol.logify.cl`) y probar el
login real en el dashboard (`Frontend`, la SPA React/Vite), el intento
fallaba con "Credenciales invalidas" **usando el usuario y contraseña
correctos**, recién generados por el signup. Confirmado que no era un
problema de datos: la misma request hecha manualmente contra la API con el
header `X-Tenant-Slug: minimarketelsol` devuelve `200` con un token válido.

## Causa raíz

`Frontend/src/lib/api-client.ts` (`ApiClient.buildHeaders`) agrega
automáticamente el header `X-Tenant-Slug` — derivado del subdominio via
`getTenantSlug()` — a **todas** las requests que pasan por `apiClient`/
`apiFetch`. Eso es lo que usa el resto de la app una vez autenticada (POS,
inventario, pedidos, despachos, etc.).

Pero `Frontend/src/lib/auth-service.ts` (`loginWithBackend`, usado en el
login) y `Frontend/src/lib/security-service.ts` (todo el flujo de "olvidé mi
contraseña": `getSecretQuestion`, `verifySecretAnswer`,
`resetPasswordWithToken`) usan un `fetch()` propio, **sin pasar por
`ApiClient`**, y por lo tanto sin el header de tenant.

En el backend (`Backend/orders-service/src/index.js`):

```js
async function resolveTenant(slug) {
  const r = await pool.query('SELECT * FROM tenants WHERE slug=$1', [(slug || DEFAULT_TENANT_SLUG).toLowerCase()]);
  return r.rows[0] || null;
}
```

`DEFAULT_TENANT_SLUG = 'logify'`. Sin el header, cualquier login o
recuperación de contraseña se resuelve silenciosamente contra el tenant
`logify` (demo) en vez del tenant real del subdominio — el usuario no existe
ahí, y el endpoint responde `401 Credenciales invalidas`, un mensaje
indistinguible de una contraseña realmente incorrecta.

## Impacto

- **Ningún cliente real podía iniciar sesión** en su propio panel desde
  `<slug>.logify.cl/login`, sin importar que sus credenciales fueran
  correctas — el bug es 100% reproducible para cualquier tenant, no un caso
  límite.
- El flujo completo de "¿Olvidaste tu contraseña?" tenía el mismo problema
  (pregunta secreta, verificación de respuesta, reseteo de contraseña).
- **No afectado:** cualquier operación ya autenticada (POS, inventario,
  pedidos, despachos, dashboard, clientes) — esas rutas usan `apiClient`, que
  sí incluye el header correctamente. El problema estaba específicamente en
  las dos rutas de auth que no pasan por un token todavía.

## Remediación aplicada

- `Frontend/src/lib/auth-service.ts`: `loginWithBackend` ahora incluye
  `X-Tenant-Slug` (via `getTenantSlug()`, la misma función que usa
  `api-client.ts`) cuando hay un tenant resuelto del subdominio.
- `Frontend/src/lib/security-service.ts`: las tres funciones del flujo de
  recuperación de contraseña (`getSecretQuestion`, `verifySecretAnswer`,
  `resetPasswordWithToken`) incluyen el mismo header via un helper
  `tenantHeaders()`.
- Tests nuevos (`src/lib/__tests__/auth-service.test.ts`,
  `security-service.test.ts`) que verifican explícitamente que el header se
  envía cuando hay tenant, y que la ausencia de tenant (dominio principal)
  no rompe el request.
- Verificado: `npm run typecheck` y `npm run build` limpios; requests
  manuales contra `api.logify.cl` con el header correcto devuelven `200`.
- `Frontend/package.json` versión `1.0.0` → `1.0.1`.

## Seguimiento

- [ ] Considerar centralizar TODAS las llamadas de red (incluidas las de
      pre-auth) a través de `ApiClient`/`apiFetch` en vez de mantener
      `fetch()` sueltos en `auth-service.ts`/`security-service.ts` — hubiera
      hecho este bug estructuralmente imposible.
- [ ] El backend devuelve el mismo mensaje genérico "Credenciales invalidas"
      tanto para tenant no encontrado como para usuario/contraseña
      incorrectos. Es correcto por seguridad (no filtrar si el tenant
      existe), pero dificulta debuggear este tipo de problema — vale la pena
      loguear server-side (no en la respuesta al cliente) cuando
      `resolveTenant` cae al tenant por defecto por falta de header.
- [ ] Agregar un smoke test E2E que haga login real contra un tenant de
      prueba a través del subdominio (no contra `api.logify.cl` directo) —
      hubiera detectado esto en CI.

🤖 Generado con [Claude Code](https://claude.com/claude-code)
