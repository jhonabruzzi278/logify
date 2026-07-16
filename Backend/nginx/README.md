# BFF - API Gateway (Nginx)

Backend For Frontend que actua como punto unico de entrada a los microservicios.

## Funcion

Reverse proxy que enruta las peticiones HTTP entrantes al microservicio correspondiente segun el path de la URL.

## Rutas configuradas

| Path | Microservicio destino | Puerto |
|------|-----------------------|--------|
| `/api/auth` | orders-service | 8081 |
| `/api/orders` | orders-service | 8081 |
| `/api/customers` | orders-service | 8081 |
| `/api/inventory` | inventory-service | 8082 |
| `/api/sales` | inventory-service | 8082 |
| `/api/shipments` | shipping-service | 8084 |
| `/api/notifications` | notification-service | 8085 |
| `/healthz` | Health check directo | - |

## Configuracion

Archivo: `Backend/nginx/nginx.conf`

```nginx
worker_processes auto;

events {
  worker_connections 1024;
}

http {
  server {
    listen 80;

    location = /healthz {
      return 200 '{"status":"UP","service":"logify-api-gateway"}';
    }

    location /api/orders {
      proxy_pass http://orders-service:8081;
      # ... headers ...
    }

    # ... resto de rutas ...
  }
}
```

## Ejecucion

El BFF se levanta automaticamente como parte del `docker-compose.yml` (contenedor `logify-api-gateway`, puerto 8080 del host → 80 del contenedor). No requiere configuracion adicional.

## Verificar

```bash
curl http://localhost:8080/healthz
# Respuesta: {"status":"UP","service":"logify-api-gateway"}
```
