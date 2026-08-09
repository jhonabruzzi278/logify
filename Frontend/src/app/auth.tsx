import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isPlatformPortalHostname } from "@/lib/tenant-navigation";
import { getDefaultPathForRole, isPathAllowedForRole } from "@/app/access";
import { setApiAuthErrorListener, setApiAuthRefreshHandler, updateApiToken } from "@/lib/api-client";
import { loginWithBackend, type Session } from "@/lib/auth-service";
import type { ApiLoginRequest } from "@/types/api";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  login: (credentials: ApiLoginRequest) => Promise<Session>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "logify-auth-v2";
const AuthContext = createContext<AuthContextValue | null>(null);

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
  const { session } = useAuth();
  const location = useLocation();

  if (typeof window !== "undefined" && isPlatformPortalHostname(window.location.hostname)) {
    return <Navigate to="/login" replace />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isPathAllowedForRole(session.role, location.pathname)) {
    return <Navigate to={getDefaultPathForRole(session.role)} replace state={{ deniedFrom: location.pathname }} />;
  }

  return <Outlet />;
}
