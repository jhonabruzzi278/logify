# Logify — Wiki

Plataforma de gestión logística basada en microservicios.

---

## Índice

| Página | Descripción |
|--------|-------------|
| [[Arquitectura]] | Diagrama de servicios, puertos, tecnologías |
| [[Inicio-Rapido]] | Levantar el proyecto en 3 pasos |
| [[Roles-y-RBAC]] | Los 7 roles, rutas y permisos |
| [[Codigo-de-Cliente]] | Qué es SL-XXXXXX y cómo funciona |
| [[Flujo-de-Negocio]] | Ciclo completo de un pedido paso a paso |
| [[API-Reference]] | Todos los endpoints del sistema |
| [[Seguridad-y-RLS]] | JWT, RLS, validación de entrega |
| [[Frontend]] | Páginas, hooks, PWA |
| [[Pruebas]] | Tests unitarios y cobertura |
| [[Multi-Tenant]] | Roadmap y modelo de datos SaaS multi-tenant |

---

## Resumen del sistema

**Logify** permite gestionar el ciclo completo de una operación logística B2B:

```
Cliente crea pedido → Bodega confirma stock → Transportista entrega →
Cliente verifica su pedido con código SL-XXXXXX
```

Además opera como POS B2C (venta al público): fiado con cuenta corriente,
sesiones de caja, compras a proveedor y reportes de ganancia real. Un
switch B2B/B2C en el topbar alterna qué secciones de la navegación se
muestran. Ver el detalle en la sección "Modo B2B / B2C y funcionalidades
comerciales" del [README](../README.md).

### Stack principal

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 + Tailwind |
| API Gateway | Nginx Alpine (puerto 8080) |
| Microservicios | Node.js 22 + Express 4 |
| Base de datos | PostgreSQL 15 (4 bases independientes) |
| Infraestructura | Docker + Docker Compose |

### Repositorio

- **GitHub:** https://github.com/jhonabruzzi278/logify
- **Dominio:** logify.cl (en configuración)
