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
    username: "admin@logify.cl",
    name: "Andrés Soto",
    role: "owner",
    groups: ["admin", "owner"],
    team: "Direccion",
    summary: "Supervisa toda la operacion, define accesos y revisa el estado transversal del negocio."
  },
  {
    username: "operaciones@logify.cl",
    name: "Marcela Fuentes",
    role: "ops",
    groups: ["operador", "ops"],
    team: "Operaciones",
    summary: "Gestiona pedidos, incidencias y coordinacion de despacho."
  },
  {
    username: "bodega@logify.cl",
    name: "Patricio Salazar",
    role: "warehouse",
    groups: ["bodega", "warehouse"],
    team: "Bodega",
    summary: "Controla stock y ajustes manuales de inventario."
  },
  {
    username: "soporte@logify.cl",
    name: "Camila Torres",
    role: "support",
    groups: ["soporte", "support"],
    team: "Soporte",
    summary: "Monitorea alertas, trazabilidad y continuidad operativa."
  },
  {
    username: "transportista@logify.cl",
    name: "Luis Carvajal",
    role: "shipper",
    groups: ["transportista", "shipper"],
    team: "Transporte",
    summary: "Actualiza entregas, confirma reparto y reporta retrasos o novedades de ruta."
  },
  {
    username: "maria@logify.cl",
    name: "María González",
    role: "vendor",
    groups: ["vendedor", "vendor"],
    team: "Ventas",
    summary: "Vendedora de tienda. Registra ventas en caja y atiende clientes."
  },
  {
    username: "carlos@logify.cl",
    name: "Carlos Muñoz",
    role: "vendor",
    groups: ["vendedor", "vendor"],
    team: "Ventas",
    summary: "Vendedor de tienda. Responsable de atencion al cliente y registro de ventas."
  },
  {
    username: "cliente@logify.cl",
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
  admin: "admin@logify.cl",
  operaciones: "operaciones@logify.cl",
  ops: "operaciones@logify.cl",
  bodega: "bodega@logify.cl",
  warehouse: "bodega@logify.cl",
  transportista: "transportista@logify.cl",
  shipper: "transportista@logify.cl",
  vendedor1: "maria@logify.cl",
  vendedor2: "carlos@logify.cl",
  soporte: "soporte@logify.cl",
  support: "soporte@logify.cl",
  cliente: "cliente@logify.cl",
  customer: "cliente@logify.cl",
};

for (const [alias, email] of Object.entries(SIMPLE_ALIASES)) {
  if (USER_BY_USERNAME[email]) {
    USER_BY_USERNAME[alias] = USER_BY_USERNAME[email];
  }
}

export const DEFAULT_DEMO_PASSWORD =
  (typeof window !== "undefined"
    ? (window as unknown as Record<string, string>).__LOGIFY_DEMO_PASSWORD__
    : undefined) ?? "Logify123!";

export function getRoleLabel(role: Role): string {
  return getRoleProfile(role).label;
}
