import type { Role } from "@/types/domain";

export type AppPermission =
  | "dashboard.view"
  | "inventory.view"
  | "inventory.adjust"
  | "inventory.sessions.manage"
  | "orders.view"
  | "orders.create"
  | "orders.review"
  | "orders.assign"
  | "orders.delete"
  | "shipments.view"
  | "shipments.dispatch"
  | "shipments.update"
  | "alerts.view"
  | "users.view"
  | "users.manage"
  | "customers.manage"
  | "sales.create"
  | "sales.view"
  | "settings.manage"
  | "notifications.manage"
  | "suppliers.manage"
  | "products.import"
  | "purchases.manage";

export interface RoleAccessProfile {
  label: string;
  summary: string;
  defaultPath: string;
  paths: string[];
  permissions: AppPermission[];
}

const basePaths = ["/access-denied", "/profile", "/billing", "/notifications", "/calendar", "/reports", "/pos"];
const inventoryPaths = ["/inventory", "/scan"];

export const roleProfiles: Record<Role, RoleAccessProfile> = {
  owner: {
    label: "Administrador",
    summary: "Control completo de la operacion, seguimiento transversal y gestion de usuarios del negocio.",
    defaultPath: "/dashboard",
    paths: ["/dashboard", "/onboarding", ...inventoryPaths, "/orders", "/customers", "/shipments", "/deliveries", "/alerts", "/users", "/settings", "/suppliers", "/purchases", ...basePaths],
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.adjust",
      "inventory.sessions.manage",
      "orders.view",
      "orders.create",
      "orders.review",
      "orders.assign",
      "orders.delete",
      "shipments.view",
      "shipments.dispatch",
      "shipments.update",
      "alerts.view",
      "users.view",
      "users.manage",
      "customers.manage",
      "sales.create",
      "sales.view",
      "settings.manage",
      "notifications.manage",
      "suppliers.manage",
      "products.import",
      "purchases.manage"
    ]
  },
  ops: {
    label: "Operaciones",
    summary: "Gestiona el flujo diario: crea pedidos, revisa incidencias y coordina despacho.",
    defaultPath: "/orders",
    paths: ["/dashboard", ...inventoryPaths, "/orders", "/customers", "/shipments", "/deliveries", "/alerts", ...basePaths],
    permissions: [
      "dashboard.view",
      "inventory.view",
      "orders.view",
      "orders.create",
      "orders.review",
      "orders.assign",
      "shipments.view",
      "shipments.dispatch",
      "shipments.update",
      "alerts.view",
      "sales.view",
      "customers.manage"
    ]
  },
  warehouse: {
    label: "Bodega",
    summary: "Controla stock, confirma disponibilidad y responde a quiebres o ajustes de inventario.",
    defaultPath: "/inventory",
    paths: ["/dashboard", ...inventoryPaths, "/orders", "/customers", "/alerts", "/suppliers", "/purchases", ...basePaths],
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.adjust",
      "orders.view",
      "orders.review",
      "alerts.view",
      "suppliers.manage",
      "products.import",
      "purchases.manage"
    ]
  },
  support: {
    label: "Soporte",
    summary: "Monitorea continuidad operativa, revisa trazabilidad y escala incidentes sin ejecutar cambios de negocio.",
    defaultPath: "/alerts",
    paths: ["/dashboard", "/orders", "/customers", "/shipments", "/alerts", ...basePaths],
    permissions: [
      "dashboard.view",
      "orders.view",
      "shipments.view",
      "alerts.view"
    ]
  },
  customer: {
    label: "Cliente",
    summary: "Consulta sus pedidos y envios sin intervenir la operacion interna.",
    defaultPath: "/tracking",
    paths: ["/orders", "/shipments", "/tracking", "/profile", "/notifications", "/calendar", "/reports"],
    permissions: [
      "orders.view",
      "shipments.view"
    ]
  },
  shipper: {
    label: "Transportista",
    summary: "Gestiona las entregas asignadas, actualiza estados de ruta y reporta retrasos operativos.",
    defaultPath: "/deliveries",
    paths: ["/deliveries", "/shipments", "/alerts", ...basePaths],
    permissions: [
      "shipments.view",
      "shipments.update",
      "alerts.view"
    ]
  },
  vendor: {
    label: "Vendedor",
    summary: "Registra ventas en caja, revisa stock disponible y consulta sus propias ventas del dia.",
    defaultPath: "/pos",
    paths: ["/dashboard", ...inventoryPaths, "/pos", ...basePaths],
    permissions: [
      "dashboard.view",
      "inventory.view",
      "sales.create",
      "sales.view"
    ]
  }
};

export function getRoleProfile(role: Role) {
  return roleProfiles[role];
}

export function getAllowedPaths(role: Role) {
  return roleProfiles[role].paths;
}

export function getDefaultPathForRole(role: Role): string {
  return roleProfiles[role].defaultPath;
}

export function isPathAllowedForRole(role: Role, pathname: string) {
  return roleProfiles[role].paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function hasPermission(role: Role, permission: AppPermission) {
  return roleProfiles[role].permissions.includes(permission);
}
