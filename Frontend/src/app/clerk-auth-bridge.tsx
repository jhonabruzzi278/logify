import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { setApiAuthErrorListener, setApiAuthRefreshHandler, updateApiToken } from "@/lib/api-client";
import { decodeJwtPayload, parseRole, type Session } from "@/lib/auth-service";
import { AuthContext, type AuthContextValue } from "@/app/auth";
import type { ApiLoginRequest } from "@/types/api";

// Fase 2 de ADR-004 (corte real): mismo AuthContext que AuthProvider
// (auth.tsx), pero autentica contra Clerk en vez de POST /api/auth/login.
// login-page.tsx y el resto de la app no cambian -- consumen useAuth() sin
// saber cual de los dos providers esta activo (lo decide main.tsx segun
// isClerkConfigured()).
//
// El JWT Template "logify-api" (ver ADR-004 y el dashboard de Clerk) agrega
// los claims custom username/name/role/tenant_id/tenant_slug -- el token de
// sesion default de Clerk no los trae, por eso getToken siempre pide este
// template especifico.
const CLERK_JWT_TEMPLATE = "logify-api";

interface ClerkAppClaims {
  username?: string;
  name?: string;
  role?: string;
}

function sessionFromClerkToken(token: string): Session {
  const claims = decodeJwtPayload(token) as ClerkAppClaims & { exp?: number };
  return {
    token,
    username: claims.username ?? "",
    name: claims.name ?? claims.username ?? "",
    role: parseRole(claims.role),
    expiresAt: claims.exp ? claims.exp * 1000 : Date.now() + 60_000,
  };
}

export function ClerkBridgedAuthProvider({ children }: PropsWithChildren) {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useClerkAuth();
  const clerk = useClerk();
  const { signOut } = clerk;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  const refreshToken = useCallback(async () => {
    return getToken({ template: CLERK_JWT_TEMPLATE });
  }, [getToken]);

  useEffect(() => {
    setApiAuthErrorListener((status) => {
      if (status === 401) {
        setSession(null);
        updateApiToken(null);
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      }
    });
    setApiAuthRefreshHandler(refreshToken);

    return () => {
      setApiAuthErrorListener(null);
    };
  }, [refreshToken]);

  // Restaura la sesion desde la sesion de Clerk ya activa (cookies), en vez
  // de localStorage -- Clerk gestiona su propia persistencia.
  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      setRestoringSession(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getToken({ template: CLERK_JWT_TEMPLATE });
      if (cancelled) return;
      if (token) {
        const next = sessionFromClerkToken(token);
        updateApiToken(token);
        setSession(next);
      }
      setRestoringSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoaded, isSignedIn, getToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading: loading || restoringSession,
      error,
      async login(credentials: ApiLoginRequest) {
        if (!signInLoaded || !signIn || !setActive) {
          throw new Error("Clerk todavía no está listo, intenta de nuevo.");
        }
        setLoading(true);
        setError(null);
        try {
          const attempt = await signIn.create({
            identifier: credentials.username.trim(),
            password: credentials.password,
          });
          if (attempt.status !== "complete" || !attempt.createdSessionId) {
            throw new Error("No se pudo completar el inicio de sesión.");
          }
          await setActive({ session: attempt.createdSessionId });
          // El JWT Template "logify-api" usa shortcodes {{organization.public_metadata.*}}
          // para tenant_id/tenant_slug -- Clerk solo los interpola si la sesion
          // tiene una organizacion ACTIVA, algo que setActive({session}) solo
          // no hace. Cada usuario Logify pertenece a una sola Organization
          // (el tenant), asi que se activa la primera membership disponible.
          const membership = clerk.user?.organizationMemberships?.[0];
          if (membership) {
            await setActive({ session: attempt.createdSessionId, organization: membership.organization.id });
          }
          const token = await getToken({ template: CLERK_JWT_TEMPLATE });
          if (!token) {
            throw new Error("No se pudo obtener el token de sesión.");
          }
          const next = sessionFromClerkToken(token);
          updateApiToken(token);
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
          await signOut();
        } finally {
          setSession(null);
          updateApiToken(null);
          setError(null);
        }
      },
    }),
    [session, loading, restoringSession, error, signInLoaded, signIn, setActive, getToken, signOut, clerk],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
