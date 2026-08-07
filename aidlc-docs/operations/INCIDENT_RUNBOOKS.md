# Incident Runbooks

## Eliminar un tenant completo (irreversible)

Agregado 2026-08-07 a pedido explícito para eliminar el tenant de prueba
`la-isla-barber-studio` tras el incidente de autoeliminación de admin (ver
`POST_MORTEMS/2026-08-07-admin-autoeliminacion.md`). Es el primer
procedimiento real de este documento — el resto de la lista más abajo sigue
pendiente.

**No hay soft-delete ni papelera de reciclaje.** Esto borra permanentemente
todos los datos del tenant (usuarios, clientes, pedidos, inventario, ventas,
compras, sesiones de caja, proveedores, envíos, notificaciones) en las 4
bases de datos del backend. No hay forma de deshacerlo — no hay backup
automático tomado antes de correr esto.

```bash
curl -X DELETE "https://api.logify.cl/api/admin/tenants/<slug>" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <PLATFORM_ADMIN_KEY de produccion>" \
  -d '{"confirmSlug":"<slug>"}'
```

- `<slug>` en la URL y `confirmSlug` en el body deben ser **exactamente
  iguales** — es la única protección contra borrar el tenant equivocado por
  un typo en la URL. Si no coinciden, responde 400 sin tocar nada.
- El tenant demo de la plataforma (`logify`, id=1) está bloqueado
  explícitamente y no se puede eliminar por esta vía.
- Internamente, `orders-service` (dueño de la tabla `tenants`) orquesta la
  purga: llama primero a `inventory-service`, `shipping-service` y
  `notification-service` (cada uno con su propia base de datos — Postgres no
  permite FK cross-database) vía `DELETE /api/admin/tenants/:tenantId/purge`
  con el mismo `PLATFORM_ADMIN_KEY`, y solo si los 3 responden OK borra sus
  propios datos (`orders`, `customers`, `users`, etc.) y finalmente la fila
  de `tenants`.
- Si algún servicio remoto falla, la respuesta es `502` con
  `purgedSoFar` indicando qué servicios sí se alcanzaron a purgar, y **no
  se toca ningún dato local de orders-service ni la fila de `tenants`** —
  el `DELETE` completo es reintentable sin riesgo: cada purga es
  `DELETE FROM tabla WHERE tenant_id=$1`, idempotente por diseño.
- Respuesta 200 exitosa incluye `purged` con los conteos de filas borradas
  por cada uno de los 4 servicios, para verificar que efectivamente barrió
  todo.

**⚠️ El resto de este documento sigue pendiente — no existen otros runbooks
formales de incidentes en el repositorio.**

## Lo más cercano a un runbook que existe hoy

`wiki/Inicio-Rapido.md` incluye una tabla de **troubleshooting de desarrollo local** (no de producción/incidentes), cubriendo: conflictos de puerto, timing de conexión a BD al arrancar, y mala configuración del proxy — útil para onboarding de desarrolladores, no para operar un incidente en producción.

`RENDER_DEPLOY.md` documenta el efecto conocido de cold-starts (servicios "dormidos" en el free tier) como algo a tener en cuenta, pero no como un runbook accionable paso a paso ("si ves timeout X, hacer Y").

## Runbooks que faltan genuinamente (lista de qué se necesitaría, no contenido inventado)

- Qué hacer si un servicio backend no responde (¿cómo diferenciar cold-start normal de una caída real?)
- Qué hacer si el flujo Saga de confirmación de pedido falla a mitad de camino (stock descontado, envío no creado) — el propio diseño ya documenta que esto requiere "compensación manual" (ver `design-artifacts/ADR/ADR-001-...md`), pero no hay un procedimiento escrito de cómo hacer esa compensación manual paso a paso.
- Qué hacer si Neon (BD) alcanza su límite de free tier o se suspende inesperadamente.
- Cómo rotar `JWT_SECRET` de forma coordinada entre los 4 servicios sin invalidar sesiones activas de forma abrupta.
- Cómo diagnosticar una fuga de datos cross-tenant si ocurriera (dado que el aislamiento depende de disciplina de código, no de RLS nativo — ver `design-artifacts/ADR/ADR-002-...md`).

Este documento debe poblarse con procedimientos reales a medida que el equipo los defina o los aprenda de incidentes reales — no antes.
