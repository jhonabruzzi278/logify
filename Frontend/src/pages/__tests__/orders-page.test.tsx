import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OrdersPage } from "@/pages/orders-page";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

const ORDER = {
  id: 1, customerId: 10, sku: "COCA-2L", quantity: 5, status: "CREATED",
  createdAt: "2026-05-01T10:00:00Z", assignedTo: null, cancelReason: null,
};

const COURIER = { id: 5, username: "luis.carvajal", name: "Luis Carvajal" };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchFor(couriers: unknown[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/couriers")) return Promise.resolve(jsonResponse(couriers));
    if (url.includes("/api/customers")) return Promise.resolve(jsonResponse([{ id: 10, name: "Cliente Uno" }]));
    if (url.includes("/api/inventory")) return Promise.resolve(jsonResponse([]));
    if (url.includes("/api/orders")) return Promise.resolve(jsonResponse([ORDER]));
    return Promise.resolve(jsonResponse(null));
  });
}

describe("OrdersPage — transportistas reales (no datos de demo hardcodeados)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("el encabezado de la columna de acciones se muestra decodificado, sin entities HTML", async () => {
    globalThis.fetch = mockFetchFor([COURIER]);
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText("#1");
    expect(screen.getByRole("columnheader", { name: "Acción" })).toBeInTheDocument();
    expect(screen.queryByText(/Acci&oacute;n/)).not.toBeInTheDocument();
  });

  it("el selector para asignar transportista usa /api/auth/couriers, no la lista de demo", async () => {
    globalThis.fetch = mockFetchFor([COURIER]);
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText("#1");

    const assignSelect = await screen.findByDisplayValue("Asignar...");
    const optionNames = Array.from(assignSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionNames).toContain("Luis Carvajal");
  });

  it("no muestra ningun transportista para asignar si el backend no devuelve couriers reales", async () => {
    globalThis.fetch = mockFetchFor([]);
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText("#1");

    const assignSelect = await screen.findByDisplayValue("Asignar...");
    const optionNames = Array.from(assignSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionNames).toEqual(["Asignar..."]);
  });

  it("asignar un transportista real llama a la API con su username", async () => {
    const fetchMock = mockFetchFor([COURIER]);
    globalThis.fetch = fetchMock;
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText("#1");

    const assignSelect = await screen.findByDisplayValue("Asignar...");
    fireEvent.change(assignSelect, { target: { value: "luis.carvajal" } });

    await waitFor(() => {
      const assignCall = fetchMock.mock.calls.find(([url]: [unknown]) => String(url).includes("/assign?transporter="));
      expect(assignCall).toBeDefined();
      expect(String(assignCall![0])).toContain("transporter=luis.carvajal");
    });
  });
});
