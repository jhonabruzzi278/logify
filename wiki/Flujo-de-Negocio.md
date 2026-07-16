# Flujo de negocio

Ciclo de vida completo de un pedido en Logify, desde la creación hasta la entrega.

---

## Resumen visual

```
[ops] Crea cliente → Crea orden → Confirma orden
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                   inventory-service         shipping-service
                   Descuenta stock          Crea envío TRACK-XXX
                          │                         │
                          └────────────┬────────────┘
                                       │
[ops] Asigna transportista ────────────▼
                                       │
[shipper] Marca EN_REPARTO             │
                                       │
[shipper] Confirma ENTREGADO ──────────▼
           (código SL + RUT)    notification-service
                                Registra evento

[cliente] Rastrea con SL-XXXXXX en /tracking
```

---

## Paso a paso con curl

Casi todos los endpoints requieren JWT. Primero obtener el token:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
```

### 1. Crear cliente

```bash
curl -X POST http://localhost:8080/api/customers \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "María González",
    "phone": "+56912345678",
    "email": "maria@ejemplo.cl",
    "address": "Av. Principal 123, Santiago",
    "rut": "12.345.678-9"
  }'
```

Respuesta:
```json
{
  "id": 1,
  "name": "María González",
  "email": "maria@ejemplo.cl",
  "rut": "12.345.678-9"
}
```

---

### 2. Agregar producto al inventario

```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"sku": "COCA-2L", "stock": 100}'
```

---

### 3. Crear orden

```bash
curl -X POST http://localhost:8080/api/orders \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"customerId": 1, "sku": "COCA-2L", "quantity": 3}'
```

Respuesta:
```json
{
  "orderId": 1,
  "status": "CREATED",
  "sku": "COCA-2L",
  "quantity": 3,
  "customerCode": "SL-AB12CD",
  "message": "Orden creada correctamente"
}
```

> El sistema envía un email a `maria@ejemplo.cl` con el código `SL-AB12CD`.

---

### 4. Confirmar orden (Saga)

```bash
curl -X PUT -H "$AUTH" http://localhost:8080/api/orders/1/confirm
```

En este momento el sistema:

1. Descuenta 3 unidades de `COCA-2L` en inventory-service
2. Crea el envío `TRACK-XXXXXXXX` en shipping-service
3. Cambia el estado de la orden a `EN_PREPARACION`

Respuesta:
```json
{
  "id": 1,
  "status": "EN_PREPARACION",
  "sku": "COCA-2L"
}
```

---

### 5. Asignar transportista

```bash
curl -X PUT -H "$AUTH" "http://localhost:8080/api/orders/1/assign?transporter=transportista"
```

El campo `assigned_to` de la orden se actualiza. Solo las órdenes con ese valor de `assigned_to` aparecen en la vista del transportista — debe coincidir con el `username` real (ver [Usuarios de prueba](Inicio-Rapido.md#usuarios-de-prueba)).

---

### 6. Avanzar etapa del envío

```bash
# El transportista sale a repartir
curl -X PUT -H "$AUTH" "http://localhost:8080/api/shipments/1/stage?stage=EN_REPARTO"
```

El notification-service registra el evento automáticamente.

---

### 7. Confirmar entrega

El transportista llega al domicilio, le pide el código al cliente y lo registra junto con el RUT del receptor:

```bash
curl -X PUT "http://localhost:8080/api/shipments/1/stage?stage=ENTREGADO" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "customerCode": "SL-AB12CD",
    "recipientRut": "12.345.678-9",
    "proofOfDeliveryImage": "data:image/jpeg;base64,/9j/..."
  }'
```

El sistema valida:
- `SL-AB12CD` == `orders.client_code` ✓
- `12.345.678-9` == `customers.rut` ✓

Si ambos coinciden → envío marcado como `ENTREGADO`.

---

### 8. El cliente rastrea su pedido

```bash
curl http://localhost:8080/api/orders/track/SL-AB12CD
```

Respuesta (sin datos de contacto):
```json
{
  "id": 1,
  "sku": "COCA-2L",
  "quantity": 3,
  "status": "EN_PREPARACION",
  "client_code": "SL-AB12CD",
  "customer_name": "María González",
  "created_at": "2026-06-20T14:30:00Z"
}
```

---

### 9. Ver trazabilidad completa

```bash
curl -H "$AUTH" http://localhost:8080/api/notifications/order/1
```

Respuesta:
```json
[
  {"event": "ORDER_CREATED", "timestamp": "..."},
  {"event": "ORDER_CONFIRMED", "timestamp": "..."},
  {"event": "SHIPMENT_EN_REPARTO", "timestamp": "..."},
  {"event": "SHIPMENT_ENTREGADO", "timestamp": "..."}
]
```

---

## Estados de la orden

```
CREATED
   │
   │  PUT /confirm
   ▼
EN_PREPARACION
   │
   │  (shipping actualiza etapa automáticamente)
   ▼
EN_REPARTO
   │
   │  (entrega confirmada)
   ▼
ENTREGADO

(desde CREATED, EN_PREPARACION o EN_REPARTO)
   │  PUT /cancel
   ▼
CANCELADO
```

## Etapas del envío

```
EN_PREPARACION → EN_REPARTO → ENTREGADO
     │                │            │
     └────────────────┴────────────┘
                      │
                   CANCELADO (desde cualquier etapa)
```

---

## Cancelación y compensación

Al cancelar una orden en `EN_PREPARACION` o `EN_REPARTO`:

1. Se restaura el stock: `adjust?delta=+N`
2. Se cancela el envío: `PUT /stage?stage=CANCELADO`
3. La orden pasa a `CANCELADO` con el motivo registrado

```bash
curl -X PUT http://localhost:8080/api/orders/1/cancel \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason": "Cliente solicitó cancelación antes de la entrega"}'
```

---

## Venta en POS (vendor)

El flujo del módulo de punto de venta es independiente del flujo de pedidos:

```bash
# 1. Verificar stock disponible
curl -H "$AUTH" http://localhost:8080/api/inventory/COCA-2L

# 2. Registrar venta (descuenta stock directamente)
curl -X POST http://localhost:8080/api/sales \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"sku": "COCA-2L", "quantity": 2}'
```
