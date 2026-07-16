# Logify — Frontend

SPA con React 18 + TypeScript 5.7 + Vite 6 + Tailwind CSS + shadcn/ui. PWA instalable.

---

## Requisitos

- Node.js 22
- npm

---

## Instalación y desarrollo

```bash
cd Frontend
npm install
npm run dev
# Abre http://localhost:3000
```

El proxy de Vite (`vite.config.ts`) redirige `/api/*` al backend en `http://localhost:8080`.

```bash
# Build de producción
npm run build        # Output: dist/

# Tests
npm test
npm run test:coverage   # Reporte HTML en coverage/index.html

# Deploy a Vercel
npx vercel --prod
```

---

## Roles y acceso (RBAC)

El frontend aplica control de acceso por rol en dos niveles:

1. **Router guard** (`app/auth.tsx`): redirige al usuario según su rol si intenta acceder a una ruta no permitida
2. **Renderizado condicional**: las páginas ocultan acciones o datos según el rol (defensa en profundidad)

| Rol | Ruta por defecto | Páginas accesibles |
|-----|-----------------|-------------------|
| `owner` | `/dashboard` | Todo |
| `ops` | `/orders` | Dashboard, órdenes, clientes, inventario, envíos, alertas |
| `warehouse` | `/inventory` | Dashboard, inventario, órdenes, alertas |
| `shipper` | `/deliveries` | Entregas, envíos, alertas |
| `vendor` | `/pos` | Dashboard, inventario, POS |
| `support` | `/alerts` | Dashboard, órdenes, envíos, alertas |
| `customer` | `/tracking` | Tracking (sin login) |

---

## Hooks principales

| Hook | Propósito |
|------|-----------|
| `useApiQuery` | Llamadas REST genéricas con loading/error/data |
| `useOperationalWorkspace` | Orquestador de estado: confirmar, cancelar, asignar pedidos, ajustar inventario |
| `useCustomerScope` | Filtra órdenes/envíos al cliente logueado por email |
| `usePermissions` | Expone `role` y `can(permission)` del usuario actual |
| `useAuth` | Session JWT: username, email, rol |
| `useDebounce` | Valor con retardo — búsqueda de imágenes, validación de RUT, direcciones |
| `useIndicadores` | UF/dólar/UTM del día desde el backend |
| `useAuthImage` | Carga imágenes protegidas (QR) como blob con el JWT |

---

## Estructura

```
Frontend/
├── public/               # Assets estáticos e iconos PWA
├── src/
│   ├── app/
│   │   ├── access.ts     # RBAC: roles, rutas permitidas, rutas por defecto
│   │   ├── auth.tsx      # AuthProvider + useAuth + login demo
│   │   └── router.tsx    # React Router con guards de acceso
│   ├── components/
│   │   ├── common/       # MetricCard, PageHeader, StatusBadge, etc.
│   │   ├── layout/       # AppShell, Sidebar, Topbar, MobileNav
│   │   └── ui/           # Componentes shadcn/ui (Button, Table, Sheet...)
│   ├── hooks/            # useApiQuery, useOperationalWorkspace, useCustomerScope, usePermissions, useAuth
│   ├── lib/              # api-client, api-adapters, utils, export-csv
│   ├── pages/            # 20+ páginas organizadas por rol
│   │   ├── dashboard-page.tsx
│   │   ├── orders-page.tsx
│   │   ├── inventory-page.tsx
│   │   ├── shipments-page.tsx
│   │   ├── shipment-detail-page.tsx
│   │   ├── deliveries-page.tsx
│   │   ├── tracking-page.tsx       # Pública — sin auth, solo SL-XXXXXX
│   │   ├── customers-page.tsx
│   │   ├── pos-page.tsx
│   │   ├── alerts-page.tsx
│   │   └── ...
│   ├── styles/           # CSS global (Tailwind + utilidades mobile)
│   └── types/
│       ├── api.ts        # Tipos de respuestas del backend
│       └── domain.ts     # Tipos del dominio (Order, Shipment, Role...)
├── components.json       # Config shadcn/ui
├── tailwind.config.ts
├── vite.config.ts        # Vite + PWA (vite-plugin-pwa)
├── vercel.json           # Rewrites Vercel → backend
└── package.json
```

---

## Decisiones técnicas

- **PWA**: Instalable en dispositivos móviles con soporte offline (Service Worker via vite-plugin-pwa)
- **Bottom nav (mobile)**: 4 secciones principales accesibles desde la barra inferior
- **Sidebar lateral (desktop)**: Navegación completa con todas las secciones según rol
- **Sheet drawer (mobile)**: Sidebar desplegable via botón hamburguesa
- **useApiQuery**: Hook genérico para llamadas REST al backend con manejo de errores y loading states
- **useOperationalWorkspace**: Centraliza todas las mutaciones (confirm, cancel, delete, adjust) en un solo hook
- **useCustomerScope**: Filtra vistas de órdenes/envíos al customer logueado (por email)
- **shadcn/ui**: Componentes accesibles y personalizables via CSS variables
- **Proxy Vite → :8080**: En desarrollo el frontend no conoce puertos del backend; todo va a `/api/*`
- **Código del cliente (SL-XXXXXX)**: Nunca renderizado en vistas de shipper (defensa en profundidad; el backend también lo omite en el response)
