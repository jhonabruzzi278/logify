# Code Review Notes

La observación histórica de ausencia de revisión quedó superada desde el 2026-08-06: `main` tiene branch protection, PR obligatorio, seis checks requeridos, rama estrictamente al día y resolución de conversaciones. Siguen sin existir aprobaciones humanas obligatorias (`required_approving_review_count: 0`), una decisión adecuada para el equipo pequeño actual. Este documento conserva además los hallazgos técnicos que continúan vigentes.

## Observaciones — Prioridad Alta

1. ~~**Sin rollback/compensación automática en el Saga**~~ — **resuelto**: si shipping falla después del descuento, orders-service compensa el stock; una falla de la propia compensación queda marcada para revisión manual. Ver `design-artifacts/ADR/ADR-001-...md`.
2. ~~**Sin logging estructurado ni correlación**~~ — **resuelto**: `shared/logger.js` emite JSON por nivel y `shared/app.js` propaga `X-Request-ID` mediante `AsyncLocalStorage` y `forwardedFetch`. Continúa pendiente agregar agregación centralizada/APM.
3. **Credenciales demo en texto plano en `README.md`** (`admin`/`Admin123!`, etc.) — aceptable para desarrollo local, pero los usuarios de producción deben usar contraseñas distintas. El control vigente está en `deployment/DEPLOYMENT_CHECKLIST.md`; la referencia histórica a `RENDER_DEPLOY.md` fue retirada con la migración al VPS.
4. **Aislamiento multi-tenant depende 100% de disciplina de código, no de RLS nativo de Postgres** — cualquier query nueva que un desarrollador olvide filtrar por `tenant_id` es una fuga de datos cross-tenant silenciosa, sin red de seguridad del motor de BD. Ver `design-artifacts/ADR/ADR-002-...md`.

## Observaciones — Prioridad Media

5. **Sin capa de repositorio/servicio separada** — los 4 microservicios backend mezclan rutas HTTP, validación, SQL y lógica de negocio en un único archivo `src/index.js` por servicio. Funciona a la escala actual, pero dificultará testing unitario granular y onboarding de nuevos desarrolladores a medida que el sistema crezca.
6. **Sin migraciones de BD versionadas** — el esquema se crea/actualiza con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` idempotente en el arranque de cada servicio, en vez de un migrator formal (ej. `node-pg-migrate`, Knex migrations). Funciona para evolución aditiva simple, pero no hay forma de hacer rollback de un cambio de esquema ni de ver un historial versionado de cambios de schema.
7. **Compatibilidad Cognito residual** — `Frontend/.env.example` y `lib/cognito-auth.ts` conservan variables/código de la autenticación anterior, aunque el flujo activo usa JWT local. Debe decidirse si se elimina definitivamente o se mantiene como fallback documentado.
8. **Tabla `processed_events` sin uso** en `inventory_db`/`shipping_db` — esquema muerto preparado para una idempotencia de mensajería asíncrona que nunca se completó. Limpiar o completar la implementación.
9. **`Dockerfile` no usa build multi-stage** (aceptable dado que son servicios JS sin paso de compilación, pero vale confirmar que no hay devDependencies innecesarias empaquetadas — el `Dockerfile` de inventory-service sí usa `npm install --omit=dev`, correcto).

## Observaciones — Prioridad Baja / Housekeeping

10. ~~Nombre de carpeta/repo no coincide con el nombre de producto actual~~ — **resuelto el 2026-08-05**, la carpeta/repo ahora se llama `Logify`.
11. **`docs/technical/03-informe-pruebas.html` no es reproducible.** Esta auditoría ejecutó los tests reales (2026-07-19) y midió 226 tests totales con cobertura de 28.41%-51.44% en backend — muy por debajo del 73.7%-85.7% que reporta ese HTML. Se recomienda regenerarlo o eliminarlo; deja de ser una fuente de verdad confiable tal como está. Ver `testing/TEST_COVERAGE_REPORT.md` para el detalle completo.
12. **Test coverage backend real medido está por debajo de la meta interna declarada de 60%** (medido 2026-07-19: orders-service 51.44%, inventory-service 37.63%, shipping-service 44.39%, notification-service 28.41% — statements). Ningún servicio backend alcanza la meta. Ver `testing/TEST_COVERAGE_REPORT.md`.

## Lo que está bien hecho (para no perder de vista en futuras refactorizaciones)

- Enforcement de RBAC server-side como fuente de verdad (`RESTRICTED_ROLES`, `stripClientCode`), con el frontend como defensa secundaria únicamente — patrón correcto de "no confiar en el cliente".
- Validación de dos factores independientes para confirmar entregas (código de cliente + RUT) — mecanismo de integridad de negocio bien pensado y bien implementado.
- Uso de `SELECT ... FOR UPDATE` en ajustes de stock — previene condiciones de carrera correctamente.
- Derivar el tenant siempre del JWT verificado, nunca de un header no autenticado — decisión de seguridad correcta en el diseño multi-tenant.
- Health checks reales (verifican conectividad a BD, no solo "el proceso está vivo") en los 4 servicios.
