import { BarChart3, Boxes, Building2, Calendar, Gauge, Package, Settings, ShieldCheck, ShoppingCart, Truck, Users, type LucideIcon } from "lucide-react";
import { hasPermission, type AppPermission } from "@/app/access";
import type { Role } from "@/types/domain";

export interface NavItem {
  title: string;
  mobileTitle?: string;
  path: string;
  icon: LucideIcon;
  mobile?: boolean;
  permission: AppPermission;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", mobileTitle: "Inicio", path: "/dashboard", icon: Gauge, mobile: true, permission: "dashboard.view" },
  { title: "Punto de Venta", mobileTitle: "Vender", path: "/pos", icon: ShoppingCart, mobile: true, permission: "sales.create" },
  { title: "Inventario", mobileTitle: "Stock", path: "/inventory", icon: Boxes, mobile: true, permission: "inventory.view" },
  { title: "Pedidos", mobileTitle: "Pedidos", path: "/orders", icon: Package, mobile: true, permission: "orders.view" },
  { title: "Clientes", path: "/customers", icon: Users, permission: "orders.view" },
  { title: "Envios", path: "/shipments", icon: Truck, permission: "shipments.view" },
  { title: "Entregas", path: "/deliveries", icon: Truck, permission: "shipments.update" },
  { title: "Calendario", path: "/calendar", icon: Calendar, permission: "shipments.view" },
  { title: "Reportes", path: "/reports", icon: BarChart3, permission: "dashboard.view" },
  { title: "Proveedores", path: "/suppliers", icon: Building2, permission: "suppliers.manage" },
  { title: "Usuarios", path: "/users", icon: ShieldCheck, permission: "users.view" },
  { title: "Configuración", path: "/settings", icon: Settings, permission: "settings.manage" }
];

export function getVisibleNavItems(role: Role) {
  return navItems.filter((item) => hasPermission(role, item.permission));
}