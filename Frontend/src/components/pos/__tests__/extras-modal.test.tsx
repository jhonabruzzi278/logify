import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtrasModal } from "@/components/pos/extras-modal";

describe("ExtrasModal", () => {
  it("aplica un descuento porcentual como monto negativo", () => {
    const onApply = vi.fn();
    render(<ExtrasModal subtotal={2000} onApply={onApply} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("10"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /aplicar descuento/i }));

    expect(onApply).toHaveBeenCalledWith("Descuento", -200);
  });

  it("aplica un recargo de monto fijo como monto positivo", () => {
    const onApply = vi.fn();
    render(<ExtrasModal subtotal={2000} onApply={onApply} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Recargo" }));
    fireEvent.click(screen.getByRole("button", { name: "Monto fijo" }));
    fireEvent.change(screen.getByPlaceholderText("1000"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /aplicar recargo/i }));

    expect(onApply).toHaveBeenCalledWith("Recargo", 500);
  });

  it("rechaza un porcentaje mayor a 100", async () => {
    const onApply = vi.fn();
    render(<ExtrasModal subtotal={2000} onApply={onApply} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("10"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /aplicar descuento/i }));

    expect(await screen.findByText(/no puede ser mayor a 100/i)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("rechaza un valor vacío o 0", async () => {
    const onApply = vi.fn();
    render(<ExtrasModal subtotal={2000} onApply={onApply} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /aplicar descuento/i }));

    expect(await screen.findByText(/ingresa un valor mayor a 0/i)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
