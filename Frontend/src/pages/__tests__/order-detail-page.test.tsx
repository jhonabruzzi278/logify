import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrderDetailPage } from "@/pages/order-detail-page";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

const ORDER = {
  id: 1, customerId: 10, sku: "COCA-2L", quantity: 5, status: "EN_PREPARACION",
  createdAt: "2026-05-01T10:00:00Z", assignedTo: "luis.carvajal", cancelReason: null,
};

const COURIER = { id: 5, username: "luis.carvajal", name: "Luis Carvajal" };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchFor(couriers: unknown[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/couriers")) return Promise.resolve(jsonResponse(couriers));
    if (url.includes("/api/orders")) return Promise.resolve(jsonResponse([ORDER]));
    if (url.includes("/api/shipments/1")) return Promise.resolve(jsonResponse(null));
    if (url.includes("/api/notifications/order/1")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/orders/1"]}>
      <Routes>
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrderDetailPage — nombre del transportista real (no la lista de demo)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("resuelve el nombre del transportista contra /api/auth/couriers", async () => {
    globalThis.fetch = mockFetchFor([COURIER]);
    renderPage();
    expect(await screen.findByText(/Asignado a: Luis Carvajal/)).toBeInTheDocument();
  });

  it("si el transportista asignado no aparece en /api/auth/couriers, muestra su username tal cual", async () => {
    globalThis.fetch = mockFetchFor([]);
    renderPage();
    expect(await screen.findByText(/Asignado a: luis\.carvajal/)).toBeInTheDocument();
  });
});
