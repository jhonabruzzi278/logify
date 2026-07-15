# Pruebas

SmartLogix incluye pruebas unitarias en cada microservicio y en el frontend. Estado actual: **212 pruebas, todas en verde**.

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
orders-service/src/index.test.js         60 pruebas
inventory-service/src/index.test.js      45 pruebas
shipping-service/src/index.test.js       28 pruebas
notification-service/src/index.test.js   26 pruebas
```

### Qué se prueba

| Área | Casos cubiertos |
|------|----------------|
| Órdenes | Crear, listar, confirmar, cancelar, asignar, eliminar |
| Clientes | CRUD completo, validación de RUT |
| Tracking | Código válido, código inexistente, formato incorrecto |
| RLS | `client_code` ausente para shipper/customer/vendor, presente para owner/ops |
| Inventario | CRUD, ajuste de stock, stock negativo |
| Envíos | Crear, cambiar etapa, validación ENTREGADO |
| Notificaciones | Persistir evento, idempotencia (409 DUPLICATE), consultar por orden y audiencia |

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
| Hooks | useApiQuery, useCustomerScope, usePermissions |
| Adaptadores | api-adapters (snake_case → camelCase) |
| Utilidades | cn(), formatDate(), formatCurrency() |
| RBAC | isPathAllowedForRole, hasPermission, getDefaultPathForRole |
| Componentes | StatusBadge, MetricCard, EmptyState |

---

## Resultados actuales

Última ejecución completa (todas las suites en verde):

| Componente | Pruebas | Cobertura (statements) |
|-----------|--------:|----------------------:|
| orders-service | 60 | 46,4 % |
| inventory-service | 45 | 36,6 % |
| shipping-service | 28 | 46,3 % |
| notification-service | 26 | 29,9 % |
| Frontend | 53 | 77,4 % |
| **Total** | **212** | — |

> La meta del equipo es 60% en backend. La brecha actual se concentra en las
> integraciones externas agregadas al final (push, indicadores, QR/PDF), que se
> verificaron end-to-end pero aún no tienen pruebas unitarias dedicadas. No hay
> `coverageThreshold` configurado en Jest; convertir la meta en un gate de CI es
> parte de las mejoras propuestas.

---

## Colección Postman

En la carpeta `ENTREGABLE/` se incluye la colección Postman con todos los endpoints:

```
ENTREGABLE/
├── SmartLogix-Postman-Collection.json
└── newman-report/
```

### Importar en Postman

1. Abrir Postman
2. `Import` → seleccionar `SmartLogix-Postman-Collection.json`
3. Configurar la variable de entorno `baseUrl = http://localhost:8080`
4. Ejecutar los requests en orden

### Ejecutar con Newman (CLI)

```bash
npm install -g newman
newman run ENTREGABLE/SmartLogix-Postman-Collection.json \
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
