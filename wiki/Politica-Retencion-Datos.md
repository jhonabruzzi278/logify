# Política de Retención y Anonimización de Datos Personales

> ⚠️ **No es asesoría legal.** Este documento es un punto de partida técnico
> y operativo para cumplir con la Ley 19.628 sobre Protección de la Vida
> Privada (Chile). Antes de operar formalmente con clientes reales, hacerlo
> revisar por un abogado — especialmente si se maneja RUT y datos de
> contacto de terceros (no solo de los propios trabajadores).

## 1. Qué datos personales maneja Logify hoy

| Dato | Dónde vive | Servicio | Necesario para |
|------|-----------|----------|-----------------|
| RUT, nombre, email, teléfono, dirección | `customers` | orders-service | Facturación, envíos, fiado (cuenta corriente) |
| RUT, nombre, email, pregunta/respuesta secreta | `users` | orders-service | Autenticación de trabajadores, recuperación de clave |
| Nombre de vendedor | `sales` | inventory-service | Trazabilidad de ventas POS |
| RUT del receptor | `shipments` | shipping-service | Validar entrega |
| Endpoint push (identifica dispositivo) | `push_subscriptions` | notification-service | Notificaciones web push |

Ninguno de estos datos hoy se cifra en reposo más allá del cifrado nativo
del volumen del VPS (si el operador lo configura) — la contraseña de
usuarios sí está hasheada (bcrypt), pero RUT/email/teléfono/dirección están
en texto plano en Postgres.

## 2. Base de legitimación

- **Datos de trabajadores** (tabla `users`): relación laboral/contractual —
  base más sólida, el trabajador sabe que sus datos se usan para operar el
  sistema que él mismo usa.
- **Datos de clientes** (tabla `customers`): relación comercial (son
  contrapartes de una venta B2B/B2C) — requiere, como mínimo, informar en
  algún término de servicio o al momento de registrar al cliente que sus
  datos se usan para facturación y despacho. **Esto no existe todavía en el
  producto** — es el gap más importante a cerrar antes de operar con
  clientes reales.

## 3. Retención

No hay lógica de retención automática implementada hoy — los datos
persisten indefinidamente mientras el registro exista. Recomendación
mínima viable:

| Dato | Retención sugerida | Justificación |
|------|---------------------|----------------|
| Pedidos y movimientos de crédito (`orders`, `customer_credit_movements`) | 6 años | Alineado a plazo de conservación tributaria/contable en Chile (SII) |
| Clientes inactivos (`customers` sin pedidos en N años) | Revisar/anonimizar cada 3 años sin actividad | Minimización de datos |
| `push_subscriptions` de dispositivos que dejaron de responder | Purgar automáticamente al primer fallo de envío | Ya hay lógica de fallo de push (`Push send failed`) — falta conectarla a un borrado |
| Usuarios (`users`) desvinculados | Anonimizar (no borrar duro, por trazabilidad de auditoría en `orders.assigned_to`, etc.) a los 90 días de desvinculación | Evita romper FKs/reportes históricos mientras igual se deja de exponer PII |

## 4. Anonimización vs. borrado duro

Dado que `orders`, `sales`, `shipments` referencian nombres/RUTs por texto
libre (no hay tablas de auditoría separadas), un **borrado duro** de un
cliente rompería el historial de pedidos pasados. La recomendación es
**anonimizar, no borrar**:

```sql
-- Ejemplo conceptual (no ejecutar sin revisar impacto en RLS/reportes):
UPDATE customers
SET name = 'Cliente eliminado', phone = NULL, address = NULL,
    email = NULL, rut = NULL
WHERE id = $1 AND tenant_id = $2;
```

Esto preserva la integridad referencial de `orders.customer_id` y los
reportes de ventas, sin conservar PII identificable.

**Estado actual: no implementado.** No existe un endpoint
`DELETE`/`anonymize` para clientes ni para usuarios desvinculados. Es
trabajo pendiente, no solo documentación.

## 5. Derechos ARCO (Acceso, Rectificación, Cancelación, Oposición)

La Ley 19.628 reconoce estos derechos al titular de los datos. Estado
actual del producto:

- **Acceso:** parcial — un cliente no tiene un endpoint propio para ver
  qué datos tiene Logify sobre él; solo el operador (vía UI) puede verlo.
- **Rectificación:** existe indirectamente (el operador puede editar el
  cliente desde `customers-page.tsx`), pero no hay un flujo donde el
  cliente lo solicite directamente.
- **Cancelación:** no implementado (ver sección 4).
- **Oposición:** no aplica actualmente porque no hay uso secundario de
  datos (marketing, perfilado) — si se agrega en el futuro, debe ir con
  opt-out explícito.

## 6. Recomendación de implementación (próximos pasos técnicos)

Priorizado por impacto/costo, no exhaustivo:

1. Agregar aviso de privacidad básico en el flujo de alta de cliente
   (frontend) — texto simple, no requiere diseño legal complejo para un
   MVP.
2. Implementar el endpoint de anonimización de cliente (sección 4) en
   `orders-service`, protegido por rol `owner`.
3. Job periódico (cron, ej. `pg_cron` ya usado en el proyecto para otras
   tareas) que anonimice clientes sin actividad en 3+ años.
4. Purgar `push_subscriptions` inactivas automáticamente cuando
   `Push send failed` ocurre repetidamente (ya hay logging del fallo, ver
   [Backend/notification-service/src/index.js:69](../Backend/notification-service/src/index.js)) —
   falta el borrado en sí.
5. Documentar esta política en un lugar visible para el cliente final
   (footer del frontend o landing), no solo en `wiki/`.

## 7. Revisión

Este documento debe revisarse cada vez que se agregue una tabla nueva con
datos de contacto de terceros, o antes de cualquier conversación formal
con inversionistas/clientes piloto que pregunten por compliance (ver
[aidlc-docs/requirements/STAKEHOLDERS.md](../aidlc-docs/requirements/STAKEHOLDERS.md),
sección de riesgos conocidos).
