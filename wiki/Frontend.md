# Frontend

SPA React 18 + TypeScript 5.7 + Vite 6. PWA instalable con soporte offline.

---

## Tecnologías

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| React | 18 | UI declarativa |
| TypeScript | 5.7 | Tipado estático |
| Vite | 6 | Bundler y dev server |
| Tailwind CSS | 3 | Estilos utilitarios |
| shadcn/ui | latest | Componentes accesibles |
| React Router | 6 | Navegación SPA |
| vite-plugin-pwa | latest | Progressive Web App |

---

## Estructura de directorios

```
Frontend/src/
├── app/
│   ├── access.ts          RBAC: perfiles de rol, rutas, permisos
│   ├── auth.tsx           AuthProvider, useAuth, guard de acceso por rol
│   └── router.tsx         Definición de rutas (React Router)
│
├── components/
│   ├── common/            MetricCard, PageHeader, StatusBadge, EmptyState
│   ├── layout/            AppShell, Sidebar, Topbar, MobileNav, SheetDrawer
│   └── ui/                Componentes shadcn/ui (Button, Table, Sheet, Dialog...)
│
├── hooks/
│   ├── use-api-query.ts           GET al backend con loading/error/data
│   ├── use-operational-workspace.ts  Confirmar, cancelar, eliminar, ajustar
│   ├── use-customer-scope.ts      Filtra al cliente logueado por email
│   ├── use-permissions.ts         role + can(permission)
│   ├── use-auth.ts                session (username, email, role)
│   ├── use-debounce.ts            Valor con retardo (búsquedas, validación RUT)
│   ├── use-indicadores.ts         UF/dólar/UTM desde /api/inventory/indicadores
│   └── use-auth-image.ts          Carga imágenes protegidas (QR) como blob con JWT
│
├── lib/
│   ├── api-adapters.ts       Convierte snake_case → camelCase del backend
│   ├── api-client.ts         ApiClient: JWT, refresh deduplicado, fetchBlob (PDF/QR)
│   ├── api-blob.ts           Descarga de binarios autenticados
│   ├── push-notifications.ts Suscripción Web Push (VAPID + service worker)
│   ├── utils.ts              cn(), formatDate(), formatCurrency()
│   └── export-csv.ts         Exportar tablas a CSV
│
├── sw.ts                  Service worker propio: precache + handlers push/notificationclick
│
├── pages/
│   ├── dashboard-page.tsx
│   ├── orders-page.tsx
│   ├── order-detail-page.tsx
│   ├── inventory-page.tsx
│   ├── shipments-page.tsx
│   ├── shipment-detail-page.tsx
│   ├── deliveries-page.tsx        Vista del transportista
│   ├── tracking-page.tsx          Pública — sin auth, solo SL-XXXXXX
│   ├── customers-page.tsx
│   ├── pos-page.tsx               Punto de venta
│   ├── alerts-page.tsx
│   ├── reports-page.tsx
│   ├── users-page.tsx
│   ├── calendar-page.tsx
│   ├── notifications-page.tsx
│   ├── profile-page.tsx
│   ├── login-page.tsx
│   └── access-denied-page.tsx
│
├── styles/
│   └── global.css         Tailwind base + variables CSS + utilidades mobile
│
└── types/
    ├── api.ts             Tipos de respuesta del backend (snake_case)
    └── domain.ts          Tipos del dominio (camelCase, Order, Shipment, Role...)
```

---

## Hooks principales

### `useApiQuery`

Hook genérico para GET al backend. Maneja loading, error y transformación de datos.

```typescript
const { data: orders, loading, error, refetch } = useApiQuery<ApiOrder[], Order[]>({
  path: "/api/orders",
  transform: (rows) => rows.map(adaptOrder)
});
```

### `useOperationalWorkspace`

Centraliza todas las mutaciones de negocio en un solo hook. Evita lógica duplicada entre páginas.

```typescript
const { confirmOrder, cancelOrder, deleteOrder, adjustInventory, loading } =
  useOperationalWorkspace({ orders, shipments });
```

### `useCustomerScope`

Filtra órdenes/envíos al customer logueado comparando su email con la tabla de clientes.

```typescript
const { isCustomer, linkedCustomerId } = useCustomerScope();
```

- `isCustomer: true` → el rol es `customer`
- `linkedCustomerId: string | null` → ID del registro en `customers` que coincide con el email del usuario
- Si `isCustomer && !linkedCustomerId` → el usuario no tiene cliente registrado; se muestra lista vacía

### `usePermissions`

Expone el rol del usuario y una función `can()` para verificar permisos:

```typescript
const { role, can } = usePermissions();

if (can("orders.create")) {
  // mostrar botón de crear orden
}
```

### `useAuth`

Acceso a la sesión JWT del usuario actual:

```typescript
const { session, isAuthenticated, login, logout } = useAuth();
// session.username, session.email, session.role
```

---

## Páginas por rol

| Página | Roles que la ven | Notas |
|--------|-----------------|-------|
| `/dashboard` | owner, ops, warehouse, vendor, support | Métricas y alertas |
| `/orders` | owner, ops, warehouse, support, customer | Customer ve solo sus órdenes |
| `/inventory` | owner, ops, warehouse, vendor | |
| `/shipments` | owner, ops, support, shipper, customer | Shipper ve solo los suyos asignados |
| `/deliveries` | shipper | Vista optimizada para móvil |
| `/tracking` | Pública (sin auth) | Solo acepta SL-XXXXXX |
| `/customers` | owner, ops, warehouse, support | |
| `/pos` | owner, vendor | Punto de venta |
| `/alerts` | owner, ops, warehouse, shipper, support | |
| `/users` | owner | Gestión de usuarios |
| `/reports` | todos | Exportar CSV |

---

## Navegación adaptativa

### Desktop
Sidebar lateral siempre visible con todas las rutas del rol.

### Mobile
- **Bottom navigation:** 4 atajos principales (Inicio, Órdenes, Envíos, Alertas)
- **Sheet drawer:** hamburguesa → sidebar completo desplegable

---

## PWA y notificaciones push

La app es instalable en cualquier dispositivo con soporte offline básico y recibe notificaciones push del navegador.

- Configurada con `vite-plugin-pwa` en modo `injectManifest`: el service worker es código propio (`src/sw.ts`)
- El SW precachea la aplicación (workbox-precaching) y maneja los eventos `push` y `notificationclick`
- El manifiesto se genera desde `vite.config.ts` (no hay `manifest.json` en `public/`); iconos SVG en `/public/`
- La suscripción push se activa desde el perfil del usuario (`push-notifications.ts` + claves VAPID del backend)

Para instalar en móvil: abrir la app en el navegador → "Agregar a pantalla de inicio".

---

## Proxy de desarrollo

`vite.config.ts` redirige todas las llamadas `/api/*` al backend local:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8080'
  }
}
```

En producción (Vercel), los rewrites en `vercel.json` cumplen la misma función.

---

## Tipado de API

Los datos del backend llegan en `snake_case`. Los adaptadores en `lib/api-adapters.ts` los convierten a `camelCase` para el dominio del frontend:

```typescript
// api.ts — tal como viene del backend
interface ApiOrder {
  id: number;
  customer_id: number;
  client_code: string | null;
  created_at: string;
}

// domain.ts — tipado del frontend
interface Order {
  id: string;
  customerId: string;
  clientCode: string | null;
  createdAt: string;
}
```

---

## Comandos

```bash
npm run dev       # Servidor de desarrollo en :3000
npm run build     # Build de producción → dist/
npm run preview   # Preview del build local
npm test          # Tests con Vitest
npm run test:coverage  # Reporte HTML de cobertura
npx vercel --prod      # Deploy a Vercel
```
