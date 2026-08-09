# Test Strategy

> **Actualización 2026-08-09:** existen 558 pruebas registradas (435 backend
> y 123 Frontend), además de 15 E2E Playwright. Las secciones con 226 pruebas
> describen la medición histórica del 2026-07-19. CI ejecuta actualmente las
> suites, typecheck y builds antes de integrar a `main`.

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

- Hay 19 archivos de test frontend que cubren cliente/adaptadores API, hooks,
  RBAC y navegación, componentes POS, administración de usuarios, portal
  central y calendario. La cobertura de páginas completas sigue siendo menor
  que la de utilidades y componentes aislados.

## Gaps Identificados (⚠️ genuinos, no inventados — basados en conteo de archivos)

1. **Cobertura parcial de páginas completas en Frontend** — ya existen tests de componentes y páginas críticas, pero no todas las 20+ vistas tienen una prueba de interacción completa por rol.
2. **Sin tests para integraciones externas añadidas al final del desarrollo** — confirmado explícitamente en `wiki/Pruebas.md`: "la brecha actual se concentra en las integraciones externas agregadas al final (push, indicadores, QR/PDF), que se verificaron end-to-end pero aún no tienen pruebas unitarias dedicadas."
3. **Saga cubierta a nivel HTTP mockeado, no con servicios reales** — existen tests de compensación cuando shipping falla y de fallo de la propia compensación, pero falta una prueba integrada con las bases y servicios reales.
4. **No hay `coverageThreshold` configurado en Jest** — confirmado explícitamente en `wiki/Pruebas.md`: nada bloquea un commit o build que reduzca la cobertura por debajo de la meta interna de 60%.
5. ~~**Sin CI que ejecute estos tests automáticamente.**~~ Resuelto: GitHub Actions ejecuta las suites y builds; los seis checks principales son obligatorios para `main`.

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
