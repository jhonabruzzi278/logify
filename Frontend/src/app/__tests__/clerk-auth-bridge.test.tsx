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

let clerkAuthState: { isLoaded: boolean; isSignedIn: boolean } = { isLoaded: true, isSignedIn: false };
const mockUserReload = vi.fn().mockResolvedValue(undefined);
let clerkUser: { organizationMemberships: Array<{ organization: { id: string } }>; reload: typeof mockUserReload } = {
  organizationMemberships: [{ organization: { id: "org_1" } }],
  reload: mockUserReload,
};

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ ...clerkAuthState, getToken: mockGetToken }),
  useClerk: () => ({ signOut: mockSignOut, user: clerkUser }),
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
  const { session, error, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="session-username">{session?.username ?? "sin-sesion"}</span>
      <span data-testid="session-role">{session?.role ?? ""}</span>
      <span data-testid="error">{error ?? ""}</span>
      <button onClick={() => void login({ username: "admin", password: "Admin123!" }).catch(() => {})}>
        Ingresar
      </button>
      <button onClick={() => void logout()}>Salir</button>
    </div>
  );
}

describe("ClerkBridgedAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkAuthState = { isLoaded: true, isSignedIn: false };
    clerkUser = { organizationMemberships: [{ organization: { id: "org_1" } }], reload: mockUserReload };
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

  it("restaura la sesion desde el token de Clerk cuando ya hay una sesion activa al cargar", async () => {
    clerkAuthState = { isLoaded: true, isSignedIn: true };
    mockGetToken.mockResolvedValue(fakeJwt({ username: "admin", name: "Andrés Soto", role: "owner", exp: 9999999999 }));

    render(
      <ClerkBridgedAuthProvider>
        <AuthConsumer />
      </ClerkBridgedAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("session-username")).toHaveTextContent("admin"));
    expect(screen.getByTestId("session-role")).toHaveTextContent("owner");
    expect(mockUpdateApiToken).toHaveBeenCalledWith(expect.stringContaining("."));
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
    expect(mockGetToken).toHaveBeenCalledWith({ template: "logify-api", skipCache: true });
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
});
