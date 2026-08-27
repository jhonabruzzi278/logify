import { getTenantSlugFromHostname } from "@/lib/api-config";

const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const RESERVED_TENANT_SLUGS = new Set(["www", "api", "app", "gestion", "admin", "mail", "logify", "static", "landing", "demo", "status"]);

export function isPlatformPortalHostname(hostname: string): boolean {
  return hostname.toLowerCase() === "app.logify.cl";
}

export function isManagementPortalHostname(hostname: string): boolean {
  return hostname.toLowerCase() === "gestion.logify.cl";
}

export function normalizeTenantSlug(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const withoutProtocol = normalized.replace(/^https?:\/\//, "");
  const hostname = withoutProtocol.split(/[/?#]/, 1)[0];
  const fromHostname = getTenantSlugFromHostname(hostname);
  const slug = fromHostname ?? hostname.replace(/\.logify\.cl$/, "");

  return TENANT_SLUG_PATTERN.test(slug) && !RESERVED_TENANT_SLUGS.has(slug) ? slug : null;
}

export function buildTenantUrl(slug: string, path = "/login"): string {
  const normalizedSlug = normalizeTenantSlug(slug);
  if (!normalizedSlug) throw new Error("Espacio de trabajo inválido");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${normalizedSlug}.logify.cl${normalizedPath}`;
}
