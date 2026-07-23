# Test Strategy

## Frameworks Detectados

| Componente | Framework | Runner/Config |
|---|---|---|
| Backend (4 servicios) | Jest 29 + Supertest 7 | `npm test` por servicio, `jest --coverage` (reporters text/html/lcov) |
| Frontend | Vitest 4 + React Testing Library + MSW | jsdom environment, config en `Frontend/vite.config.ts`, setup en `Frontend/src/setup-tests.ts`, `@vitest/coverage-v8` |
| API end-to-end | Postman/Newman | Colección en `docs/api/logify-postman-collection.json`, 16 carpetas incluyendo 5 flujos completos E2E (happy path, cancelación, múltiples órdenes, ciclos de inventario, trazabilidad de notificaciones) |

## Enfoque de Testing Backend

- Tests co-ubicados junto al código (`src/*.test.js` por servicio), no en carpeta `__tests__/` separada.
- Base de datos mockeada (`jest.mock('../shared/db', ...)`) — los tests **no** corren contra una BD real, son tests de unidad/integración de la capa HTTP con dependencias mockeadas.
- Llamadas HTTP salientes del Saga (`fetch` inter-servicio) también mockeadas.
- Guard `require.main === module` en cada `index.js` previene que arrancar el servidor interfiera con los tests.
- Tamaño de suites: orders ~562+176 líneas (incluye módulo de seguridad separado), inventory ~422 líneas, notification ~279 líneas, shipping ~289 líneas.

## Enfoque de Testing Frontend

- Solo 3 archivos de test encontrados: `use-api-query.test.tsx`, `api-adapters.test.ts`, `api-client.test.ts` — cobertura muy concentrada en la capa de datos (hooks + cliente API), **no hay tests de componentes de página ni de flujos de usuario** (ej. no hay test de "el flujo de login funciona", "la tabla de inventario se renderiza correctamente por rol").
- MSW (Mock Service Worker) disponible como dependencia — sugiere que la intención de diseño es mockear la API a nivel de red para tests de componentes, pero esto no está siendo aprovechado ampliamente todavía dado el bajo número de archivos de test.

## Gaps Identificados (⚠️ genuinos, no inventados — basados en conteo de archivos)

1. **Sin tests de componentes de UI/páginas en el Frontend** — con 20+ páginas y un sistema RBAC complejo (7 roles, cada uno con vistas distintas), solo 3 archivos de test cubren la capa de datos, no la de presentación ni la de navegación por rol.
2. **Sin tests para integraciones externas añadidas al final del desarrollo** — confirmado explícitamente en `wiki/Pruebas.md`: "la brecha actual se concentra en las integraciones externas agregadas al final (push, indicadores, QR/PDF), que se verificaron end-to-end pero aún no tienen pruebas unitarias dedicadas."
3. **Sin test automatizado que ejerza el flujo completo de fallo parcial del Saga** (ej. ¿qué pasa realmente si shipping-service no responde durante la confirmación de un pedido? — el comportamiento está documentado como "warnings sin rollback" pero no se confirmó durante esta auditoría que exista un test que lo verifique explícitamente).
4. **No hay `coverageThreshold` configurado en Jest** — confirmado explícitamente en `wiki/Pruebas.md`: nada bloquea un commit o build que reduzca la cobertura por debajo de la meta interna de 60%.
5. **Sin CI que ejecute estos tests automáticamente** — ver `design-artifacts/ADR/ADR-003-...md`. Los tests existen y aparentemente pasan localmente, pero nada garantiza que se ejecuten antes de cada despliegue.

## Cobertura Actual

El repo tenía dos reportes preexistentes que no coincidían entre sí (212 vs. 164 tests — ver historial en `TEST_COVERAGE_REPORT.md`). Esta auditoría **ejecutó los 5 comandos de test reales el 2026-07-19** para resolver la discrepancia con datos medidos, no inferidos:

| Componente | Tests reales | % Stmts |
|---|---:|---:|
| orders-service | 73 | 51.44% |
| inventory-service | 46 | 37.63% |
| shipping-service | 28 | 44.39% |
| notification-service | 26 | 28.41% |
| Frontend | 53 | 76.19% |
| **TOTAL** | **226** | — |

Todos los 226 tests pasan. Ninguno de los 4 servicios backend alcanza la meta interna declarada de 60% de cobertura (ver detalle y análisis completo en `TEST_COVERAGE_REPORT.md`, incluyendo por qué `docs/technical/03-informe-pruebas.html` no es reproducible y no debe usarse como fuente de verdad).
