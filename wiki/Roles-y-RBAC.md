# Roles y Control de Acceso (RBAC)

Logify implementa control de acceso basado en roles (Role-Based Access Control) en dos niveles: **servidor** (JWT) y **cliente** (router guards + renderizado condicional).

---

## Los 7 roles

### `owner` — Administrador

Control total del sistema. Accede a todas las páginas y puede ejecutar cualquier acción.

**Página inicial:** `/dashboard`  
**Puede hacer:** gestionar usuarios, ver reportes completos, confirmar/cancelar cualquier pedido, ajustar inventario, revisar trazabilidad completa.

---

### `ops` — Operaciones

Gestiona el flujo diario de pedidos y coordina el despacho.

**Página inicial:** `/orders`  
**Puede hacer:** crear pedidos, confirmarlos, asignar transportistas, revisar stock, monitorear envíos.

---

### `warehouse` — Bodega

Controla el inventario y confirma disponibilidad de stock.

**Página inicial:** `/inventory`  
**Puede hacer:** ajustar stock, revisar pedidos pendientes, responder a alertas de quiebre.

---

### `shipper` — Transportista

Gestiona las entregas asignadas a su usuario.

**Página inicial:** `/deliveries`  
**Puede hacer:** ver sus envíos asignados, cambiar etapas de reparto, confirmar entregas con código del cliente + RUT.  
**No puede ver:** código `SL-XXXXXX` del cliente (protegido en servidor y frontend).

---

### `vendor` — Vendedor

Opera el punto de venta (POS) y consulta stock disponible.

**Página inicial:** `/pos`  
**Puede hacer:** registrar ventas en caja, consultar disponibilidad de productos por SKU.

---

### `support` — Soporte

Monitorea la operación y revisa trazabilidad sin ejecutar cambios de negocio.

**Página inicial:** `/alerts`  
**Puede hacer:** ver pedidos, envíos, alertas y trazabilidad completa. No puede crear ni modificar.

---

### `customer` — Cliente

Consulta el estado de su propio pedido con su código personal.

**Página inicial:** `/tracking`  
**Puede hacer:** ingresar su código `SL-XXXXXX` y ver el estado de su pedido.  
**No puede ver:** información de otros clientes, datos internos de la operación.

---

## Tabla de permisos

| Permiso | owner | ops | warehouse | shipper | vendor | support | customer |
|---------|:-----:|:---:|:---------:|:-------:|:------:|:-------:|:--------:|
| `dashboard.view` | ✓ | ✓ | ✓ | — | ✓ | ✓ | — |
| `orders.view` | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `orders.create` | ✓ | ✓ | — | — | — | — | — |
| `orders.review` | ✓ | ✓ | ✓ | — | — | — | — |
| `inventory.view` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `inventory.adjust` | ✓ | — | ✓ | — | — | — | — |
| `shipments.view` | ✓ | ✓ | — | ✓ | — | ✓ | ✓ |
| `shipments.dispatch` | ✓ | ✓ | — | — | — | — | — |
| `shipments.update` | ✓ | ✓ | — | ✓ | — | — | — |
| `alerts.view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| `users.view` | ✓ | — | — | — | — | — | — |
| `users.manage` | ✓ | — | — | — | — | — | — |
| `sales.create` | ✓ | — | — | — | ✓ | — | — |
| `sales.view` | ✓ | ✓ | — | — | ✓ | — | — |

---

## Rutas por rol

| Rol | Rutas permitidas |
|-----|-----------------|
| `owner` | `/dashboard`, `/inventory`, `/orders`, `/customers`, `/shipments`, `/deliveries`, `/alerts`, `/users`, + comunes |
| `ops` | `/dashboard`, `/inventory`, `/orders`, `/customers`, `/shipments`, `/deliveries`, `/alerts`, + comunes |
| `warehouse` | `/dashboard`, `/inventory`, `/orders`, `/customers`, `/alerts`, + comunes |
| `shipper` | `/deliveries`, `/shipments`, `/alerts`, + comunes |
| `vendor` | `/dashboard`, `/inventory`, `/pos`, + comunes |
| `support` | `/dashboard`, `/orders`, `/customers`, `/shipments`, `/alerts`, + comunes |
| `customer` | `/orders`, `/shipments`, `/tracking`, `/profile`, `/notifications` |

> **Rutas comunes:** `/access-denied`, `/profile`, `/notifications`, `/calendar`, `/reports`, `/pos`

Si un usuario intenta acceder a una ruta no permitida, el router lo redirige automáticamente a su ruta por defecto.

---

## Implementación técnica

### Frontend — Definición de roles

Los perfiles de rol están centralizados en [`Frontend/src/app/access.ts`](../Frontend/src/app/access.ts):

```typescript
export const roleProfiles: Record<Role, RoleAccessProfile> = {
  owner: {
    defaultPath: "/dashboard",
    paths: [...],
    permissions: [...]
  },
  // ...
}
```

### Frontend — Router guard

En `app/auth.tsx` (con la lógica de rutas en `app/access.ts`), antes de renderizar cualquier página se verifica si el rol del usuario tiene acceso a la ruta actual:

```typescript
if (!isPathAllowedForRole(role, pathname)) {
  navigate(getDefaultPathForRole(role));
}
```

### Frontend — Renderizado condicional

Las páginas usan `usePermissions()` para mostrar u ocultar secciones:

```typescript
const { role, can } = usePermissions();

{can("orders.create") && <CreateOrderButton />}
{role !== "shipper" && orderClientCode && <ClientCodeCard />}
```

### Servidor — JWT y RLS

El `orders-service` extrae el rol del token JWT (emitido localmente, sin proveedor externo) en cada request y aplica restricciones:

```javascript
const RESTRICTED_ROLES = new Set(['shipper', 'customer', 'vendor']);

function extractRoleFromRequest(req) {
  // req.user ya fue verificado por authMiddleware (jwt.verify)
  return (req.user.role || '').toLowerCase();
}

// En GET /api/orders:
if (RESTRICTED_ROLES.has(role)) stripClientCode(rows);
```

Esto garantiza que **incluso si el frontend falla**, el backend nunca expone datos sensibles a roles no autorizados.
