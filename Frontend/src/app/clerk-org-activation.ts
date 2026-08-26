import type { useClerk } from "@clerk/react";

type ClerkClient = ReturnType<typeof useClerk>;
type SetActiveFn = (params: { session: string; organization?: string }) => Promise<void>;

// clerk.user todavia no esta poblado en el mismo tick que setActive resuelve
// (confirmado en produccion: sin el reload(), organizationMemberships llega
// vacio y el JWT sale con los placeholders sin interpolar) -- reload() fuerza
// a traer el recurso User ya con las memberships actualizadas. Compartido
// entre el login normal (clerk-auth-bridge.tsx) y el flujo de restablecer
// contraseña (forgot-password-clerk-page.tsx), que tambien necesita una
// Organization activa para que el JWT Template resuelva tenant_id/tenant_slug.
//
// Activa la primera membership de forma deterministica -- Logify todavia no
// soporta que una persona pertenezca a mas de una Organization (el webhook
// de orders-service rechaza sincronizar una segunda membership del mismo
// Clerk User a un tenant distinto, ver Fase 2 de la migracion a Clerk).
// Retorna false si no hay ninguna membership, para que el llamador pueda
// tratarlo como el error real que es en vez de dejar avanzar un login con un
// token sin organizacion activa.
export async function activateFirstOrganizationMembership(
  clerk: ClerkClient,
  setActive: SetActiveFn,
  sessionId: string,
): Promise<string | null> {
  await clerk.user?.reload();
  const membership = clerk.user?.organizationMemberships?.[0];
  if (!membership) return null;
  await setActive({ session: sessionId, organization: membership.organization.id });
  return membership.organization.id;
}
