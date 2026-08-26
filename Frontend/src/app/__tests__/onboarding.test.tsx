import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/app/auth";
import { RequireCompletedOnboarding } from "@/app/onboarding";
import { getOnboarding } from "@/lib/onboarding-service";

vi.mock("@/lib/onboarding-service", () => ({ getOnboarding: vi.fn() }));

const ownerSession = {
  token: "token",
  username: "owner",
  name: "Owner",
  role: "owner" as const,
  expiresAt: Date.now() + 60_000,
};

function renderGuard(session: AuthContextValue["session"] = ownerSession) {
  const auth: AuthContextValue = {
    session,
    loading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/onboarding" element={<div>Configuración inicial</div>} />
          <Route element={<RequireCompletedOnboarding />}>
            <Route path="/dashboard" element={<div>Panel principal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireCompletedOnboarding", () => {
  afterEach(() => vi.clearAllMocks());

  it("envía al propietario nuevo al onboarding", async () => {
    vi.mocked(getOnboarding).mockResolvedValue({
      completed: false,
      name: "Negocio",
      contactEmail: null,
      businessCountry: null,
      businessIndustry: null,
      businessPhone: null,
      usedPosBefore: null,
      goals: [],
    });
    renderGuard();
    expect(await screen.findByText("Configuración inicial")).toBeInTheDocument();
  });

  it("mantiene al propietario existente en la aplicación", async () => {
    vi.mocked(getOnboarding).mockResolvedValue({
      completed: true,
      name: "Negocio",
      contactEmail: null,
      businessCountry: "Chile",
      businessIndustry: "Distribuidora",
      businessPhone: null,
      usedPosBefore: true,
      goals: ["pedidos"],
    });
    renderGuard();
    expect(await screen.findByText("Panel principal")).toBeInTheDocument();
  });

  it("no consulta ni bloquea a los demás roles", async () => {
    renderGuard({ ...ownerSession, role: "ops" });
    await waitFor(() => expect(screen.getByText("Panel principal")).toBeInTheDocument());
    expect(getOnboarding).not.toHaveBeenCalled();
  });
});
