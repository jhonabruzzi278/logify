import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InventorySessionPage } from "@/pages/inventory-session-page";
import type { ApiInventorySession, ApiInventorySessionItem } from "@/types/api";

let canManage = true;
const mockApiFetch = vi.fn();
const mockUseApiQuery = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (permission: string) => permission === "inventory.sessions.manage" && canManage }),
}));

vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/components/pos/barcode-scanner-modal", () => ({
  BarcodeScannerModal: ({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="scanner-modal">
      <button type="button" onClick={() => onDetected("7801234567890")}>Simular escaneo</button>
      <button type="button" onClick={onClose}>Cerrar escáner</button>
    </div>
  ),
}));

function buildItem(overrides: Partial<ApiInventorySessionItem> = {}): ApiInventorySessionItem {
  return {
    id: 1,
    sku: "SKU-1",
    barcode: "7801234567890",
    name: "Producto Uno",
    initialStock: 10,
    currentStock: 10,
    quantity: 8,
    scanned: true,
    difference: -2,
    finalStock: 8,
    appliedDelta: null,
    stockChanged: false,
    updatedAt: "2026-09-03T10:00:00.000Z",
    ...overrides,
  };
}

function buildSession(overrides: Partial<ApiInventorySession> = {}): ApiInventorySession {
  return {
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
    totalProducts: 2,
    scannedProducts: 1,
    totalDifference: -2,
    items: [buildItem()],
    ...overrides,
  };
}

function renderPage(sessionId = "21") {
  return render(
    <MemoryRouter initialEntries={[`/inventory/history/${sessionId}`]}>
      <Routes>
        <Route path="/inventory/history/:sessionId" element={<InventorySessionPage />} />
        <Route path="/inventory/history" element={<p>Historial</p>} />
        <Route path="/inventory" element={<p>Inventario general</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InventorySessionPage", () => {
  beforeEach(() => {
    canManage = true;
    mockApiFetch.mockReset();
    mockUseApiQuery.mockReset();
    mockNavigate.mockReset();
  });

  it("redirige al inventario general cuando el rol no tiene permiso", () => {
    canManage = false;
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refresh: vi.fn() });
    renderPage();

    expect(screen.getByText("Inventario general")).toBeInTheDocument();
  });

  it("muestra el estado de carga mientras no hay datos", () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refresh: vi.fn() });
    const { container } = renderPage();

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("muestra el error y un enlace de vuelta al historial", () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: "Fallo de red", refresh: vi.fn() });
    renderPage();

    expect(screen.getByText("Fallo de red")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al historial" })).toBeInTheDocument();
  });

  it("escanea un producto y actualiza el resumen de cantidad", async () => {
    const refresh = vi.fn();
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh });
    mockApiFetch.mockResolvedValueOnce(buildItem({ name: "Producto Escaneado", quantity: 3 }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Escanear producto" }));
    fireEvent.click(screen.getByText("Simular escaneo"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/inventory-sessions/21/scan", {
      method: "POST",
      body: JSON.stringify({ code: "7801234567890" }),
    }));
    expect(await screen.findByText("Producto Escaneado")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("muestra un error cuando el escaneo falla", async () => {
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh: vi.fn() });
    mockApiFetch.mockRejectedValueOnce(new Error("Código no encontrado"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Escanear producto" }));
    fireEvent.click(screen.getByText("Simular escaneo"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Código no encontrado");
  });

  it("actualiza la cantidad de un producto con los botones y confirma con la API", async () => {
    const refresh = vi.fn();
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh });
    mockApiFetch.mockResolvedValueOnce({});
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sumar una unidad de Producto Uno" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(`/api/inventory-sessions/21/items/${encodeURIComponent("SKU-1")}`, {
      method: "PUT",
      body: JSON.stringify({ quantity: 9 }),
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("muestra un error cuando falla la actualización de cantidad", async () => {
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh: vi.fn() });
    mockApiFetch.mockRejectedValueOnce(new Error("No se pudo guardar"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sumar una unidad de Producto Uno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar");
  });

  it("filtra los productos visibles según la búsqueda", () => {
    const session = buildSession({
      items: [buildItem({ sku: "SKU-1", name: "Producto Uno" }), buildItem({ sku: "SKU-2", name: "Otro artículo" })],
    });
    mockUseApiQuery.mockReturnValue({ data: session, loading: false, error: null, refresh: vi.fn() });
    renderPage();

    fireEvent.change(screen.getByLabelText("Buscar productos del inventario"), { target: { value: "otro" } });

    expect(screen.getByText("Otro artículo")).toBeInTheDocument();
    expect(screen.queryByText("Producto Uno")).not.toBeInTheDocument();
  });

  it("en una recepción (restock) sólo lista productos ya escaneados", () => {
    const session = buildSession({
      type: "restock",
      items: [
        buildItem({ sku: "SKU-1", name: "Escaneado", scanned: true }),
        buildItem({ sku: "SKU-2", name: "Sin escanear", scanned: false }),
      ],
    });
    mockUseApiQuery.mockReturnValue({ data: session, loading: false, error: null, refresh: vi.fn() });
    renderPage();

    expect(screen.getByText("Escaneado")).toBeInTheDocument();
    expect(screen.queryByText("Sin escanear")).not.toBeInTheDocument();
  });

  it("finaliza la sesión pidiendo confirmación de productos no escaneados y con cambios", async () => {
    const refresh = vi.fn();
    const session = buildSession({
      scannedProducts: 1,
      totalProducts: 2,
      items: [
        buildItem({ sku: "SKU-1", scanned: true }),
        buildItem({ sku: "SKU-2", scanned: false, stockChanged: true }),
      ],
    });
    mockUseApiQuery.mockReturnValue({ data: session, loading: false, error: null, refresh });
    mockApiFetch.mockResolvedValueOnce({});
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Revisar y finalizar" }));

    const confirmButton = screen.getByRole("button", { name: "Confirmar y finalizar" });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/no escaneado\(s\) quedarán con stock cero/));
    fireEvent.click(screen.getByLabelText(/cuyo stock cambió durante el conteo/));
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/inventory-sessions/21/finalize", {
      method: "POST",
      body: JSON.stringify({ confirmUnscannedAsZero: true, confirmStockChanges: true }),
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("muestra un error y mantiene el diálogo cerrado cuando la finalización falla", async () => {
    const session = buildSession({ items: [buildItem({ sku: "SKU-1", scanned: true })], scannedProducts: 1, totalProducts: 1 });
    mockUseApiQuery.mockReturnValue({ data: session, loading: false, error: null, refresh: vi.fn() });
    mockApiFetch.mockRejectedValueOnce(new Error("No se pudo finalizar"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Revisar y finalizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y finalizar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo finalizar");
    expect(screen.queryByText("Finalizar inventario")).not.toBeInTheDocument();
  });

  it("anula la sesión y navega de vuelta al historial", async () => {
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh: vi.fn() });
    mockApiFetch.mockResolvedValueOnce({});
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Anular inventario" }));
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/inventory-sessions/21", { method: "DELETE" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/inventory/history"));
  });

  it("muestra un error cuando la anulación falla", async () => {
    mockUseApiQuery.mockReturnValue({ data: buildSession(), loading: false, error: null, refresh: vi.fn() });
    mockApiFetch.mockRejectedValueOnce(new Error("No se pudo anular"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Anular inventario" }));
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo anular");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("no muestra acciones de edición cuando la sesión ya fue finalizada", () => {
    const session = buildSession({ status: "finalized", finalizedAt: "2026-09-03T12:00:00.000Z" });
    mockUseApiQuery.mockReturnValue({ data: session, loading: false, error: null, refresh: vi.fn() });
    renderPage();

    expect(screen.queryByRole("button", { name: "Escanear producto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular inventario" })).not.toBeInTheDocument();
  });
});
