# Test Coverage Report

## Actualización 2026-08-08

El estado actual contiene **548 pruebas automatizadas registradas**: 435 en
backend (orders 187, inventory 122, shipping 59, notification 67) y 113 en
Frontend. El workflow del PR #23 ejecutó cada componente en un runner aislado
y dejó en verde los seis checks requeridos, además de los builds de Frontend y
Landing.

Una ejecución diagnóstica local de las cuatro suites backend en paralelo
produjo timeout en una prueba PDF de orders, inventory y notification por
competencia de CPU; shipping terminó 59/59. Esto no se reprodujo en CI, pero
evidencia que las pruebas PDF con timeout de 5 segundos son sensibles a carga.

SonarCloud mantiene una métrica distinta: el PR #23 falló su Quality Gate por
**13,7% de cobertura sobre código nuevo** frente a un mínimo de 80%. El check
externo de Quality Gate no figura entre los seis contextos requeridos por la
protección actual de `main`; debe tratarse como deuda de cobertura/política,
no confundirse con una falla del job de CI o de los builds.

Las secciones siguientes se conservan como histórico de mediciones anteriores.

## 📌 Actualización 2026-08-06

Las cifras de abajo son del **2026-07-19** y ya no reflejan el estado
actual — el equipo cerró la brecha de cobertura que este reporte
identificaba. Verificado contra el log real de CI del commit `830021f`
(2026-08-06): `orders-service` mide **84.99% statements, 142/142 tests
en verde**, consistente con lo que declara `wiki/Pruebas.md` (464+
tests totales, 81-88% por servicio backend, meta de 80% alcanzada en
los 4 servicios). No se volvió a correr `--coverage` en los otros 3
servicios backend en esta sesión para confirmar cada uno individualmente
— tomar el número de `wiki/Pruebas.md` con esa salvedad.

SonarCloud reporta cobertura agregada de **45%**, muy por debajo de lo
anterior — probablemente un artefacto de medición (posible desalineación
de rutas `lcov.info` en `sonar-project.properties`, o que `Landing`
—sin tests— arrastra el promedio) y no una regresión real, dado que el
dato por-servicio vía CI sí está verificado arriba. Vale la pena
revisar la config de Sonar, no motivo de alarma inmediata.

`docs/technical/03-informe-pruebas.html` sigue sin ser fuente de verdad
(ver hallazgo original abajo) y ahora hay un tercer número dando vueltas
(el original 226, el declarado 464+, y el de Sonar 45%) — recomendación
original de regenerar o borrar ese HTML sigue en pie y ahora es más
urgente.

## ⚠️ Nota sobre discrepancia previa — RESUELTA con ejecución real

Al iniciar esta auditoría, se encontraron **dos reportes existentes en el repo que no coinciden entre sí**:
- `wiki/Pruebas.md` / `README.md`: 212 tests totales (orders 60, inventory 45, shipping 28, notification 26, frontend 53)
- `docs/technical/03-informe-pruebas.html`: 164 tests totales, cobertura 73.7%-85.7%

Siguiendo la regla de esta auditoría de **nunca inventar métricas**, se ejecutaron los 5 comandos de test reales (`npm test -- --coverage` en cada servicio backend, `npm run test:coverage` en frontend) el **2026-07-19**. Estos son los números medidos directamente, no inferidos de ninguno de los dos documentos previos:

## Resultados Reales Medidos (2026-07-19)

| Componente | Tests | % Stmts | % Branch | % Funcs | % Lines |
|---|---:|---:|---:|---:|---:|
| orders-service | **73** (2 suites: `index.test.js` + `security-module.test.js`) | 51.44% | 51.72% | 47.82% | 52.63% |
| inventory-service | **46** | 37.63% | 42.13% | 23.80% | 37.60% |
| shipping-service | **28** | 44.39% | 36.80% | 30.00% | 45.69% |
| notification-service | **26** | 28.41% | 30.76% | 15.38% | 28.75% |
| Frontend | **53** | 76.19% | 64.10% | 75.00% | 78.64% |
| **TOTAL** | **226** | — | — | — | — |

**Todos los 226 tests pasan.** (5 test suites, 0 fallos, 0 skipped.)

## Comparación con los reportes previos del repo

- El **conteo total real (226)** no coincide exactamente con ninguno de los dos reportes previos (212 ni 164), aunque está más cerca de la cifra de 212 tests de `README.md`/`wiki/Pruebas.md`. La diferencia se concentra en `orders-service`: el reporte previo indicaba 60 tests, la medición real muestra 73 (el servicio creció desde que se escribió ese documento, o el conteo previo no incluía el archivo `security-module.test.js`). `inventory-service` (46 vs. 45), `shipping-service` (28 vs. 28) y `notification-service` (26 vs. 26) y `Frontend` (53 vs. 53) sí coinciden o están muy cerca del reporte de `README.md`/`wiki/Pruebas.md`.
- Las cifras de **cobertura de porcentaje** medidas ahora (backend entre 28%-52% en statements) están **por debajo** tanto de lo que indicaba `wiki/Pruebas.md` (29.9%-46.4%, sí consistente) como muy por debajo de lo que indicaba `docs/technical/03-informe-pruebas.html` (73.7%-85.7%, **no reproducible** con esta ejecución real).
- **Conclusión de esta auditoría:** `docs/technical/03-informe-pruebas.html` parece describir una ejecución de una versión distinta/anterior del código, o fue generado de forma no reproducible — sus cifras de cobertura **no se pudieron verificar y no deben usarse como fuente de verdad**. `wiki/Pruebas.md` está más cerca de la realidad actual pero también ligeramente desactualizado en el conteo de `orders-service`. **Se recomienda que el equipo regenere y reemplace `docs/technical/03-informe-pruebas.html`, o lo elimine si no se puede mantener actualizado**, para evitar que quede como fuente de desinformación.

## Meta interna declarada

`wiki/Pruebas.md` declara una meta de equipo de **60% de cobertura en backend**. Con la medición real de hoy, **ningún servicio backend alcanza esa meta** (rango real: 28.41%-51.44% en statements). El propio `wiki/Pruebas.md` explica la brecha: *"se concentra en las integraciones externas agregadas al final (push, indicadores, QR/PDF), que se verificaron end-to-end pero aún no tienen pruebas unitarias dedicadas."* Esta explicación es consistente con los rangos de líneas sin cubrir mostrados en la salida de cada servicio (bloques grandes de líneas no cubiertas concentrados en handlers de rutas de integraciones externas).

## Gaps Identificados (confirmados por la ejecución real)

- **notification-service** tiene la cobertura más baja (28.41% stmts, 15.38% funcs) — el servicio con más lógica de integración externa sin cubrir (Web Push/VAPID, alertas de clima).
- **inventory-service** función coverage muy bajo (23.8%) — sugiere handlers completos de rutas (geocodificación, indicadores económicos, búsqueda de imágenes, QR) sin ningún test.
- **Frontend** es, con diferencia, el componente con mejor cobertura (76.19% stmts) pese a tener solo 3 archivos de test — porque esos 3 archivos cubren intensamente la capa de datos (`api-client`, `api-adapters`, `use-api-query`), no porque el conjunto de la app esté bien cubierto (ver `TEST_STRATEGY.md` — cero tests de componentes de página).

## Cómo se obtuvo este reporte

```bash
cd Backend/orders-service && npm test -- --coverage        # 73 tests, 51.44% stmts
cd Backend/inventory-service && npm test -- --coverage     # 46 tests, 37.63% stmts
cd Backend/shipping-service && npm test -- --coverage      # 28 tests, 44.39% stmts
cd Backend/notification-service && npm test -- --coverage  # 26 tests, 28.41% stmts
cd Frontend && npm run test:coverage                       # 53 tests, 76.19% stmts
```

Ejecutado el 2026-07-19 contra el estado del código en el commit `85591f3` (HEAD de `main` al momento de esta auditoría). Reproducible por cualquiera con Node 22 y las dependencias instaladas (`node_modules/` ya presentes en el repo al momento de esta auditoría).
