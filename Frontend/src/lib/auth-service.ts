import type { Role } from "@/types/domain";
import { getTenantSlug, readApiConfig } from "@/lib/api-config";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface Session {
  token: string;
  username: string;
  name: string;
  role: Role;
  expiresAt: number; // ms timestamp
}

const VALID_ROLES = new Set<Role>(["owner", "ops", "warehouse", "shipper", "vendor", "support", "customer"]);

export function parseRole(raw: unknown): Role {
  const r = typeof raw === "string" ? (raw.toLowerCase() as Role) : "customer";
  return VALID_ROLES.has(r) ? r : "customer";
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Token sin payload");
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as Record<string, unknown>;
}

export function parseExpiry(token: string): number {
  try {
    const { exp } = decodeJwtPayload(token) as { exp?: number };
    return exp ? exp * 1000 : Date.now() + 8 * 3_600_000;
  } catch {
    return Date.now() + 8 * 3_600_000;
  }
}

/**
 * Autentica contra el backend local con usuario y contraseña.
 * Para cambiar de proveedor (Clerk, Supabase, Cognito, Google),
 * solo reemplaza el cuerpo de esta función.
 */
export async function loginWithBackend(credentials: LoginCredentials): Promise<Session> {
  const { baseUrl } = readApiConfig();
  const tenantSlug = getTenantSlug();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {}),
    },
    body: JSON.stringify({
      username: credentials.username.trim().toLowerCase(),
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    let message = "Credenciales invalidas.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // cuerpo no JSON
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    token: string;
    role: string;
    name: string;
    username: string;
  };

  return {
    token: data.token,
    username: data.username,
    name: data.name,
    role: parseRole(data.role),
    expiresAt: parseExpiry(data.token),
  };
}
