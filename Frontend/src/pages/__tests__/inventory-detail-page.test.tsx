import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InventoryDetailPage } from "@/pages/inventory-detail-page";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

const PRODUCT = {
  id: 1, sku: "COCA-2L", name: "Coca-Cola 2L", stock: 50, price: 2500, cost: 1900,
  category: "bebidas", supplier_id: null, unit_of_measure: "unidad", tax_rate: 19, active: true, image_url: null,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchFor(settings: Partial<Record<string, boolean>>) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/settings/system")) return Promise.resolve(jsonResponse(settings));
    if (url.includes("/api/inventory/COCA-2L")) return Promise.resolve(jsonResponse(PRODUCT));
    if (url.includes("/api/suppliers")) return Promise.resolve(jsonResponse([]));
    if (url.includes("/api/orders")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
}

function renderDetailPage() {
  return render(
    <MemoryRouter initialEntries={["/inventory/COCA-2L"]}>
      <Routes>
        <Route path="/inventory/:productId" element={<InventoryDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("InventoryDetailPage — buscador de imagen (toggle productImagesEnabled)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("muestra la seccion de imagen del producto cuando el toggle esta activo", async () => {
    globalThis.fetch = mockFetchFor({ productImagesEnabled: true });
    renderDetailPage();
    await screen.findByText("SKU COCA-2L");
    expect(await screen.findByText("Imagen del producto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buscar imagen/i })).toBeInTheDocument();
  });

  it("no muestra la seccion de imagen cuando el toggle esta apagado", async () => {
    globalThis.fetch = mockFetchFor({ productImagesEnabled: false });
    renderDetailPage();
    await screen.findByText("SKU COCA-2L");
    await waitFor(() => expect(screen.queryByText("Imagen del producto")).not.toBeInTheDocument());
  });
});
