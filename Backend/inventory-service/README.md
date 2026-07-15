# inventory-service

Microservicio de control de inventario y ventas. Node.js 22 + Express 4 + PostgreSQL.

## Responsabilidad

Gestiona el catalogo de productos, el stock y el registro de ventas. Proporciona ajustes atomicos de inventario.

## Puerto

`8082` | Base de datos: `inventory_db`

## Dependencias

- express, pg, helmet, cors, express-rate-limit, uuid
- shared/ (app, db, logger, validate, security, shutdown)

## Endpoints

Todos requieren JWT (`Authorization: Bearer <token>`).

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/inventory | Listar todos los productos |
| GET | /api/inventory/:sku | Consultar un producto por SKU |
| POST | /api/inventory | Agregar producto `{sku, name, stock, price, cost, category, imageUrl}` |
| PUT | /api/inventory/:sku | Actualizar stock |
| DELETE | /api/inventory/:sku | Eliminar producto |
| POST | /api/inventory/:sku/adjust?delta=N | Ajuste atomico de stock (+/-). Si delta < 0, registra venta |
| PUT | /api/inventory/:sku/image | Asignar imagen al producto `{imageUrl}` |
| GET | /api/inventory/:sku/qr | Codigo QR del SKU (PNG) |
| GET | /api/inventory/report | Reporte clasificado por nivel de stock (stored procedure) |
| GET | /api/inventory/report/pdf | Reporte de inventario en PDF (pdfkit) |
| GET | /api/inventory/indicadores | UF, dolar y UTM del dia (mindicador.cl, cache 1h) |
| GET | /api/inventory/image-search?q=X | Buscar imagenes de producto (Openverse) |
| GET | /api/inventory/geocode?address=X | Geocodificar direccion (Nominatim) |
| GET | /api/sales | Listar historial de ventas |
| POST | /api/sales | Registrar venta directa `{items, total, paymentMethod, vendorId, vendorName}` |

## Reglas de negocio

- El ajuste de stock es atomico: no permite stock negativo (`stock + delta >= 0`)
- Los ajustes negativos registran automaticamente una venta en la tabla `sales`
- Cada producto tiene: sku, name, stock, price, cost, category, image_url

## Categorias de producto

- `bebidas` - Bebidas
- `galletas` - Galletas
- `dulces` - Dulces
- `otros` - Otros productos (default)

## Ejecucion

### Con Docker (recomendado)

```bash
# Desde la raiz del proyecto
docker compose up -d --build
```

### Sin Docker (desarrollo)

```bash
cd Backend/inventory-service
npm install
DB_URL=postgresql://postgres:postgres@localhost:5432/inventory_db node src/index.js
```

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| PORT | 8082 | Puerto HTTP |
| DB_URL | postgresql://postgres:postgres@postgres-db:5432/inventory_db | Conexion BD |
| ALLOWED_ORIGINS | * | CORS origins |

## Pruebas Unitarias

### Ejecutar pruebas

```bash
npm test
```

`npm test` ya genera cobertura (`jest --coverage`); el reporte HTML queda en `coverage/index.html`.

### Cobertura actual

**45 pruebas** en verde (`src/index.test.js`). Cobertura de statements: **36,6 %**. La meta del equipo es 60% (no hay `coverageThreshold` configurado; ver [wiki/Pruebas.md](../../wiki/Pruebas.md)).
