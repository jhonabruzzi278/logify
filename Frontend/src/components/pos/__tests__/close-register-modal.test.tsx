import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CloseRegisterModal } from "@/components/pos/close-register-modal";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchByUrl(routes: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [path, body] of Object.entries(routes)) {
      if (url.includes(path)) return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse(null));
  });
}

const closeSummary = {
  date: "2026-08-04",
  summary: [
    { paymentMethod: "cash", count: 3, total: 9000 },
    { paymentMethod: "credit", count: 1, total: 2500 },
  ],
  grandTotal: 11500,
};

const emptyCloseSummary = { date: "2026-08-04", summary: [], grandTotal: 0 };

describe("CloseRegisterModal", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("muestra el desglose por método de pago y el total del día", async () => {
    mockFetchByUrl({ "/api/sales/close-summary": closeSummary, "/api/cash-sessions/active": null });

    render(<CloseRegisterModal onClose={() => {}} />);

    expect(await screen.findByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("Fiado")).toBeInTheDocument();
    expect(screen.getByText(/Total del día/i)).toBeInTheDocument();
  });

  it("muestra un mensaje cuando no hay ventas", async () => {
    mockFetchByUrl({ "/api/sales/close-summary": emptyCloseSummary, "/api/cash-sessions/active": null });

    render(<CloseRegisterModal onClose={() => {}} />);

    expect(await screen.findByText(/Sin ventas registradas hoy/i)).toBeInTheDocument();
  });

  it("sin sesión de caja activa, muestra el aviso de que es solo el resumen del día", async () => {
    mockFetchByUrl({ "/api/sales/close-summary": emptyCloseSummary, "/api/cash-sessions/active": null });

    render(<CloseRegisterModal onClose={() => {}} />);

    expect(await screen.findByText(/no tienes una caja abierta/i)).toBeInTheDocument();
  });

  it("con sesión activa, muestra el monto inicial y el formulario para cerrar", async () => {
    mockFetchByUrl({
      "/api/sales/close-summary": emptyCloseSummary,
      "/api/cash-sessions/active": { id: 1, opening_amount: "50000", opened_at: new Date().toISOString(), status: "open", vendor_id: "admin", vendor_name: "Admin" },
    });

    render(<CloseRegisterModal onClose={() => {}} />);

    expect(await screen.findByText("Monto inicial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar caja/i })).toBeInTheDocument();
  });

  it("llama a onClose al hacer clic en el botón de cerrar", async () => {
    mockFetchByUrl({ "/api/sales/close-summary": emptyCloseSummary, "/api/cash-sessions/active": null });
    const onClose = vi.fn();
    render(<CloseRegisterModal onClose={onClose} />);

    await waitFor(() => expect(screen.getByText(/Cierre de caja/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
