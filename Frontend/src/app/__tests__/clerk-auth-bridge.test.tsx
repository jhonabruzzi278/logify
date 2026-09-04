import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ClerkBridgedAuthProvider } from "@/app/clerk-auth-bridge";
import { useAuth } from "@/app/auth";

const mockSignInCreate = vi.fn();
const mockSetActive = vi.fn();
const mockGetToken = vi.fn();
const mockSignOut = vi.fn();
const mockSetApiAuthErrorListener = vi.fn();
const mockSetApiAuthRefreshHandler = vi.fn();
const mockUpdateApiToken = vi.fn();
let registeredAuthErrorListener: ((status: number) => void) | null = null;
let registeredAuthRefreshHandler: (() => Promise<string | null>) | null = null;

let clerkAuthState: { isLoaded: boolean; isSignedIn: boolean } = { isLoaded: true, isSignedIn: false };
const mockUserReload = vi.fn().mockResolvedValue(undefined);
let clerkUser: { organizationMemberships: Array<{ organization: { id: string; name?: string; slug?: string } }>; reload: typeof mockUserReload } = {
  organizationMemberships: [{ organization: { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" } }],
  reload: mockUserReload,
};
// Sesion activa de Clerk restaurada desde cookies al cargar la pagina --
// null simula el caso "Clerk todavia no expone session.id en este tick".
let clerkSessionId: string | null = "sess_restore";
// Multi-org: organizacion activa recordada por Clerk entre recargas -- null
// simula el caso "todavia no eligio ninguna" (fuerza la enumeracion).
let clerkLastActiveOrganizationId: string | null = null;

// El objeto que devuelve useClerk() debe tener identidad ESTABLE entre
// renders (igual que el cliente real de Clerk, un singleton) -- clerk-auth-bridge.tsx
// lo lista como dependencia de un useEffect, y un objeto nuevo en cada
// render (como devolvia este mock antes) dispara un loop infinito de
// render/effect en el test.
const mockClerkClient = {
  signOut: mockSignOut,
  get user() {
    return clerkUser;
  },
  get session() {
    return clerkSessionId ? { id: clerkSessionId, lastActiveOrganizationId: clerkLastActiveOrganizationId } : undefined;
  },
};

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ ...clerkAuthState, getToken: mockGetToken }),
  useClerk: () => mockClerkClient,
}));

vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: { create: mockSignInCreate },
    setActive: mockSetActive,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  setApiAuthErrorListener: (...args: unknown[]) => mockSetApiAuthErrorListener(...args),
  setApiAuthRefreshHandler: (...args: unknown[]) => mockSetApiAuthRefreshHandler(...args),
  updateApiToken: (...args: unknown[]) => mockUpdateApiToken(...args),
}));

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: object) => btoa(JSON.stringify(obj)).replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

function AuthConsumer() {
  const { session, error, login, logout, organizationOptions, selectOrganization } = useAuth();
  return (
    <div>
      <span data-testid="session-username">{session?.username ?? "sin-sesion"}</span>
      <span data-testid="session-name">{session?.name ?? ""}</span>
      <span data-testid="session-role">{session?.role ?? ""}</span>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="org-options">{(organizationOptions ?? []).map((o) => o.id).join(",")}</span>
      <button onClick={() => void login({ username: "admin", password: "Admin123!" }).catch(() => {})}>
        Ingresar
      </button>
      <button onClick={() => void logout()}>Salir</button>
      {(organizationOptions ?? []).map((option) => (
        <button key={option.id} onClick={() => void selectOrganization?.(option.id).catch(() => {})}>
          Elegir {option.id}
        </button>
      ))}
    </div>
  );
}

describe("ClerkBridgedAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredAuthErrorListener = null;
    registeredAuthRefreshHandler = null;
    mockSetApiAuthErrorListener.mockImplementation((listener) => {
      registeredAuthErrorListener = listener;
    });
    mockSetApiAuthRefreshHandler.mockImplementation((handler) => {
      registeredAuthRefreshHandler = handler;
    });
    clerkAuthState = { isLoaded: true, isSignedIn: false };
    clerkUser = { organizationMemberships: [{ organization: { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" } }], reload: mockUserReload };
    clerkSessionId = "sess_restore";
    clerkLastActiveOrganizationId = null;
    mockUserReload.mockResolvedValue(undefined);
  });

  it("no restaura sesion cuando Clerk no tiene una sesion activa", async () => {
    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion"));
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  // Bug real de produccion: el JWT Template de Clerk arma `name` concatenando
  // first_name + last_name, y cuando la persona no tiene apellido cargado
  // (ej. "Agregar usuario" solo pide un nombre) el claim sale literalmente
  // "Jonathan null" en vez de solo "Jonathan" -- se veia asi en el perfil y
  // en el saludo de toda la app.
  it("sanea el sufijo 'null' que deja el JWT Template cuando la persona no tiene apellido", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "jonathant6", name: "Jonathan null", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("jonathant6"));
    expect(screen.getByTestId("session-name")).toHaveTextContent("Jonathan");
    expect(screen.getByTestId("session-name")).not.toHaveTextContent("null");
  });

  it("restaura la sesion desde el token de Clerk cuando ya hay una sesion activa al cargar", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(screen.getByTestId("session-role")).toHaveTextContent("owner");
    expect(mockUpdateApiToken).toHaveBeenCalledWith(expect.stringContaining("."));
    // Regresion: sin esto, la restauracion de sesion (page load con cookie
    // de Clerk ya activa) pedia el token sin organizationId -- el JWT salia
    // con tenant_id vacio y el backend lo rechazaba con "Sesion invalida,
    // inicia sesion de nuevo" pese a que la sesion era valida.
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_restore", organization: "org_1" });
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_1",
      skipCache: true,
    });
  });

  it("renueva el token del API ligado explicitamente a la misma Organization", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(registeredAuthRefreshHandler).not.toBeNull();
    mockGetToken.mockClear();

    await registeredAuthRefreshHandler?.();

    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_1",
      skipCache: true,
    });
  });

  it("recupera la Organization al renovar si Clerk publica session.id despues de restaurar", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    clerkSessionId = null;
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    // Clerk puede publicar el identificador un tick despues de isSignedIn.
    // El refresh debe recuperar entonces la membership y no emitir un JWT
    // sin tenant_id/tenant_slug.
    clerkSessionId = "sess_late";
    mockGetToken.mockClear();

    await registeredAuthRefreshHandler?.();

    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_late", organization: "org_1" });
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_1",
      skipCache: true,
    });
  });

  it("no emite un token de API sin Organization durante una renovacion", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    clerkSessionId = null;
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    mockGetToken.mockClear();

    await expect(registeredAuthRefreshHandler?.()).resolves.toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("conserva la sesion local ante un 401 aislado si Clerk sigue autenticado", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(registeredAuthErrorListener).not.toBeNull();

    registeredAuthErrorListener?.(401);

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Reintentaremos automáticamente"));
    expect(screen.getByTestId("session-username")).toHaveTextContent("admin");
    expect(mockUpdateApiToken).not.toHaveBeenCalledWith(null);
  });

  it("restaura la sesion sin organizationId si Clerk todavia no expone un session.id en este tick", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    clerkSessionId = null;
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: undefined,
      skipCache: true,
    });
  });

  it("login() completa el sign-in de Clerk, activa la sesion y arma el Session de la app", async () => {
    mockSignInCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "vendedor1", name: "María González", role: "vendor", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    fireEvent.click(screen.getByText("Ingresar"));

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("vendedor1"));
    expect(mockSignInCreate).toHaveBeenCalledWith({ identifier: "admin", password: "Admin123!" });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1" });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1", organization: "org_1" });
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_1",
      skipCache: true,
    });
    expect(mockUpdateApiToken).toHaveBeenCalled();
  });

  // Regresion: antes de este fix, un login sin ninguna Organization Membership
  // "tenia exito" en silencio con un token sin organizacion activa -- cada
  // llamada a la API fallaba con 401 sin que la persona entendiera por que.
  it("login() falla con un mensaje claro y cierra la sesion de Clerk si el usuario no tiene ninguna Organization", async () => {
    mockSignInCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    mockSetActive.mockResolvedValue(undefined);
    clerkUser = { organizationMemberships: [], reload: mockUserReload };

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    fireEvent.click(screen.getByText("Ingresar"));

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Tu cuenta no está asociada a ninguna empresa en Logify. Contacta a soporte."));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion");
  });

  it("login() falla si el intento de Clerk no queda 'complete' (ej. requiere un segundo factor)", async () => {
    mockSignInCreate.mockResolvedValue({ status: "needs_second_factor", createdSessionId: null });

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    fireEvent.click(screen.getByText("Ingresar"));

    await waitFor(() => expect(screen.getByTestId("error")).not.toHaveTextContent(""));
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion");
  });

  it("logout() llama a signOut de Clerk y limpia la sesion local", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));
    mockSignOut.mockResolvedValue(undefined);

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));

    fireEvent.click(screen.getByText("Salir"));

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateApiToken).toHaveBeenCalledWith(null);
  });

  it("restaura la sesion sin enumerar memberships cuando Clerk ya recuerda una organizacion activa", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    clerkLastActiveOrganizationId = "org_recordada";
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_restore", organization: "org_recordada" });
    // Camino silencioso: no hace falta reload()/enumerar memberships cuando
    // Clerk ya recuerda la organizacion activa entre recargas.
    expect(mockUserReload).not.toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_recordada",
      skipCache: true,
    });
  });

  it("multi-org: al restaurar sesion con 2+ memberships y sin organizacion recordada, deja la sesion en null y publica las opciones", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    clerkUser = {
      organizationMemberships: [
        { organization: { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" } },
        { organization: { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" } },
      ],
      reload: mockUserReload,
    };

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("org-options")).toHaveTextContent("org_1,org_2"));
    expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion");
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("multi-org: login() con 2+ memberships publica las opciones sin completar la sesion ni mostrar un error", async () => {
    mockSignInCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_multi" });
    clerkUser = {
      organizationMemberships: [
        { organization: { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" } },
        { organization: { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" } },
      ],
      reload: mockUserReload,
    };

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    fireEvent.click(screen.getByText("Ingresar"));

    await waitFor(() => expect(screen.getByTestId("org-options")).toHaveTextContent("org_1,org_2"));
    expect(screen.getByTestId("session-username")).toHaveTextContent("sin-sesion");
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("multi-org: selectOrganization() completa el login tras elegir una organizacion del selector", async () => {
    mockSignInCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_multi" });
    mockSetActive.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue(fakeJwt({ username: "vendedor1", name: "María González", role: "vendor", exp: 9999999999 }));
    clerkUser = {
      organizationMemberships: [
        { organization: { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" } },
        { organization: { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" } },
      ],
      reload: mockUserReload,
    };

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    fireEvent.click(screen.getByText("Ingresar"));
    await waitFor(() => expect(screen.getByTestId("org-options")).toHaveTextContent("org_1,org_2"));

    fireEvent.click(screen.getByText("Elegir org_2"));

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("vendedor1"));
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_multi", organization: "org_2" });
    expect(mockGetToken).toHaveBeenCalledWith({
      template: "logify-api",
      organizationId: "org_2",
      skipCache: true,
    });
    expect(screen.getByTestId("org-options")).toHaveTextContent("");
  });
});
