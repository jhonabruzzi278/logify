# Código de cliente (SL-XXXXXX)

El código de cliente es el mecanismo central de verificación de identidad en Logify. Permite al cliente rastrear su pedido y al transportista confirmar que entregó al destinatario correcto.

---

## ¿Qué es?

Un identificador único con el formato `SL-` seguido de 6 caracteres alfanuméricos en mayúscula:

```
SL-AB12CD
SL-HU5MQ2
SL-X9KPLR
```

Se genera automáticamente cuando se crea una orden y es **el único dato que el cliente necesita** para:

1. Rastrear su pedido en `/tracking`
2. Probar ante el transportista que es el destinatario correcto

---

## Ciclo de vida

```
1. ops crea la orden
        │
        ▼
2. Sistema genera SL-XXXXXX y lo guarda en orders.client_code
        │
        ▼
3. Se envía por email al cliente (asunto: "Confirmación de pedido #N")
        │
        ├── Cliente guarda el código para rastrear su pedido
        │
        ▼
4. Transportista recibe el pedido en bodega (sin ver el código)
        │
        ▼
5. Transportista lleva el pedido a la dirección del cliente
        │
        ▼
6. Al entregar, el transportista pide el código al cliente en persona
        │
        ▼
7. Transportista ingresa código + RUT del receptor en la app
        │
        ▼
8. Sistema valida y marca como ENTREGADO
```

---

## Por qué el transportista no ve el código

Esta es una decisión de **seguridad intencional**:

- Si el transportista tuviera el código, podría marcar la entrega como completada sin haberla hecho
- Al pedirle el código al cliente en persona, se prueba que hubo contacto físico
- Combinado con el RUT del receptor, se garantiza que la entrega fue hecha a la persona correcta

### Capas de protección

| Capa | Mecanismo |
|------|-----------|
| Servidor (primaria) | `orders-service` extrae el rol del JWT; elimina `client_code` del response para shipper/customer/vendor |
| Servidor (tracking público) | `GET /api/orders/track/:clientCode` devuelve solo campos seguros — sin email ni teléfono |
| Frontend (secundaria) | La página de detalle de envío no renderiza el bloque del código si `role === "shipper"` |

Incluso si el frontend fuera modificado, el servidor nunca devolvería el código al transportista.

---

## Rastreo por el cliente

El cliente accede a `/tracking` (página pública, sin login) e ingresa su código:

```
https://logify-five.vercel.app/tracking
```

La página solo acepta códigos que empiecen con `SL-`. Si el código es válido, muestra:

- Estado actual del pedido
- SKU y cantidad
- Fecha de creación
- Historial de notificaciones

El endpoint de tracking no devuelve email ni teléfono del cliente, aunque esté en la base de datos.

---

## Validación en la entrega

Cuando el transportista intenta marcar `ENTREGADO`, el cuerpo del request debe incluir:

```json
{
  "customerCode": "SL-AB12CD",
  "recipientRut": "12.345.678-9",
  "proofOfDeliveryImage": "data:image/jpeg;base64,..."
}
```

El `shipping-service` verifica con el `orders-service`:

1. `customerCode` == `orders.client_code` de esa orden
2. `recipientRut` == `customers.rut` del cliente de esa orden

Si cualquier validación falla → `400 Bad Request`, la etapa no cambia.

---

## Generación técnica

```javascript
// orders-service/src/index.js
const clientCode = 'SL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
```

La unicidad está garantizada por una restricción `UNIQUE` en la columna `orders.client_code`. En el improbable caso de colisión, PostgreSQL rechaza el insert y Express devuelve un error 500 que el frontend presenta al usuario.
