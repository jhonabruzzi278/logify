# Project Metadata

**Project Name:** Logify (the product was rebranded from "SmartLogix" to "Logify" mid-project; the folder/repo names were renamed to match on 2026-08-05)
**Owner:** JONAHBRUZZI (`jon.guerra@duocuc.cl`) — GitHub: [jhonabruzzi278/logify](https://github.com/jhonabruzzi278/logify.git)
**Analyzed On:** 2026-07-19
**Current Phase:** **Operations — producción activa y estabilización continua**
**Last Updated:** 2026-08-09

## Status
- [x] Inception Phase — complete (retroactively reconstructed from README, wiki/, and code; no formal PRD/backlog tool was used, but intent, roles, and business flow are fully documented in `wiki/`)
- [x] Construction Phase — complete (4 working microservices, RBAC, Saga order flow, 558 tests + 15 E2E, CI/CD wired via `.github/workflows/ci.yml` with branch protection)
- [x] Operations Phase — **activa desde 2026-08-06**: backend en VPS propio, Frontend/Landing en Vercel, dominios públicos con TLS, monitoreo básico vía Uptime Kuma y CI/CD automático con rollback. Los incidentes reales se registran en `operations/POST_MORTEMS/`.

## Estado operativo verificado al 2026-08-09

- `main` está protegida: PR obligatorio, seis checks de CI requeridos, rama al día y conversaciones resueltas.
- `.github/workflows/ci.yml` ejecuta las cuatro suites backend, typecheck/tests/build del Frontend, build de Landing y análisis SonarCloud.
- `.github/workflows/deploy.yml` despliega el backend al VPS únicamente después de CI verde y usa `Backend/scripts/02-vps-deploy.sh` con health check y rollback.
- Frontend y Landing se despliegan en Vercel; Uptime Kuma se publica en `status.logify.cl`.
- El onboarding self-service, portal neutral `app.logify.cl`, prueba gratuita de 30 días, RBAC estricto e invitaciones/recuperación por tenant están implementados.
- Web Push está activo: VAPID vive en GitHub Secrets y se sincroniza al VPS; el cliente PWA se actualiza automáticamente sin conservar bundles obsoletos.
- Deuda abierta: Quality Gate de SonarCloud como regla requerida, E2E periódicos contra producción, observabilidad avanzada, backups externos y runbook para fallos de compensación de la Saga.

**Nota:** la sección "Notas del Análisis Automático" de abajo describe el estado histórico auditado el 2026-07-19. No debe usarse como estado actual; se conserva como trazabilidad del análisis original.

## Quick Links
- Requirements: [aidlc-docs/requirements/](./requirements/)
- Architecture: [aidlc-docs/design-artifacts/ARCHITECTURE.md](./design-artifacts/ARCHITECTURE.md)
- Deployment: [aidlc-docs/deployment/](./deployment/)
- Existing project wiki (source of truth this audit draws from): [wiki/](../wiki/)

## Notas del Análisis Automático

**Cómo se detectó la fase:** Siguiendo el árbol de decisión del kickoff — el repo tiene código funcional completo (no es Inception) → tiene tests que corren localmente (Jest + Vitest, 164 o 212 según la fuente, ver discrepancia documentada) → tiene evidencia de deployment (Dockerfiles, `docker-compose.yml`, `render.yaml`, `RENDER_DEPLOY.md` detallado) pero **no** evidencia de estar activamente en producción (sin monitoring, sin logging estructurado, sin alerting, checklist de producción sin marcar en `RENDER_DEPLOY.md`). Esto ubica al proyecto en **Late Construction**, en el límite hacia Operations.

**Supuestos y hallazgos importantes que requieren tu validación:**
1. **Discrepancia de datos de testing — resuelta ejecutando los tests reales.** `wiki/Pruebas.md`/`README.md` reportaban 212 tests (29.9%–77.4% cobertura); `docs/technical/03-informe-pruebas.html` reportaba 164 tests (73.7%–85.7%). Esta auditoría ejecutó los 5 comandos de test reales el 2026-07-19: resultado medido = **226 tests, todos pasando**, cobertura backend real de **28.41%–51.44%** (statements) y frontend **76.19%**. Ninguno de los dos reportes previos era exacto; el HTML de `docs/technical/` en particular no es reproducible con el código actual y no debería seguir usándose como fuente de verdad. Detalle completo en `testing/TEST_COVERAGE_REPORT.md`.
2. **CI/CD fue removido deliberadamente:** el commit `6018f89` ("eliminar infraestructura AWS/Terraform y CI/CD asociado") retiró un pipeline de CI/CD previo junto con infraestructura AWS/Terraform. Hoy no hay `.github/workflows/`. Asumo que esto fue una decisión consciente de simplificación (menos infra que mantener en fase de desarrollo activo), no un descuido — pero es un gap real de cara a Operations.
3. **Historial git ambiguo:** `git log --reverse` muestra un único commit inicial ("Primer commit solo con documentos", `b2223ce`) con la misma fecha que HEAD (2026-07-16), y 145 commits totales — sugiere que el historial fue posiblemente comprimido/rehecho (squash) en algún punto, o que todo el desarrollo ocurrió en una ventana muy corta. No se puede determinar la duración real del proyecto con certeza desde git solo.
4. **Multi-tenancy declarada como "en progreso" pero con fases funcionales ya implementadas:** el código y `wiki/Multi-Tenant.md` muestran las fases 4A/4B/4C completas (aislamiento por `tenant_id`, JWT con tenant, verificación cross-tenant) pero el README todavía describe el sistema como "single-tenant". Se documenta esto como fase transicional real, no como error.
5. **Stakeholders:** no hay evidencia de stakeholders externos (cliente real, inversionistas) en el repo — parece un proyecto académico/portfolio individual o de equipo pequeño (branches `develop`, `darlette`, `victor` sugieren 2-3 colaboradores). Se asume "proyecto de portafolio/académico con potencial de convertirse en SaaS real" salvo que el usuario indique lo contrario. ⚠️ Pendiente validación humana.
6. **Operations cambió después de la auditoría original:** los placeholders iniciales se reemplazaron el 2026-08-08 con el estado real de VPS, Vercel, Uptime Kuma, CI/CD, rollback y gaps operativos vigentes.
