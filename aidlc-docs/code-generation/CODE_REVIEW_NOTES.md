# Code Review Notes

No se encontró evidencia de un proceso formal de code review (no hay plantilla de PR, no hay `CODEOWNERS`, no hay branch protection visible desde el repo local, y el desarrollo parece haber ocurrido en gran parte directamente sobre `main` y branches personales `develop`/`darlette`/`victor`). Este documento captura observaciones de revisión hechas *durante esta auditoría automática* — no reemplazan una revisión de código humana real, y deben tratarse como una primera pasada, no como aprobación de calidad.

## Observaciones — Prioridad Alta

1. **Sin rollback/compensación automática en el Saga de confirmación de pedido** (orders-service `confirm`). Si el descuento de stock tiene éxito pero la creación de envío falla, el pedido avanza igual con un `warnings` en la respuesta. Riesgo: inconsistencia de datos (stock descontado sin envío real) que requiere intervención manual para corregir. Ver `design-artifacts/ADR/ADR-001-...md`.
2. **`shared/logger.js` no es logging estructurado** — solo `console.*` con timestamp ISO prefijado. Sin niveles configurables por severidad real, sin IDs de correlación de request entre los 4 servicios (crítico para depurar un fallo de Saga que atraviesa 3 servicios). Recomendado antes de operar en producción real.
3. **Credenciales demo en texto plano en `README.md`** (`admin`/`Admin123!`, etc.) — aceptable para un entorno de desarrollo/demo, pero **debe verificarse que estos usuarios semilla no existan o tengan contraseñas rotadas en cualquier entorno de producción real** antes de considerar el sistema "producción". `RENDER_DEPLOY.md` ya lista esto como parte de su checklist.
4. **Aislamiento multi-tenant depende 100% de disciplina de código, no de RLS nativo de Postgres** — cualquier query nueva que un desarrollador olvide filtrar por `tenant_id` es una fuga de datos cross-tenant silenciosa, sin red de seguridad del motor de BD. Ver `design-artifacts/ADR/ADR-002-...md`.

## Observaciones — Prioridad Media

5. **Sin capa de repositorio/servicio separada** — los 4 microservicios backend mezclan rutas HTTP, validación, SQL y lógica de negocio en un único archivo `src/index.js` por servicio. Funciona a la escala actual, pero dificultará testing unitario granular y onboarding de nuevos desarrolladores a medida que el sistema crezca.
6. **Sin migraciones de BD versionadas** — el esquema se crea/actualiza con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` idempotente en el arranque de cada servicio, en vez de un migrator formal (ej. `node-pg-migrate`, Knex migrations). Funciona para evolución aditiva simple, pero no hay forma de hacer rollback de un cambio de esquema ni de ver un historial versionado de cambios de schema.
7. **`.env.example` del Frontend contiene variables obsoletas** (`VITE_COGNITO_ENDPOINT`, `VITE_COGNITO_CLIENT_ID`) de la época de autenticación con AWS Cognito, ya migrada a JWT local — configuración muerta que puede confundir a un desarrollador nuevo.
8. **Tabla `processed_events` sin uso** en `inventory_db`/`shipping_db` — esquema muerto preparado para una idempotencia de mensajería asíncrona que nunca se completó. Limpiar o completar la implementación.
9. **`Dockerfile` no usa build multi-stage** (aceptable dado que son servicios JS sin paso de compilación, pero vale confirmar que no hay devDependencies innecesarias empaquetadas — el `Dockerfile` de inventory-service sí usa `npm install --omit=dev`, correcto).

## Observaciones — Prioridad Baja / Housekeeping

10. **Nombre de carpeta/repo (`SmartLogix`/`logify`) no coincide con el nombre de producto actual ("Logify")** — puramente cosmético, pero puede confundir a colaboradores nuevos.
11. **`docs/technical/03-informe-pruebas.html` no es reproducible.** Esta auditoría ejecutó los tests reales (2026-07-19) y midió 226 tests totales con cobertura de 28.41%-51.44% en backend — muy por debajo del 73.7%-85.7% que reporta ese HTML. Se recomienda regenerarlo o eliminarlo; deja de ser una fuente de verdad confiable tal como está. Ver `testing/TEST_COVERAGE_REPORT.md` para el detalle completo.
12. **Test coverage backend real medido está por debajo de la meta interna declarada de 60%** (medido 2026-07-19: orders-service 51.44%, inventory-service 37.63%, shipping-service 44.39%, notification-service 28.41% — statements). Ningún servicio backend alcanza la meta. Ver `testing/TEST_COVERAGE_REPORT.md`.

## Lo que está bien hecho (para no perder de vista en futuras refactorizaciones)

- Enforcement de RBAC server-side como fuente de verdad (`RESTRICTED_ROLES`, `stripClientCode`), con el frontend como defensa secundaria únicamente — patrón correcto de "no confiar en el cliente".
- Validación de dos factores independientes para confirmar entregas (código de cliente + RUT) — mecanismo de integridad de negocio bien pensado y bien implementado.
- Uso de `SELECT ... FOR UPDATE` en ajustes de stock — previene condiciones de carrera correctamente.
- Derivar el tenant siempre del JWT verificado, nunca de un header no autenticado — decisión de seguridad correcta en el diseño multi-tenant.
- Health checks reales (verifican conectividad a BD, no solo "el proceso está vivo") en los 4 servicios.
