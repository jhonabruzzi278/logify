import { lazy, Suspense, type PropsWithChildren } from "react";
import { getClerkPublishableKey } from "@/lib/clerk-config";

// Groundwork Clerk (ver ADR-004): envuelve la app en <ClerkProvider> SOLO si
// VITE_CLERK_PUBLISHABLE_KEY esta configurada; si no, renderiza los children
// directamente sin ningun cambio de comportamiento NI de peso de bundle --
// @clerk/clerk-react se importa dinamicamente (lazy) para que su codigo no
// viaje en el chunk principal mientras Clerk siga inactivo por defecto.
const LazyClerkProvider = lazy(() =>
  import("@clerk/clerk-react").then((mod) => ({ default: mod.ClerkProvider }))
);

export function ClerkAuthProvider({ children }: PropsWithChildren) {
  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) return <>{children}</>;

  return (
    <Suspense fallback={children}>
      <LazyClerkProvider publishableKey={publishableKey}>{children}</LazyClerkProvider>
    </Suspense>
  );
}
