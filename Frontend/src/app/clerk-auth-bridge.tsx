import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { isClerkAPIResponseError } from "@clerk/react/errors";
import { setApiAuthErrorListener, setApiAuthRefreshHandler, updateApiToken } from "@/lib/api-client";
import { decodeJwtPayload, parseRole, type Session } from "@/lib/auth-service";
import { AuthContext, type AuthContextValue } from "@/app/auth";
import { activateFirstOrganizationMembership, listOrganizationMemberships, type OrganizationOption } from "@/app/clerk-org-activation";
import type { ApiLoginRequest } from "@/types/api";

// Señal interna para que login() salga sin completar la sesión cuando hay
// 2+ memberships -- el catch de más abajo la reconoce y evita pisar
// organizationOptions con el banner de error genérico del formulario.
class OrgSelectionPendingError extends Error {}

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
  tenant_slug?: string;
}

// El JWT Template de Clerk arma el claim `name` concatenando first_name +
// last_name (ver dashboard de Clerk) -- cuando alguien no tiene apellido
// cargado (ej. "Agregar usuario" solo pide un nombre), Clerk interpola ese
// campo vacío como la palabra "null" en vez de una cadena vacía, y el claim
// sale literalmente "Jonathan null". Se sanea aquí en vez de depender de
// arreglar el template (fuera de este repo, config manual del dashboard).
function sanitizeClerkName(rawName: string): string {
  return rawName.replace(/\bnull\b/gi, "").replace(/\s+/g, " ").trim();
}

function sessionFromClerkToken(token: string): Session {
  const claims = decodeJwtPayload(token) as ClerkAppClaims & { exp?: number };
  const name = sanitizeClerkName(claims.name ?? "") || claims.username || "";
  return {
    token,
    username: claims.username ?? "",
    name,
    role: parseRole(claims.role),
    expiresAt: claims.exp ? claims.exp * 1000 : Date.now() + 60_000,
    organizationSlug: claims.tenant_slug,
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
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[] | null>(null);
  const organizationIdRef = useRef<string | null>(null);
  // Sesión de Clerk ya activa (login o restauración) esperando a que la
  // persona elija a qué organización entrar -- ver selectOrganization().
  const pendingSessionIdRef = useRef<string | null>(null);
  const authVersionRef = useRef(0);

  const refreshToken = useCallback(async () => {
    // Los claims tenant_id/tenant_slug dependen de la Organization. No basta
    // con que Clerk tenga una Organization activa: durante la propagacion de
    // estado entre tabs puede emitir un JWT sin esos claims si organizationId
    // no se pasa explicitamente. Ese JWT es valido para Clerk, pero requireTenant
    // lo rechaza con 401 y antes provocaba el salto momentaneo al login.
    const authVersion = authVersionRef.current;
    let organizationId = organizationIdRef.current;
    const sessionId = clerk.session?.id;
    if (!organizationId && sessionId) {
      organizationId = await activateFirstOrganizationMembership(clerk, setActive, sessionId);
      organizationIdRef.current = organizationId;
    }
    if (!organizationId) return null;

    const token = await getToken({
      template: CLERK_JWT_TEMPLATE,
      organizationId,
      skipCache: true,
    });
    if (token && authVersion === authVersionRef.current) {
      updateApiToken(token);
      setSession(sessionFromClerkToken(token));
      setError(null);
    }
    return token;
  }, [clerk, getToken, setActive]);

  useEffect(() => {
    setApiAuthErrorListener((status) => {
      if (status === 401) {
        // Un 401 del API no prueba que la sesion de Clerk haya terminado:
        // tambien puede deberse a propagacion de claims o a una instancia del
        // backend desactualizada. Mantener la sesion evita login -> app mientras
        // Clerk conserva una cookie valida. Clerk es la fuente de verdad.
        if (isSignedIn === false) {
          organizationIdRef.current = null;
          setSession(null);
          updateApiToken(null);
          setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        } else {
          setError("No pudimos validar tu sesión con el servidor. Reintentaremos automáticamente.");
        }
      }
    });
    setApiAuthRefreshHandler(refreshToken);

    return () => {
      setApiAuthErrorListener(null);
      setApiAuthRefreshHandler(null);
    };
  }, [isSignedIn, refreshToken]);

  // Restaura la sesion desde la sesion de Clerk ya activa (cookies), en vez
  // de localStorage -- Clerk gestiona su propia persistencia.
  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      authVersionRef.current += 1;
      organizationIdRef.current = null;
      updateApiToken(null);
      setSession(null);
      setRestoringSession(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const sessionId = clerk.session?.id;
      let organizationId: string | null = null;
      if (sessionId) {
        // Multi-org: lastActiveOrganizationId persiste entre recargas (es
        // parte del recurso Session de Clerk) -- camino silencioso rapido que
        // evita re-enumerar memberships y volver a mostrar el selector en cada
        // reload cuando la persona ya habia elegido una organizacion antes.
        organizationId = clerk.session?.lastActiveOrganizationId ?? null;
        if (organizationId) {
          await setActive({ session: sessionId, organization: organizationId });
        } else {
          const memberships = await listOrganizationMemberships(clerk);
          if (cancelled) return;
          if (memberships.length === 1) {
            organizationId = memberships[0].id;
            await setActive({ session: sessionId, organization: organizationId });
          } else if (memberships.length > 1) {
            // Sesion de Clerk activa pero sin organizacion elegida todavia --
            // RequireAuth (app/auth.tsx) renderiza el selector mientras
            // session sigue null.
            pendingSessionIdRef.current = sessionId;
            setOrganizationOptions(memberships);
            setRestoringSession(false);
            return;
          }
        }
      }
      // Si sessionId todavia no esta disponible (Clerk puede publicarlo un
      // tick despues de isSignedIn, ver PR #92), organizationId queda null y
      // se sigue pidiendo el token igual, sin organizacion -- exactamente el
      // comportamiento previo para ese caso.
      if (cancelled) return;
      organizationIdRef.current = organizationId;
      // Mismo problema que en login() (ver PR #92): sin organizationId
      // explicito, el token puede salir con tenant_id vacio si la sesion de
      // Clerk (cookies) no tiene todavia una organizacion activa en este tab
      // -- requireTenant lo rechaza con "Sesion invalida, inicia sesion de
      // nuevo" pese a que la sesion es valida.
      const token = await getToken({
        template: CLERK_JWT_TEMPLATE,
        organizationId: organizationId ?? undefined,
        skipCache: true,
      });
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
  }, [authLoaded, isSignedIn, getToken, clerk, setActive]);

  // apiClient conserva el JWT que se le entrego al iniciar/restaurar sesion.
  // Renovarlo poco antes de expirar evita que las consultas en segundo plano
  // tengan que descubrir la expiracion mediante una rafaga de respuestas 401.
  useEffect(() => {
    if (!session || !isSignedIn) return;
    const refreshAheadMs = 15_000;
    const maxTimerMs = 2_147_000_000;
    const delay = Math.min(maxTimerMs, Math.max(0, session.expiresAt - Date.now() - refreshAheadMs));
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void refreshToken()
        .then(() => undefined)
        .catch((refreshError) => {
          if (cancelled) return;
          console.warn("[ClerkBridgedAuthProvider] renovación preventiva falló", refreshError);
        });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSignedIn, refreshToken, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading: loading || restoringSession,
      error,
      organizationOptions,
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
          // no hace.
          const memberships = await listOrganizationMemberships(clerk);
          if (!memberships.length) {
            // Sin esto, el login "tenia exito" en silencio con un token sin
            // organizacion activa -- cada llamada a la API fallaba con 401 sin
            // que la persona entendiera por que (bug real, ver auditoria de
            // produccion). Se cierra la sesion de Clerk a medio crear para que
            // un reintento parta limpio, en vez de dejarla colgada.
            await signOut();
            throw new Error("Tu cuenta no está asociada a ninguna empresa en Logify. Contacta a soporte.");
          }
          let organizationId: string;
          if (memberships.length === 1) {
            organizationId = memberships[0].id;
            await setActive({ session: attempt.createdSessionId, organization: organizationId });
          } else {
            // Multi-org: la persona pertenece a 2+ organizaciones -- se deja
            // la sesion de Clerk activa (ya autenticada) pero sin organizacion
            // elegida todavia; RequireAuth (app/auth.tsx) renderiza el
            // selector y termina el login via selectOrganization().
            pendingSessionIdRef.current = attempt.createdSessionId;
            setOrganizationOptions(memberships);
            throw new OrgSelectionPendingError();
          }
          organizationIdRef.current = organizationId;
          // Pasar organizationId evita depender de la propagación asíncrona
          // del estado activo de Clerk y garantiza que se interpolen los
          // shortcodes organization/org_membership del template logify-api.
          const token = await getToken({
            template: CLERK_JWT_TEMPLATE,
            organizationId,
            skipCache: true,
          });
          if (!token) {
            throw new Error("No se pudo obtener el token de sesión.");
          }
          const next = sessionFromClerkToken(token);
          updateApiToken(token);
          setSession(next);
          return next;
        } catch (err) {
          if (err instanceof OrgSelectionPendingError) {
            // No es un error real -- el formulario de login no debe mostrar
            // el banner mientras se renderiza el selector de organizacion.
            throw err;
          }
          // Diagnostico temporal (401/400 en produccion, ver PR #92): el
          // sign_ins de Clerk devuelve el motivo real dentro de err.errors
          // (code/longMessage) -- err.message por si solo suele ser generico.
          if (isClerkAPIResponseError(err)) {
            console.error("[ClerkBridgedAuthProvider.login] Clerk API error", {
              status: err.status,
              clerkTraceId: err.clerkTraceId,
              errors: err.errors.map((e) => ({ code: e.code, message: e.message, longMessage: e.longMessage, meta: e.meta })),
            });
          } else {
            console.error("[ClerkBridgedAuthProvider.login] login failed", err);
          }
          const message = err instanceof Error ? err.message : "No se pudo iniciar sesión.";
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },
      // Botón "Cambiar de organización" en el perfil (persona ya logueada,
      // no la restauración/login de más arriba): lectura simple, sin tocar
      // organizationOptions/pendingSessionIdRef -- esos son del flujo de
      // selección pre-sesión. selectOrganization() de abajo ya funciona tal
      // cual para completar el cambio (cae a clerk.session?.id cuando no hay
      // pendingSessionIdRef, que es siempre el caso acá).
      async listMyOrganizations() {
        return listOrganizationMemberships(clerk);
      },
      async selectOrganization(organizationId: string) {
        const sessionId = pendingSessionIdRef.current ?? clerk.session?.id;
        if (!sessionId || !setActive) {
          throw new Error("Sesión inválida, vuelve a iniciar sesión.");
        }
        setLoading(true);
        setError(null);
        try {
          await setActive({ session: sessionId, organization: organizationId });
          organizationIdRef.current = organizationId;
          const token = await getToken({
            template: CLERK_JWT_TEMPLATE,
            organizationId,
            skipCache: true,
          });
          if (!token) {
            throw new Error("No se pudo obtener el token de sesión.");
          }
          const next = sessionFromClerkToken(token);
          updateApiToken(token);
          setSession(next);
          setOrganizationOptions(null);
          pendingSessionIdRef.current = null;
          return next;
        } catch (err) {
          const message = err instanceof Error ? err.message : "No se pudo completar el ingreso.";
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },
      async logout() {
        // Invalida cualquier renovacion que ya estuviera esperando respuesta;
        // de otro modo podria volver a poblar la sesion despues de signOut().
        authVersionRef.current += 1;
        organizationIdRef.current = null;
        pendingSessionIdRef.current = null;
        try {
          await signOut();
        } finally {
          setSession(null);
          setOrganizationOptions(null);
          updateApiToken(null);
          setError(null);
        }
      },
    }),
    [session, loading, restoringSession, error, organizationOptions, signInLoaded, signIn, setActive, getToken, signOut, clerk],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
