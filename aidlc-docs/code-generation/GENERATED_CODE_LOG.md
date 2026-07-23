# Generated Code Log

Este proyecto no fue generado mediante flujo AI-DLC formal (Intent → Unit → Bolt) desde su origen — el código ya existía antes de esta auditoría. Este log documenta la evolución real del código según el historial de git (145 commits en `main`), como sustituto retroactivo de un log de generación.

## Hitos principales detectados en `git log`

| Commit | Cambio |
|---|---|
| `b2223ce` (primer commit) | "Primer commit solo con documentos" — el repo comenzó como documentación, no código |
| (rango medio) | Construcción incremental de los 4 microservicios, RBAC de 7 roles, flujo Saga de confirmación de pedido |
| — | Migración de autenticación: reemplazo de AWS Cognito por JWT local propio (commits `4b6dd3b` "reemplazar auth Cognito/demo por JWT backend simple", `dee6cf0` "corregir referencias obsoletas a Cognito") |
| — | Integraciones externas añadidas incrementalmente: PDF (pdfkit), QR (qrserver.com), geocodificación (Nominatim), clima (Open-Meteo), rutas (OSRM), validación de RUT chileno, notificaciones push web (VAPID) |
| `6018f89` | "eliminar infraestructura AWS/Terraform y CI/CD asociado" — retiro deliberado de CI/CD (ver `design-artifacts/ADR/ADR-003-...md`) |
| — | Rebrand de "SmartLogix" a "Logify" (nombre de producto cambiado; carpetas/repo mantienen el nombre original) |
| — | Roadmap multi-tenant, fases 4A → 4C (schema, propagación de tenant, enforcement) — ver `design-artifacts/ADR/ADR-002-...md` |
| `85591f3` (HEAD) | "fix: soportar subdominios de tenant en CORS + guia completa de deploy" (2026-07-16) |

⚠️ **Nota sobre el historial de git:** `git log --reverse` devuelve el mismo commit que HEAD como "primero", con 145 commits totales fechados aparentemente todos el mismo día visible desde la herramienta usada en esta auditoría — esto sugiere un posible squash/rebase del historial, o que el desarrollo ocurrió en una ventana de tiempo muy corta y concentrada. No se pudo determinar con certeza la duración real de desarrollo. Si se requiere un log de generación AI-DLC preciso hacia adelante, se recomienda empezar a usar `prompts.md` (ver ese archivo) de forma consistente desde ahora.

## Estructura de código generado (no AI-DLC, pero documentada para referencia)

- Cada microservicio backend es un único archivo `src/index.js` (rutas + SQL + lógica de negocio inline, sin capas separadas de controller/service/repository) — consistente en las 4 servicios, sugiere un patrón deliberado de simplicidad más que generación automática por IA sin revisión.
- `Backend/shared/` centraliza cross-cutting concerns para evitar duplicación entre los 4 servicios.
- Frontend sigue una estructura más convencional en capas (`app/`, `components/`, `hooks/`, `lib/`, `pages/`, `types/`).

## Hacia adelante

A partir de esta auditoría, si el equipo adopta el flujo AI-DLC formalmente, este archivo debería registrar cada Bolt: qué Unit se implementó, qué prompt/spec lo generó, y un resumen de la revisión humana aplicada — ver plantilla en `prompts.md`.
