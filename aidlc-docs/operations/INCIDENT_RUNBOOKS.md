# Incident Runbooks

**⚠️ Pendiente — no existen runbooks formales de incidentes en el repositorio.**

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
