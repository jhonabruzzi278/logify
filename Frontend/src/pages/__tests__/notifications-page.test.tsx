import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPage } from "@/pages/notifications-page";

const mockUseApiQuery = vi.fn();

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {},
}));

describe("NotificationsPage", () => {
  beforeEach(() => {
    mockUseApiQuery.mockReset();
    mockUseApiQuery.mockReturnValue({ data: [], loading: false, error: null, refresh: vi.fn() });
  });

  it("renderiza sin errores y muestra el buscador de notificaciones", () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Notificaciones" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar notificaciones...")).toBeInTheDocument();
  });
});
