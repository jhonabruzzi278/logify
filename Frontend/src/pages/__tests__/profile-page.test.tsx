import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ProfilePage } from "@/pages/profile-page";

const mockUseApiQuery = vi.fn();
vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

vi.mock("@/lib/push-notifications", () => ({
  isPushSupported: () => false,
  getPushSubscription: vi.fn().mockResolvedValue(null),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

const mockListMyOrganizations = vi.fn();
const mockSelectOrganization = vi.fn();
// Holder mutable para simular, en un solo test, un provider que no expone
// listMyOrganizations (AuthProvider legacy, sin concepto de organizacion).
const authState: { listMyOrganizations?: () => Promise<unknown> } = {};

vi.mock("@/app/auth", () => ({
  useAuth: () => ({
    session: {
      token: "tok",
      username: "admin1",
      name: "Admin",
      role: "owner",
      expiresAt: Date.now() + 1_000_000,
      organizationSlug: "empresa-uno",
    },
    listMyOrganizations: authState.listMyOrganizations,
    selectOrganization: mockSelectOrganization,
  }),
}));

const ORG_OPTIONS = [
  { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" },
  { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" },
];

describe("ProfilePage — cambiar de organización", () => {
  beforeEach(() => {
    mockUseApiQuery.mockReturnValue({ data: [], loading: false, error: null, refresh: vi.fn() });
    mockListMyOrganizations.mockReset();
    mockSelectOrganization.mockReset();
    authState.listMyOrganizations = mockListMyOrganizations;
  });

  it("muestra el boton para cambiar de organización", () => {
    render(<ProfilePage />);
    expect(screen.getByRole("button", { name: /cambiar de organización/i })).toBeInTheDocument();
  });

  it("no muestra el boton cuando el provider no soporta multi-organización (JWT legacy)", () => {
    authState.listMyOrganizations = undefined;
    render(<ProfilePage />);
    expect(screen.queryByRole("button", { name: /cambiar de organización/i })).not.toBeInTheDocument();
  });

  it("al hacer click carga las organizaciones y marca la actual como ya seleccionada", async () => {
    mockListMyOrganizations.mockResolvedValue(ORG_OPTIONS);
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /cambiar de organización/i }));

    await waitFor(() => expect(mockListMyOrganizations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Empresa Uno/ })).toBeDisabled();
  });

  describe("con window.location.assign mockeado", () => {
    // jsdom no permite spyOn(window.location, "assign") directo (la propiedad
    // no es reconfigurable) -- se reemplaza el objeto location completo por
    // uno propio para este bloque y se restaura despues.
    const originalLocation = window.location;
    const assignSpy = vi.fn();

    beforeEach(() => {
      assignSpy.mockClear();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...originalLocation, assign: assignSpy },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    });

    it("al elegir otra organización llama a selectOrganization con su id y recarga la app", async () => {
      mockListMyOrganizations.mockResolvedValue(ORG_OPTIONS);
      mockSelectOrganization.mockResolvedValue({
        token: "tok2", username: "admin1", name: "Admin", role: "owner", expiresAt: Date.now() + 1_000_000,
      });

      render(<ProfilePage />);
      fireEvent.click(screen.getByRole("button", { name: /cambiar de organización/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /Empresa Dos/ }));

      await waitFor(() => expect(mockSelectOrganization).toHaveBeenCalledWith("org_2"));
      // Navegacion completa (no SPA) a proposito: las paginas ya montadas
      // cachean datos del tenant anterior (useApiQuery no invalida por
      // cambio de token), asi que solo un reload garantiza que todo
      // arranque limpio.
      await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/dashboard"));
    });

    it("muestra un error y no navega si selectOrganization falla", async () => {
      mockListMyOrganizations.mockResolvedValue(ORG_OPTIONS);
      mockSelectOrganization.mockRejectedValue(new Error("No se pudo completar el ingreso."));

      render(<ProfilePage />);
      fireEvent.click(screen.getByRole("button", { name: /cambiar de organización/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /Empresa Dos/ }));

      await waitFor(() => expect(screen.getByText("No se pudo completar el ingreso.")).toBeInTheDocument());
      expect(assignSpy).not.toHaveBeenCalled();
    });
  });
});
