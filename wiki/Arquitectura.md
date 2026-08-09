# Arquitectura del sistema

## Diagrama de componentes

```
┌────────────────────────────────────────────────────────┐
│   Frontend   React 18 + TypeScript + Vite       :3000  │
└───────────────────────┬────────────────────────────────┘
                        │  /api/*  →  proxy Vite en dev
                        │  /api/*  →  api.logify.cl en prod
┌───────────────────────▼────────────────────────────────┐
│   API Gateway / BFF   Nginx Alpine              :8080   │
└──────┬────────────┬──────────────┬─────────────────────┘
       │            │              │            │
  ┌────▼───┐  ┌─────▼────┐  ┌─────▼────┐  ┌───▼──────────┐
  │ orders │  │inventory │  │ shipping │  │notification  │
  │  :8081 │  │  :8082   │  │  :8084   │  │   :8085      │
  └────┬───┘  └─────┬────┘  └─────┬────┘  └───▼──────────┘
       │            │              │            │
  ┌────▼────────────▼──────────────▼────────────▼─────────┐
  │            PostgreSQL 15  (4 bases separadas)          │
  │  orders_db   inventory_db   shipping_db  notif_db      │
  └────────────────────────────────────────────────────────┘
```

---

## Servicios

### orders-service (`:8081`)

Núcleo del sistema. Gestiona el ciclo de vida de las órdenes y actúa como **orquestador del patrón Saga**.

- CRUD de pedidos y clientes
- Genera el código `SL-XXXXXX` al crear una orden
- Al confirmar: llama a inventory + shipping (Saga)
- Al cancelar: revierte stock + cancela envío
- Aplica **RLS por rol**: oculta `client_code` para shipper/customer/vendor
- Endpoint de tracking público sin autenticación

### inventory-service (`:8082`)

Control de stock y ventas (módulo POS).

- CRUD de productos por SKU
- Ajuste de stock via stored procedure (`fn_adjust_stock`)
- Registro de ventas en caja
- Reporte clasificado por nivel de stock

### shipping-service (`:8084`)

Gestiona el despacho y la entrega física.

- Crea envíos con número `TRACK-XXXXXXXX`
- Controla etapas: EN_PREPARACION → EN_REPARTO → ENTREGADO
- Valida la entrega cruzando **código SL + RUT del receptor** contra orders-service
- Genera QR por envío
- Notifica cambios de etapa al notification-service

### notification-service (`:8085`)

Trazabilidad y auditoría de eventos.

- Persiste cada cambio de etapa
- Permite consultar el historial completo de una orden
- Soporte de audiencias (cliente, operaciones, transportista)
- Web Push segmentado por tenant mediante VAPID

### Nginx BFF (`:8080`)

Punto único de entrada. Hace reverse proxy a cada microservicio según el prefijo de la ruta:

```nginx
/api/orders      → orders-service:8081
/api/customers   → orders-service:8081
/api/inventory   → inventory-service:8082
/api/sales       → inventory-service:8082
/api/shipments   → shipping-service:8084
/api/notifications → notification-service:8085
/healthz         → responde 200 OK
```

---

## Comunicación entre servicios

La comunicación es **síncrona via REST HTTP** usando el helper `interServiceFetch()` del shared module. No hay message broker; el patrón Saga está implementado directamente en el orders-service.

### Flujo Saga — confirmar orden

```
orders-service
  │
  ├─[1]─► POST inventory-service/api/inventory/:sku/adjust?delta=-N
  │              └─ Descuenta stock
  │
  ├─[2]─► POST shipping-service/api/shipments
  │              └─ Crea envío
  │
  └─[3]─► UPDATE orders SET status='EN_PREPARACION'
```

Si inventario falla, la orden permanece en `CREATED`. Si shipping falla después
de descontar stock, orders-service intenta compensarlo automáticamente; solo
si también falla la compensación se devuelve una advertencia de revisión manual.

### Flujo de entrega validada

```
shipping-service  PUT /stage?stage=ENTREGADO
  │
  ├─► GET orders-service/api/orders/:orderId
  │     └─ Verifica client_code == customerCode (body)
  │
  ├─► GET orders-service/api/customers/:customerId
  │     └─ Verifica rut == recipientRut (body)
  │
  └─► UPDATE shipments SET stage='ENTREGADO'
        + guarda proofOfDeliveryImage, recipientRut, customerCode
```

---

## Base de datos

Cada servicio tiene su propia base de datos PostgreSQL — sin acceso cruzado a nivel de BD. La comunicación entre servicios es siempre via API REST.

| BD | Tablas principales |
|----|-------------------|
| orders_db | orders, customers |
| inventory_db | inventory, sales |
| shipping_db | shipments |
| notification_db | notifications |

Las tablas se crean al arrancar (`ensureTables`) con `CREATE TABLE IF NOT EXISTS`. Las columnas nuevas se añaden con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

---

## Shared Modules

```
Backend/shared/
├── app.js        Factory de Express + interServiceFetch
├── db.js         Pool PostgreSQL con reintentos
├── logger.js     Logging estructurado
├── validate.js   Validadores de entrada
├── security.js   Helmet, CORS, rate limiting
└── email.js      Nodemailer + plantilla HTML de confirmación
```

Todos los servicios montan `Backend/shared/` como volumen en Docker y lo importan con rutas relativas.

---

## Despliegue

| Entorno | Frontend | Backend |
|---------|----------|---------|
| Desarrollo | `npm run dev` (:3000) | `docker compose up` (:8080) |
| Producción | Vercel (auto-deploy desde `main`) | Docker Compose en servidor |
