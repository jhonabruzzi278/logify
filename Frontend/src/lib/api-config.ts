const BASE_URL_KEY = "logify-api-base-url";
const TOKEN_KEY = "logify-api-token";

// Fase 4B del roadmap multi-tenant (ver wiki/Multi-Tenant.md): cada empresa
// entra por su propio subdominio (acme.logify.cl). Estos slugs no pueden
// ser subdominio de tenant porque ya tienen un uso reservado en la
// plataforma (marketing, API, panel de super-admin, etc).
const PLATFORM_DOMAIN = "logify.cl";
const RESERVED_TENANT_SLUGS = new Set(["www", "api", "app", "admin", "mail", "logify", "static", "landing"]);

export function getTenantSlugFromHostname(hostname: string): string | null {
  const suffix = `.${PLATFORM_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".") || RESERVED_TENANT_SLUGS.has(sub)) return null;
  return sub;
}

export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  return getTenantSlugFromHostname(window.location.hostname);
}

export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export function getDefaultApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

export function readApiConfig(): ApiConfig {
  if (typeof window === "undefined") {
    return { baseUrl: getDefaultApiBaseUrl(), token: "" };
  }

  const isLocalEnv = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultUrl = getDefaultApiBaseUrl();

  // En desarrollo local, siempre usar URL relativa (pasa por proxy Vite)
  if (isLocalEnv) {
    window.localStorage.removeItem(BASE_URL_KEY);
    return { baseUrl: defaultUrl, token: window.localStorage.getItem(TOKEN_KEY) ?? "" };
  }

  // En produccion, el build-time VITE_API_BASE_URL siempre tiene prioridad
  // sobre lo almacenado (la IP publica cambia con cada deploy de ECS)
  const baseUrl = defaultUrl || window.localStorage.getItem(BASE_URL_KEY) || "";

  return {
    baseUrl,
    token: window.localStorage.getItem(TOKEN_KEY) ?? ""
  };
}

export function writeApiConfig(config: ApiConfig) {
  const isLocalEnv = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isLocalEnv) {
    // Siempre persistir el baseUrl para sesiones futuras sin build-time env var
    window.localStorage.setItem(BASE_URL_KEY, config.baseUrl.trim() || getDefaultApiBaseUrl());
  }
  window.localStorage.setItem(TOKEN_KEY, config.token.trim());
}

export function clearApiConfig() {
  window.localStorage.removeItem(BASE_URL_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}