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
