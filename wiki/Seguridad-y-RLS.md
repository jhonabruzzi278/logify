# Seguridad y RLS

Logify implementa un modelo de seguridad de tres capas para garantizar que cada usuario acceda solo a los datos que le corresponden.

---

## Modelo de tres capas

```
Capa 1 — Servidor (primaria)
  └─ El backend extrae el rol del JWT y elimina campos sensibles
     antes de enviar el response

Capa 2 — Endpoints especializados
  └─ El endpoint de tracking público devuelve solo campos seguros,
     sin importar quién lo llame

Capa 3 — Frontend (secundaria / defensa en profundidad)
  └─ Las páginas no renderizan secciones sensibles según el rol,
     aunque el servidor ya protege el dato en origen
```

---

## Capa 1 — RLS en el servidor

### Extracción del rol desde JWT

Cada microservicio verifica la firma del JWT con `authMiddleware` (`jwt.verify` contra `JWT_SECRET`, compartido vía variables de entorno) antes de procesar el request. Con la firma ya validada, el rol se lee directamente del claim `role`:

```javascript
// Backend/shared/auth.js
function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  try {
    req.user = verifyToken(token); // jwt.verify — lanza si la firma o expiración son inválidas
    next();
  } catch (err) {
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token invalido' });
  }
}

function extractRoleFromRequest(req) {
  return (req.user?.role || '').toLowerCase();
}
```

### Roles restringidos

```javascript
const RESTRICTED_ROLES = new Set(['shipper', 'customer', 'vendor']);
```

### Aplicación en endpoints

```javascript
// GET /api/orders — lista de órdenes
const role = extractRoleFromRequest(req);
const rows = (await pool.query(query, params)).rows;
if (RESTRICTED_ROLES.has(role)) stripClientCode(rows);
res.json(rows);

// GET /api/orders/:id — detalle de orden
const role = extractRoleFromRequest(req);
const row = r.rows[0];
if (RESTRICTED_ROLES.has(role)) delete row.client_code;
res.json(row);
```

---

## Capa 2 — Endpoint de tracking público

El endpoint `GET /api/orders/track/:clientCode` está disponible **sin autenticación** y devuelve solo los campos seguros — no hay forma de extraer email, teléfono ni dirección del cliente desde este endpoint:

**Campos devueltos:**
- `id`, `sku`, `quantity`, `status`, `created_at`
- `client_code` (el cliente lo conoce — lo usó para la búsqueda)
- `cancel_reason`
- `customer_name` (nombre de pila, sin datos de contacto)

**Campos excluidos:**
- `customer_email`
- `customer_phone`
- `customer_address`
- `rut`

---

## Capa 3 — Renderizado condicional en el frontend

Aunque el servidor ya protege el dato, el frontend añade una capa visual:

```typescript
// shipment-detail-page.tsx
const { role } = usePermissions();

{/* Solo roles con acceso interno ven el código */}
{role !== "shipper" && orderClientCode && (
  <ClientCodeCard code={orderClientCode} />
)}
```

También se aplica en la lista de envíos:

```typescript
// shipments-page.tsx — solo muestra envíos del transportista asignado
const shipperOrderIds = useMemo(() => {
  if (role !== "shipper" || !session?.username) return null;
  return new Set(
    orders.filter(o => o.assignedTo === session.username).map(o => o.id)
  );
}, [role, session?.username, orders]);
```

---

## Validación de entrega

La validación más estricta del sistema ocurre al confirmar la entrega. El `shipping-service` verifica dos factores independientes:

| Factor | Qué valida | Contra qué |
|--------|-----------|------------|
| `customerCode` | Que el cliente entregó su código | `orders.client_code` |
| `recipientRut` | Que quien recibió es el cliente registrado | `customers.rut` |

Si cualquiera falla:
```json
{ "error": "Código de cliente o RUT incorrecto" }
```

La etapa del envío **no cambia**.

---

## Protección de datos en el tracking público

El cliente final solo conoce su `SL-XXXXXX`. Con ese código puede ver el estado de su pedido, pero **no puede ver** datos de otros pedidos ni acceder a información de operaciones internas.

El endpoint de tracking valida que el código exista y devuelve solo los campos enumerados explícitamente en la query SQL — no un `SELECT *`.

---

## Flujo de autenticación (JWT local)

El sistema usa autenticación JWT propia — no depende de AWS Cognito ni de ningún proveedor externo:

1. El usuario se autentica con `POST /api/auth/login` (manejado por `orders-service`), que valida `username`/`password` contra la tabla `users` (contraseñas con `bcrypt`)
2. El servicio firma un JWT con `JWT_SECRET` (variable de entorno compartida por todos los microservicios) conteniendo `sub`, `name` y `role`
3. El frontend guarda el token y lo incluye en cada request con el header `Authorization: Bearer <token>`
4. Cada microservicio verifica la firma con `authMiddleware` (`jwt.verify`) y lee el rol desde `req.user.role`
5. La gestión de usuarios (`/api/auth/users`, `/api/auth/register`) está restringida a los roles `owner`/`admin`

---

## Checklist de seguridad implementado

- [x] No hay secretos hardcodeados en el código fuente
- [x] Inputs validados en todos los endpoints (`validateOrderBody`, `validateOrderStatus`)
- [x] Rate limiting habilitado en todos los servicios (via shared/security.js)
- [x] Helmet activado (headers de seguridad HTTP)
- [x] CORS configurado explícitamente
- [x] Los mensajes de error no exponen detalles de la base de datos al cliente
- [x] El campo `client_code` se elimina server-side para roles restringidos
- [x] El endpoint de tracking no expone datos de contacto del cliente
- [x] La confirmación de entrega requiere dos factores independientes
- [x] El transportista nunca recibe `client_code` por ningún endpoint
- [x] PostgreSQL RLS usa un rol runtime sin `BYPASSRLS`
- [x] Logs estructurados JSON y `x-request-id` propagado entre servicios
- [x] La llave administrativa se compara en tiempo constante
- [x] GitHub Actions fijadas por SHA para reducir riesgo de supply chain
- [x] Dependabot semanal para npm y GitHub Actions
- [x] Auditoría de dependencias HIGH/CRITICAL en cada PR
- [x] CodeQL, Gitleaks y Trivy ejecutados en PR, `main` y semanalmente
- [x] SBOM CycloneDX generado por cada componente y retenido como artefacto

## Pipeline DevSecOps

`.github/workflows/security.yml` aplica defensa en profundidad:

1. `npm audit --omit=dev --audit-level=high` sobre los seis proyectos.
2. SBOM CycloneDX independiente para cada microservicio, Frontend y Landing.
3. CodeQL para JavaScript/TypeScript con resultados en GitHub Code Scanning.
4. Gitleaks sobre el historial completo para detectar secretos.
5. Trivy filesystem para vulnerabilidades HIGH/CRITICAL y salida SARIF.

Las dependencias directas corregidas el 2026-08-08 incluyen Nodemailer 9,
Next.js 16.3, Swiper 14 y React Router 7. Después de la actualización, los
seis proyectos reportan cero vulnerabilidades de producción mediante
`npm audit --omit=dev`.
