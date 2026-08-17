import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PosPage } from "@/pages/pos-page";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "vendedor1", name: "Vendedor Uno", role: "vendor", expiresAt: Date.now() + 1000000 } }),
}));

const PRODUCT = { id: 1, sku: "COCA-2L", name: "Coca-Cola 2L", stock: 50, price: 2500, cost: 1900, category: "bebidas" };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchFor(settings: Partial<Record<string, boolean>>, activeCashSession: unknown = null) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/settings/system")) return Promise.resolve(jsonResponse(settings));
    if (url.includes("/api/cash-sessions/active")) return Promise.resolve(jsonResponse(activeCashSession));
    if (url.includes("/api/inventory/indicadores")) return Promise.resolve(jsonResponse({ uf: { valor: null, fecha: null }, dolar: { valor: null, fecha: null }, utm: { valor: null, fecha: null } }));
    if (url.includes("/api/inventory")) return Promise.resolve(jsonResponse([PRODUCT]));
    if (url.includes("/api/customers")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
}

describe("PosPage — caja obligatoria (toggle cashRegisterEnabled)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("bloquea 'Cobrar' y muestra aviso cuando la caja esta habilitada pero no hay sesion abierta", async () => {
    globalThis.fetch = mockFetchFor({ cashRegisterEnabled: true }, null);
    render(<PosPage />);

    fireEvent.click(await screen.findByText("Coca-Cola 2L"));

    const cobrarButton = await screen.findByRole("button", { name: /Cobrar/i });
    expect(cobrarButton).toBeDisabled();
    expect(screen.getByText("Abre la caja para poder registrar ventas.")).toBeInTheDocument();
  });

  it("permite cobrar cuando la caja esta habilitada y hay una sesion abierta", async () => {
    globalThis.fetch = mockFetchFor({ cashRegisterEnabled: true }, { id: 1, vendor_id: "vendedor1", opening_amount: 10000, opened_at: new Date().toISOString(), closed_at: null, status: "open" });
    render(<PosPage />);

    fireEvent.click(await screen.findByText("Coca-Cola 2L"));

    const cobrarButton = await screen.findByRole("button", { name: /Cobrar/i });
    expect(cobrarButton).toBeEnabled();
    expect(screen.queryByText("Abre la caja para poder registrar ventas.")).not.toBeInTheDocument();
  });

  it("no bloquea el cobro cuando el toggle esta apagado, sin sesion de caja (comportamiento previo)", async () => {
    globalThis.fetch = mockFetchFor({ cashRegisterEnabled: false }, null);
    render(<PosPage />);

    fireEvent.click(await screen.findByText("Coca-Cola 2L"));

    const cobrarButton = await screen.findByRole("button", { name: /Cobrar/i });
    expect(cobrarButton).toBeEnabled();
  });
});

describe("PosPage — motivo al eliminar (toggle requireDeleteReason)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("pide un motivo antes de quitar un producto del carrito cuando el toggle esta activo", async () => {
    globalThis.fetch = mockFetchFor({ requireDeleteReason: true });
    render(<PosPage />);

    fireEvent.click(await screen.findByText("Coca-Cola 2L"));
    await screen.findByText("Carrito");

    const removeButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-x"));
    fireEvent.click(removeButtons[0]);

    expect(await screen.findByText("Quitar producto")).toBeInTheDocument();
    const quitarButton = screen.getByRole("button", { name: "Quitar" });
    expect(quitarButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Ej: cliente cambió de opinión"), { target: { value: "cliente se arrepintió" } });
    expect(quitarButton).toBeEnabled();
    fireEvent.click(quitarButton);

    await waitFor(() => expect(screen.queryByText("Quitar producto")).not.toBeInTheDocument());
    expect(screen.queryByText("Coca-Cola 2L", { selector: "p.font-medium" })).not.toBeInTheDocument();
  });

  it("quita el producto directamente, sin modal, cuando el toggle esta apagado", async () => {
    globalThis.fetch = mockFetchFor({ requireDeleteReason: false });
    render(<PosPage />);

    fireEvent.click(await screen.findByText("Coca-Cola 2L"));
    await screen.findByText("Carrito");

    const removeButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-x"));
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByText("Quitar producto")).not.toBeInTheDocument();
  });
});
