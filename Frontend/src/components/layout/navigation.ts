import { BarChart3, Boxes, Building2, Calendar, Gauge, Package, PackagePlus, Settings, ShieldCheck, ShoppingCart, Truck, Users, type LucideIcon } from "lucide-react";
import { hasPermission, type AppPermission } from "@/app/access";
import type { BusinessMode } from "@/hooks/use-business-mode";
import type { Role } from "@/types/domain";

export interface NavItem {
  title: string;
  mobileTitle?: string;
  path: string;
  icon: LucideIcon;
  mobile?: boolean;
  permission: AppPermission;
  /** En qué modo de negocio se muestra este ítem. "both" (default) si se omite. */
  mode?: BusinessMode | "both";
}

export const navItems: NavItem[] = [
  { title: "Dashboard", mobileTitle: "Inicio", path: "/dashboard", icon: Gauge, mobile: true, permission: "dashboard.view", mode: "both" },
  { title: "Punto de Venta", mobileTitle: "Vender", path: "/pos", icon: ShoppingCart, mobile: true, permission: "sales.create", mode: "b2c" },
  { title: "Inventario", mobileTitle: "Stock", path: "/inventory", icon: Boxes, mobile: true, permission: "inventory.view", mode: "both" },
  { title: "Pedidos", mobileTitle: "Pedidos", path: "/orders", icon: Package, mobile: true, permission: "orders.view", mode: "b2b" },
  { title: "Clientes", path: "/customers", icon: Users, permission: "orders.view", mode: "both" },
  { title: "Envios", path: "/shipments", icon: Truck, permission: "shipments.view", mode: "b2b" },
  { title: "Entregas", path: "/deliveries", icon: Truck, permission: "shipments.update", mode: "b2b" },
  { title: "Calendario", path: "/calendar", icon: Calendar, permission: "shipments.view", mode: "both" },
  { title: "Reportes", path: "/reports", icon: BarChart3, permission: "dashboard.view", mode: "both" },
  { title: "Proveedores", path: "/suppliers", icon: Building2, permission: "suppliers.manage", mode: "both" },
  { title: "Compras", path: "/purchases", icon: PackagePlus, permission: "purchases.manage", mode: "both" },
  { title: "Usuarios", path: "/users", icon: ShieldCheck, permission: "users.view", mode: "both" },
  { title: "Configuración", path: "/settings", icon: Settings, permission: "settings.manage", mode: "both" }
];

export function getVisibleNavItems(role: Role, mode: BusinessMode = "b2b") {
  return navItems.filter((item) => {
    const itemMode = item.mode ?? "both";
    return hasPermission(role, item.permission) && (itemMode === "both" || itemMode === mode);
  });
}
