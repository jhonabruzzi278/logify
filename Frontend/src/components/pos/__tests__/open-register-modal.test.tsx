import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OpenRegisterModal } from "@/components/pos/open-register-modal";

describe("OpenRegisterModal", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rechaza un monto vacío sin llamar a la API", async () => {
    globalThis.fetch = vi.fn();
    render(<OpenRegisterModal onOpened={() => {}} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByText(/ingresa un monto válido/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("abre la caja con un monto válido y llama a onOpened", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, opening_amount: "50000", status: "open" }), { status: 201, headers: { "Content-Type": "application/json" } })
    );
    const onOpened = vi.fn();
    render(<OpenRegisterModal onOpened={onOpened} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("50000"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /abrir caja/i }));

    await waitFor(() => expect(onOpened).toHaveBeenCalled());
  });

  it("llama a onClose al hacer clic en el botón de cerrar", () => {
    const onClose = vi.fn();
    render(<OpenRegisterModal onOpened={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
