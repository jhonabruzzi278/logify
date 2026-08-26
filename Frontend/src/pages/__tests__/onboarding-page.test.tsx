import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/app/auth";
import { OnboardingPage } from "@/pages/onboarding-page";
import { completeOnboarding, getOnboarding } from "@/lib/onboarding-service";

vi.mock("@/lib/onboarding-service", () => ({
  getOnboarding: vi.fn(),
  completeOnboarding: vi.fn(),
}));

const ownerAuth: AuthContextValue = {
  session: { token: "token", username: "owner", name: "Owner", role: "owner", expiresAt: Date.now() + 60_000 },
  loading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
};

function renderPage(auth = ownerAuth) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<div>Dashboard listo</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("OnboardingPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("recoge la configuración inicial y entra al dashboard", async () => {
    vi.mocked(getOnboarding).mockResolvedValue({
      completed: false,
      name: "Mi almacén",
      contactEmail: "dueno@empresa.cl",
      businessCountry: "Chile",
      businessIndustry: "",
      businessPhone: "+56911111111",
      usedPosBefore: null,
      goals: [],
    });
    vi.mocked(completeOnboarding).mockResolvedValue({
      completed: true,
      name: "Mi almacén",
      contactEmail: "dueno@empresa.cl",
      businessCountry: "Chile",
      businessIndustry: "Almacén",
      businessPhone: "+56911111111",
      usedPosBefore: false,
      goals: ["inventario"],
    });

    renderPage();
    expect(await screen.findByText("Cuéntanos sobre tu negocio")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Rubro" }), { target: { value: "Almacén" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Ajustemos el punto de partida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No, es el primero" }));
    fireEvent.click(screen.getByRole("button", { name: /Controlar inventario/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Tu espacio está listo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entrar a Logify/ }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith(expect.objectContaining({
      name: "Mi almacén",
      businessIndustry: "Almacén",
      usedPosBefore: false,
      goals: ["inventario"],
    })));
    expect(await screen.findByText("Dashboard listo")).toBeInTheDocument();
  });

  it("envía al dashboard a una cuenta ya configurada", async () => {
    vi.mocked(getOnboarding).mockResolvedValue({
      completed: true,
      name: "Existente",
      contactEmail: null,
      businessCountry: "Chile",
      businessIndustry: "Distribuidora",
      businessPhone: null,
      usedPosBefore: true,
      goals: ["pedidos"],
    });
    renderPage();
    expect(await screen.findByText("Dashboard listo")).toBeInTheDocument();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("muestra un error de carga sin dejar la pantalla en espera", async () => {
    vi.mocked(getOnboarding).mockRejectedValue(new Error("sin red"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar la configuración");
  });
});
