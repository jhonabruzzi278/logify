import { isManagementPortalHostname, isPlatformPortalHostname } from "@/lib/tenant-navigation";

// Groundwork Clerk (ver aidlc-docs/design-artifacts/ADR/ADR-004-clerk-como-idaas-para-autenticacion.md).
// Sin VITE_CLERK_PUBLISHABLE_KEY configurada, todo lo relacionado a Clerk
// queda inactivo y el login actual (Frontend/src/app/auth.tsx) sigue
// funcionando exactamente igual que antes de que Clerk existiera en el proyecto.
export function getClerkPublishableKey(): string | null {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function isClerkConfigured(): boolean {
  return getClerkPublishableKey() !== null;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

// Fix urgente (auditoria de produccion 2026-08-19): VITE_CLERK_PUBLISHABLE_KEY
// es una unica env var de Vercel que aplica a todo el build del Frontend, asi
// que isClerkConfigured() por si sola es true para TODOS los subdominios
// (app.logify.cl y cada <tenant>.logify.cl), no solo para el portal. Sin este
// chequeo de hostname, main.tsx montaba ClerkBridgedAuthProvider tambien en
// los tenants que nunca fueron migrados a Clerk (confirmado en produccion:
// window.Clerk activo en minimarketelsol.logify.cl, que no tiene ningun
// usuario en Clerk) -- su login quedaba roto sin fallback al JWT propio.
// Mientras dure la migracion completa de tenants (ADR-004), Clerk solo se
// activa en el portal (app.logify.cl) y en local/dev (para poder seguir
// probando /login-clerk).
export function shouldActivateClerk(hostname: string): boolean {
  if (!isClerkConfigured()) return false;
  return isPlatformPortalHostname(hostname) || isManagementPortalHostname(hostname) || LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}
