import { getRoleProfile } from "@/app/access";
import type { Role } from "@/types/domain";

export interface RegisteredUser {
  username: string;
  name: string;
  role: Role;
  groups: string[];
  team: string;
  summary: string;
}

export const REGISTERED_USERS: RegisteredUser[] = [
  {
    username: "admin@smartlogix.cl",
    name: "Andrés Soto",
    role: "owner",
    groups: ["admin", "owner"],
    team: "Direccion",
    summary: "Supervisa toda la operacion, define accesos y revisa el estado transversal del negocio."
  },
  {
    username: "operaciones@smartlogix.cl",
    name: "Marcela Fuentes",
    role: "ops",
    groups: ["operador", "ops"],
    team: "Operaciones",
    summary: "Gestiona pedidos, incidencias y coordinacion de despacho."
  },
  {
    username: "bodega@smartlogix.cl",
    name: "Patricio Salazar",
    role: "warehouse",
    groups: ["bodega", "warehouse"],
    team: "Bodega",
    summary: "Controla stock y ajustes manuales de inventario."
  },
  {
    username: "soporte@smartlogix.cl",
    name: "Camila Torres",
    role: "support",
    groups: ["soporte", "support"],
    team: "Soporte",
    summary: "Monitorea alertas, trazabilidad y continuidad operativa."
  },
  {
    username: "transportista@smartlogix.cl",
    name: "Luis Carvajal",
    role: "shipper",
    groups: ["transportista", "shipper"],
    team: "Transporte",
    summary: "Actualiza entregas, confirma reparto y reporta retrasos o novedades de ruta."
  },
  {
    username: "maria@smartlogix.cl",
    name: "María González",
    role: "vendor",
    groups: ["vendedor", "vendor"],
    team: "Ventas",
    summary: "Vendedora de tienda. Registra ventas en caja y atiende clientes."
  },
  {
    username: "carlos@smartlogix.cl",
    name: "Carlos Muñoz",
    role: "vendor",
    groups: ["vendedor", "vendor"],
    team: "Ventas",
    summary: "Vendedor de tienda. Responsable de atencion al cliente y registro de ventas."
  },
  {
    username: "cliente@smartlogix.cl",
    name: "Rosa Mardones",
    role: "customer",
    groups: ["cliente", "customer"],
    team: "Clientes",
    summary: "Dueña del Almacén Doña Rosa (Ñuñoa). Consulta sus pedidos de reposición y rastrea envíos."
  }
];

export const USER_BY_USERNAME: Record<string, RegisteredUser> = {};

for (const u of REGISTERED_USERS) {
  USER_BY_USERNAME[u.username.toLowerCase()] = u;
}

const SIMPLE_ALIASES: Record<string, string> = {
  admin: "admin@smartlogix.cl",
  operaciones: "operaciones@smartlogix.cl",
  ops: "operaciones@smartlogix.cl",
  bodega: "bodega@smartlogix.cl",
  warehouse: "bodega@smartlogix.cl",
  transportista: "transportista@smartlogix.cl",
  shipper: "transportista@smartlogix.cl",
  vendedor1: "maria@smartlogix.cl",
  vendedor2: "carlos@smartlogix.cl",
  soporte: "soporte@smartlogix.cl",
  support: "soporte@smartlogix.cl",
  cliente: "cliente@smartlogix.cl",
  customer: "cliente@smartlogix.cl",
};

for (const [alias, email] of Object.entries(SIMPLE_ALIASES)) {
  if (USER_BY_USERNAME[email]) {
    USER_BY_USERNAME[alias] = USER_BY_USERNAME[email];
  }
}

export const DEFAULT_DEMO_PASSWORD =
  (typeof window !== "undefined"
    ? (window as unknown as Record<string, string>).__SMARTLOGIX_DEMO_PASSWORD__
    : undefined) ?? "Smartlogix123!";

export function getRoleLabel(role: Role): string {
  return getRoleProfile(role).label;
}
