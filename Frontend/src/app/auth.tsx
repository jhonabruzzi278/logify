import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { shouldActivateClerk } from "@/lib/clerk-config";
import { isPlatformPortalHostname } from "@/lib/tenant-navigation";
import { getDefaultPathForRole, isPathAllowedForRole } from "@/app/access";
import { PageLoader } from "@/components/common/page-loader";
import { OrganizationPicker } from "@/components/auth/organization-picker";
import { setApiAuthErrorListener, setApiAuthRefreshHandler, updateApiToken } from "@/lib/api-client";
import { loginWithBackend, type Session } from "@/lib/auth-service";
import type { OrganizationOption } from "@/app/clerk-org-activation";
import type { ApiLoginRequest } from "@/types/api";

export interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  login: (credentials: ApiLoginRequest) => Promise<Session>;
  logout: () => Promise<void>;
  // Multi-org (solo lo puebla ClerkBridgedAuthProvider): opciones pendientes
  // de elegir cuando la persona pertenece a 2+ organizaciones. AuthProvider
  // (JWT legacy, sin concepto de organizacion) nunca las puebla.
  organizationOptions?: OrganizationOption[] | null;
  selectOrganization?: (organizationId: string) => Promise<Session>;
  // Botón "Cambiar de organización" en el perfil: lista bajo demanda todas
  // las organizaciones de la persona (no solo las "pendientes de elegir").
  // Solo lo provee ClerkBridgedAuthProvider.
  listMyOrganizations?: () => Promise<OrganizationOption[]>;
}

const STORAGE_KEY = "logify-auth-v2";
// Exportado para que ClerkBridgedAuthProvider (clerk-auth-bridge.tsx) pueda
// proveer el mismo contexto con Clerk por debajo -- login-page.tsx y el
// resto de la app consumen useAuth() sin saber cual de los dos providers
// esta activo.
export const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (!s.token || !s.role || !s.username || !s.name || !s.expiresAt) return null;
    if (Date.now() >= s.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s as Session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  updateApiToken(session.token);
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  updateApiToken(null);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readStoredSession();
    if (stored) updateApiToken(stored.token);
    return stored;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiAuthErrorListener((status) => {
      if (status === 401) {
        clearSession();
        setSession(null);
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      }
    });
    setApiAuthRefreshHandler(null);

    return () => {
      setApiAuthErrorListener(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      async login(credentials) {
        setLoading(true);
        setError(null);
        try {
          const next = await loginWithBackend(credentials);
          persistSession(next);
          setSession(next);
          return next;
        } catch (err) {
          const message = err instanceof Error ? err.message : "No se pudo iniciar sesión.";
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },
      async logout() {
        try {
          // Punto de extensión: aquí se puede llamar a Clerk, Supabase, Cognito, Google, etc.
        } finally {
          clearSession();
          setSession(null);
          setError(null);
        }
      },
    }),
    [session, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

export function RequireAuth() {
  const { session, loading, organizationOptions, selectOrganization } = useAuth();
  const location = useLocation();

  // Sin Clerk activo en este host (modelo viejo de JWT por subdominio),
  // app.logify.cl nunca tiene una sesion real -- es solo el buscador de
  // espacio de trabajo. Con Clerk activo, app.logify.cl es un host valido
  // para la app autenticada. shouldActivateClerk() (no isClerkConfigured() a
  // secas) porque la env var es global a todo el build -- ver el incidente
  // del 2026-08-19 en clerk-config.ts.
  if (typeof window !== "undefined" && isPlatformPortalHostname(window.location.hostname) && !shouldActivateClerk(window.location.hostname)) {
    return <Navigate to="/login" replace />;
  }

  // Clerk restaura la sesion desde su cookie de forma asincrona. Durante ese
  // breve intervalo session es null, pero no significa que haya expirado.
  // Esperar evita navegar a /login y volver al panel en cada refresh.
  if (loading) {
    return <PageLoader />;
  }

  if (!session) {
    // Multi-org: la sesion de Clerk ya esta activa pero falta elegir a que
    // organizacion entrar (2+ memberships). Cubre tanto el login como la
    // restauracion de sesion al recargar la pagina -- ver clerk-auth-bridge.tsx.
    if (organizationOptions && organizationOptions.length > 0 && selectOrganization) {
      return <OrganizationPicker options={organizationOptions} onSelect={selectOrganization} busy={loading} />;
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isPathAllowedForRole(session.role, location.pathname)) {
    return <Navigate to={getDefaultPathForRole(session.role)} replace state={{ deniedFrom: location.pathname }} />;
  }

  return <Outlet />;
}
