# Pruebas

Logify incluye pruebas unitarias en cada microservicio, en el frontend, pruebas E2E de regresión visual (Playwright) y pruebas de carga (k6). Estado medido el 2026-08-08: **548 pruebas unitarias/integración + 15 E2E**. Las 548 pasan al ejecutar cada suite de forma aislada, igual que en CI.

---

## Backend — microservicios

Cada servicio usa **Jest** como framework de pruebas y **Supertest** para pruebas de endpoints HTTP. La configuración de Jest vive en el `package.json` de cada servicio.

### Ejecutar pruebas

```bash
# Un servicio específico
cd Backend/orders-service && npm test
cd Backend/inventory-service && npm test
cd Backend/shipping-service && npm test
cd Backend/notification-service && npm test

# npm test ya incluye cobertura (jest --coverage); genera coverage/index.html
```

### Estructura de las pruebas

Cada servicio tiene una suite única junto a su código:

```
orders-service/src/*.test.js             187 pruebas (5 suites)
inventory-service/src/index.test.js      122 pruebas
shipping-service/src/index.test.js        59 pruebas
notification-service/src/index.test.js    67 pruebas
```

### Qué se prueba

| Área | Casos cubiertos |
|------|----------------|
| Órdenes | Crear, listar, confirmar, cancelar, asignar, eliminar |
| Clientes | CRUD completo, validación de RUT |
| Tracking | Código válido, código inexistente, formato incorrecto |
| RLS | `client_code` ausente para shipper/customer/vendor, presente para owner/ops |
| Inventario | CRUD, ajuste de stock, stock negativo |
| Cuenta corriente | Cargo/abono con locking atómico, rechazo por límite de crédito, historial |
| POS / Ventas | Venta simple y multi-item, fiado con customerId, costo guardado por venta (ganancia real), líneas manuales (`isManualAmount`) sin descuento de stock |
| Compras a proveedor | Sube stock, actualiza costo solo si `updatePrices`, rollback si el SKU no existe |
| Sesiones de caja | Apertura (rechaza doble apertura), cierre con cálculo de diferencia, historial |
| Envíos | Crear, cambiar etapa, validación ENTREGADO/código de cliente/RUT, QR de imagen, clima y ruta (OSRM + geocoding del cliente) |
| Notificaciones | Persistir evento, idempotencia (409 DUPLICATE), consultar por orden y audiencia, alertas de stock/clima, PDF de historial, push subscribe/unsubscribe |
| Auth | Login (tenant inactivo, credenciales inválidas), registro, CRUD de usuarios |
| Integraciones externas | Indicadores económicos (con cache de 1h), geocode, búsqueda de imágenes, PDF de reportes/pedidos, QR de producto |

### Ejemplo de prueba con Supertest

```javascript
describe('RLS — client_code', () => {
  it('owner recibe client_code en el response', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('client_code');
  });

  it('shipper NO recibe client_code en el response', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${shipperToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty('client_code');
  });
});
```

---

## Frontend

Usa **Vitest** como runner y **React Testing Library** para pruebas de componentes. La configuración vive en `vite.config.ts` (bloque `test`).

### Ejecutar pruebas

```bash
cd Frontend
npm test                 # Una pasada (vitest run)
npm run test:watch       # Modo watch
npm run test:coverage    # Reporte de cobertura en coverage/index.html
```

### Qué se prueba

| Área | Casos cubiertos |
|------|----------------|
| Hooks | useApiQuery, useBusinessMode, usePosCart (líneas manuales, cartId único) |
| Adaptadores | api-adapters (snake_case → camelCase, incluye Purchase/CashSession/CustomerCredit) |
| Utilidades | cn(), formatDate(), formatCurrency() |
| RBAC | isPathAllowedForRole, hasPermission, getDefaultPathForRole, filtro por modo B2B/B2C |
| Componentes POS | close-register-modal, open-register-modal, price-check-modal, extras-modal, add-amount-modal |

---

## Resultados actuales

Última ejecución completa (todas las suites en verde):

| Componente | Pruebas | Cobertura (statements) |
|-----------|--------:|----------------------:|
| orders-service | 187 | 82,23 % |
| inventory-service | 122 | 92,84 % |
| shipping-service | 59 | 93,44 % |
| notification-service | 67 | 94,11 % |
| Frontend (Vitest) | 113 | ver reporte generado por CI |
| **Total unitarias/integración** | **548** | — |
| Frontend E2E (Playwright) | 15 | — (regresión visual + flujos críticos) |

> Meta del equipo: 80% en backend. Alcanzada en los 4 servicios. Lo que queda
> sin cubrir intencionalmente son las funciones de migración/DDL
> (`ensureTables`, `ensureTenants`, etc.) — se prueban mejor contra una base
> real (integración) que con un pool mockeado; y algunas ramas de manejo de
> errores de bajo impacto. No hay `coverageThreshold` configurado en Jest;
> convertir la meta en un gate de CI es parte de las mejoras propuestas.

> Nota de ejecución local: correr las cuatro suites backend con cobertura al
> mismo tiempo puede agotar CPU y hacer que pruebas PDF superen su timeout de
> 5 segundos. Ejecutadas secuencialmente el 2026-08-08 pasaron 435/435.

---

## E2E y regresión visual (Playwright)

El frontend tiene una suite de Playwright en `Frontend/e2e/` que cubre los
flujos críticos y captura screenshots en varios breakpoints para detectar
regresiones visuales.

### Ejecutar

```bash
cd Frontend
npx playwright install chromium   # una sola vez
npm run test:e2e                  # corre toda la suite (headless)
npm run test:e2e:ui               # modo interactivo (UI mode)
npm run test:e2e:update-snapshots # regenerar las capturas base tras un cambio de diseño intencional
npm run test:e2e:report           # abre el reporte HTML de la última corrida
```

Requiere que el frontend ya esté corriendo (`npm run dev`, ver
`.claude/launch.json`); `PLAYWRIGHT_BASE_URL` permite apuntar a otro puerto/host.

### Qué cubre

| Spec | Cubre |
|------|-------|
| `login.spec.ts` | Formulario, estructura del SVG animado, error de credenciales, login exitoso, visual en 4 breakpoints |
| `dashboard.spec.ts` | Métricas/acciones visibles, contador animado se asienta en un valor con formato de moneda, sin overflow horizontal en mobile |
| `reports.spec.ts` | El gráfico de barras no queda congelado en altura mínima (regresión de un bug real encontrado durante desarrollo), cambio de pestaña, visual en 3 breakpoints |
| `tracking.spec.ts` | Buscador visible, visual en 3 breakpoints |

Autenticación por rol vía `storageState` (`e2e/auth.setup.ts` para admin,
`e2e/auth-cliente.setup.ts` para el rol `customer`, el único con acceso a
`/tracking`) — no repite el login en cada test. Las credenciales usadas son
las de seed documentadas más abajo, no secretos reales.

---

## Pruebas de carga (k6)

Scripts en `Backend/load-tests/` contra el API gateway (`:8080`). **Solo
correr contra docker-compose local o un ambiente de staging desechable** —
el escenario de carga crea pedidos reales en la base de datos.

### Instalar k6

```powershell
winget install GrafanaLabs.k6
```

### Ejecutar

```bash
cd Backend/load-tests

# Smoke test: 1 usuario, 5 iteraciones — corre esto primero siempre
k6 run smoke.js

# Carga sostenida: rampa hasta VUS_MAX (default 30), ~3 minutos
k6 run load.js
k6 run --env VUS_MAX=100 load.js   # mas usuarios concurrentes
```

| Script | Qué hace |
|--------|----------|
| `smoke.js` | 1 VU, valida que login + lecturas básicas (orders/inventory/shipments) respondan 200 antes de correr algo pesado |
| `load.js` | Rampa de VUs (30s→1m→1m→30s enfriamiento), 80% lecturas / 20% flujo completo (crear + confirmar pedido). Thresholds: p95<800ms, p99<1500ms, error rate<1% |

---

## Colección Postman

En la carpeta `ENTREGABLE/` se incluye la colección Postman con todos los endpoints:

```
ENTREGABLE/
├── Logify-Postman-Collection.json
└── newman-report/
```

### Importar en Postman

1. Abrir Postman
2. `Import` → seleccionar `Logify-Postman-Collection.json`
3. Configurar la variable de entorno `baseUrl = http://localhost:8080`
4. Ejecutar los requests en orden

### Ejecutar con Newman (CLI)

```bash
npm install -g newman
newman run ENTREGABLE/Logify-Postman-Collection.json \
  --env-var "baseUrl=http://localhost:8080" \
  --reporters cli,html \
  --reporter-html-export ENTREGABLE/newman-report/report.html
```

---

## Verificación manual rápida

Para verificar que el sistema completo funciona después de levantar Docker. Casi todos los endpoints requieren JWT, así que primero hay que autenticarse:

```bash
# 1. Health check (sin auth)
curl http://localhost:8080/healthz

# 2. Login → guardar el token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

# 3. Crear cliente y orden
curl -X POST http://localhost:8080/api/customers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.cl","rut":"11.111.111-1"}'

curl -X POST http://localhost:8080/api/orders \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"customerId":1,"sku":"TEST-SKU","quantity":1}'

# 4. Confirmar la orden
curl -X PUT -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/orders/1/confirm

# 5. Verificar tracking (público, usa el customerCode del paso 3)
curl http://localhost:8080/api/orders/track/SL-XXXXXX
```
