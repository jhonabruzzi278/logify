# Inicio rápido

Levantar Logify completo en 3 pasos.

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Node.js 22 (solo para el frontend en modo desarrollo)
- Git

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/jhonabruzzi278/logify.git
cd logify
```

---

## Paso 2 — Levantar el backend

```bash
docker compose up -d --build
```

Este comando construye y levanta 6 contenedores:

| Contenedor | Puerto | Descripción |
|-----------|--------|-------------|
| logify-db | 5432 | PostgreSQL 15 (4 bases de datos) |
| logify-orders | 8081 | orders-service |
| logify-inventory | 8082 | inventory-service |
| logify-shipping | 8084 | shipping-service |
| logify-notification | 8085 | notification-service |
| logify-api-gateway | **8080** | Nginx BFF (entrada única) |

Verificar que todo está corriendo:

```bash
docker compose ps
curl http://localhost:8080/healthz
# → OK
```

---

## Paso 3 — Levantar el frontend

```bash
cd Frontend
npm install
npm run dev
```

Abre `http://localhost:3000` en el navegador.

---

## Acceder al sistema

### Usuarios de prueba

Sembrados automáticamente en el primer arranque (`seedUsers()` en `Backend/orders-service/src/index.js`):

| Usuario | Contraseña | Rol | Página inicial |
|---------|-----------|-----|---------------|
| `admin` | `Admin123!` | owner | `/dashboard` |
| `operaciones` | `Ops123!` | ops | `/orders` |
| `bodega` | `Bodega123!` | warehouse | `/inventory` |
| `transportista` | `Trans123!` | shipper | `/deliveries` |
| `vendedor1` | `Vend123!` | vendor | `/pos` |
| `vendedor2` | `Vend123!` | vendor | `/pos` |
| `soporte` | `Sop123!` | support | `/alerts` |
| `cliente` | `Cli123!` | customer | `/tracking` |

> **Nota:** El login valida la contraseña contra el hash `bcrypt` guardado en la tabla `users` — no acepta cualquier contraseña. El rol viene del campo `role` del usuario, no se infiere del nombre.

---

## Cargar datos de prueba

Los datos de prueba se cargan automáticamente al arrancar. Para recargarlos manualmente:

```bash
docker exec -i logify-db psql -U postgres -d orders_db < Backend/seed.sql
```

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f orders-service

# Reconstruir un servicio sin derribar todo
docker compose up -d --build orders-service

# Detener todos los contenedores
docker compose down

# Detener y eliminar datos (borra BD)
docker compose down -v

# Estado de los contenedores
docker compose ps
```

---

## Frontend en producción (Vercel)

El acceso central está desplegado en **https://app.logify.cl** y cada empresa
opera en `https://<empresa>.logify.cl`. El frontend llama directamente a
`https://api.logify.cl` mediante `VITE_API_BASE_URL`; `vercel.json` se usa para
el fallback de React Router y los headers de seguridad/caché, no como proxy API.

---

## Solución de problemas comunes

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| Puerto 8080 en uso | Otra app ocupa el puerto | `docker compose down` y verificar con `netstat -ano \| findstr :8080` |
| BD no conecta | El contenedor postgres tardó en arrancar | Esperar 10s y reintentar `docker compose restart` |
| Frontend no conecta al backend | Proxy mal configurado | Verificar que el backend esté en `:8080` y Vite en `:3000` |
| `npm run dev` en otro puerto | Puerto 3000 en uso | Vite cambia automáticamente a `:3001`, `:3002`, etc. |
