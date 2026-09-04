import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InventoryHistoryPage } from "@/pages/inventory-history-page";

let canManage = true;
const mockApiFetch = vi.fn();
const mockUseApiQuery = vi.fn();

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (permission: string) => permission === "inventory.sessions.manage" && canManage }),
}));

vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const SESSIONS = [{
  id: 21,
  type: "count",
  name: "Conteo de bodega",
  status: "draft",
  createdBy: "admin",
  createdByName: "Administrador",
  startedAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:00.000Z",
  finalizedAt: null,
  cancelledAt: null,
  totalProducts: 10,
  scannedProducts: 4,
  totalDifference: -2,
}];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/inventory/history"]}>
      <Routes>
        <Route path="/inventory/history" element={<InventoryHistoryPage />} />
        <Route path="/inventory/history/:sessionId" element={<p>Proceso abierto</p>} />
        <Route path="/inventory" element={<p>Inventario general</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InventoryHistoryPage", () => {
  beforeEach(() => {
    canManage = true;
    mockApiFetch.mockReset();
    mockUseApiQuery.mockReset();
    mockUseApiQuery.mockReturnValue({ data: SESSIONS, loading: false, error: null });
  });

  it("muestra el historial y el progreso del conteo en español", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Historial de inventarios" })).toBeInTheDocument();
    expect(screen.getByText("Conteo de bodega")).toBeInTheDocument();
    expect(screen.getByText("4 de 10 productos registrados")).toBeInTheDocument();
  });

  it("permite iniciar un ingreso de mercadería y abre el proceso creado", async () => {
    mockApiFetch.mockResolvedValueOnce({ ...SESSIONS[0], id: 35, type: "restock", name: "Recepción semanal" });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /nuevo proceso/i }));
    fireEvent.click(screen.getByRole("button", { name: /agregar inventario/i }));
    fireEvent.change(screen.getByLabelText(/nombre opcional/i), { target: { value: "Recepción semanal" } });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/inventory-sessions", {
      method: "POST",
      body: JSON.stringify({ type: "restock", name: "Recepción semanal" }),
    }));
    expect(await screen.findByText("Proceso abierto")).toBeInTheDocument();
  });

  it("redirige al inventario general cuando el rol no es administrador", () => {
    canManage = false;
    renderPage();

    expect(screen.getByText("Inventario general")).toBeInTheDocument();
    expect(screen.queryByText("Historial de inventarios")).not.toBeInTheDocument();
  });
});
