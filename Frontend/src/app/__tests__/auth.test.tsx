import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext, RequireAuth, type AuthContextValue } from "@/app/auth";

function renderRequireAuth(value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div>Pagina de login</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<div>Panel protegido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const BASE_AUTH_VALUE: AuthContextValue = {
  session: null,
  loading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
};

function setHostname(hostname: string) {
  vi.stubGlobal("location", { ...window.location, hostname });
}

describe("RequireAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // Regresion: en app.logify.cl sin Clerk activo (modelo viejo), este host
  // nunca tiene una sesion real -- es solo el buscador de espacio de trabajo.
  // shouldActivateClerk() (no isClerkConfigured() a secas) decide esto, ver
  // el incidente del 2026-08-19 en clerk-config.ts.
  it("redirige a /login en app.logify.cl cuando Clerk NO esta activo, aunque haya sesion", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    setHostname("app.logify.cl");

    renderRequireAuth({
      ...BASE_AUTH_VALUE,
      session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 },
    });

    expect(screen.getByText("Pagina de login")).toBeInTheDocument();
    expect(screen.queryByText("Panel protegido")).not.toBeInTheDocument();
  });

  it("permite el acceso en app.logify.cl cuando Clerk SI esta activo y hay sesion", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
    setHostname("app.logify.cl");

    renderRequireAuth({
      ...BASE_AUTH_VALUE,
      session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 },
    });

    expect(screen.getByText("Panel protegido")).toBeInTheDocument();
  });

  it("no muestra el login mientras Clerk restaura la sesion despues de un refresh", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
    setHostname("app.logify.cl");

    renderRequireAuth({
      ...BASE_AUTH_VALUE,
      session: null,
      loading: true,
    });

    expect(screen.getByRole("status", { name: "Cargando página" })).toBeInTheDocument();
    expect(screen.queryByText("Pagina de login")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel protegido")).not.toBeInTheDocument();
  });

  it("redirige a /login en un subdominio de tenant cuando no hay sesion", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    setHostname("minimarketelsol.logify.cl");

    renderRequireAuth({ ...BASE_AUTH_VALUE, session: null });

    expect(screen.getByText("Pagina de login")).toBeInTheDocument();
  });

  it("permite el acceso en un subdominio de tenant cuando hay sesion", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    setHostname("minimarketelsol.logify.cl");

    renderRequireAuth({
      ...BASE_AUTH_VALUE,
      session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 },
    });

    expect(screen.getByText("Panel protegido")).toBeInTheDocument();
  });
});
