import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPage } from "@/pages/notifications-page";

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
    if (url.includes("/api/shipments")) return Promise.resolve(jsonResponse([]));
    if (url.includes("/api/notifications/audience/OPERATOR")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
}

describe("NotificationsPage — notificacion de transportista asignado usa datos reales", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("resuelve el nombre del transportista contra /api/auth/couriers en la notificacion de asignacion", async () => {
    globalThis.fetch = mockFetchFor([COURIER]);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(await screen.findByText(/Transportista Luis Carvajal asignado al pedido\./)).toBeInTheDocument();
  });

  it("si el transportista no esta en /api/auth/couriers, muestra su username en la notificacion", async () => {
    globalThis.fetch = mockFetchFor([]);
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(await screen.findByText(/Transportista luis\.carvajal asignado al pedido\./)).toBeInTheDocument();
  });
});
