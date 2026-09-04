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
// Atajo para el caso comun (1 sola membership): la activa directo sin pasar
// por un selector. Retorna null si no hay ninguna, para que el llamador lo
// trate como el error real que es en vez de dejar avanzar un login con un
// token sin organizacion activa. Los llamadores con 2+ memberships deben
// usar listOrganizationMemberships() y dejar que la persona elija.
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

export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
}

// Multi-org: lista todas las organizaciones a las que pertenece la persona,
// para que el llamador decida (login directo si hay 1, selector si hay 2+).
// reload() por el mismo motivo que activateFirstOrganizationMembership.
export async function listOrganizationMemberships(clerk: ClerkClient): Promise<OrganizationOption[]> {
  await clerk.user?.reload();
  return (clerk.user?.organizationMemberships ?? []).map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
  }));
}
