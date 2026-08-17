import { lazy, Suspense, type PropsWithChildren } from "react";
import { getClerkPublishableKey } from "@/lib/clerk-config";

// Groundwork Clerk (ver ADR-004): envuelve la app en <ClerkProvider> SOLO si
// VITE_CLERK_PUBLISHABLE_KEY esta configurada; si no, renderiza los children
// directamente sin ningun cambio de comportamiento NI de peso de bundle --
// @clerk/react se importa dinamicamente (lazy) para que su codigo no viaje
// en el chunk principal mientras Clerk siga inactivo por defecto. @clerk/react
// (no @clerk/clerk-react) es el paquete que la propia Clerk CLI instala hoy
// para un proyecto React sin framework.
const LazyClerkProvider = lazy(() =>
  import("@clerk/react").then((mod) => ({ default: mod.ClerkProvider }))
);

export function ClerkAuthProvider({ children }: PropsWithChildren) {
  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) return <>{children}</>;

  // El fallback NO puede ser `children`: desde la Fase 2 de ADR-004,
  // ClerkBridgedAuthProvider (que consume hooks de Clerk) vive dentro de
  // este arbol, y esos hooks explotan si se renderizan sin <ClerkProvider>
  // montado -- que es exactamente lo que pasaria durante la breve ventana
  // en la que se descarga el chunk lazy de @clerk/react. `null` evita ese
  // crash a costa de un flash en blanco minimo y unico (una sola vez por
  // carga de la app, no por navegacion).
  return (
    <Suspense fallback={null}>
      <LazyClerkProvider publishableKey={publishableKey}>{children}</LazyClerkProvider>
    </Suspense>
  );
}
