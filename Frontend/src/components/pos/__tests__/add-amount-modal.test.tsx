import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddAmountModal } from "@/components/pos/add-amount-modal";

describe("AddAmountModal", () => {
  it("rechaza un monto vacío sin llamar a onAdd", async () => {
    const onAdd = vi.fn();
    render(<AddAmountModal onAdd={onAdd} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText(/ingresa un monto mayor a 0/i)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("confirma con nombre por defecto 'Varios' y el monto ingresado", () => {
    const onAdd = vi.fn();
    render(<AddAmountModal onAdd={onAdd} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(onAdd).toHaveBeenCalledWith("Varios", 1500);
  });

  it("usa el nombre personalizado si se cambia", () => {
    const onAdd = vi.fn();
    render(<AddAmountModal onAdd={onAdd} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Varios"), { target: { value: "Envoltorio" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(onAdd).toHaveBeenCalledWith("Envoltorio", 300);
  });

  it("llama a onClose al hacer clic en el botón de cerrar", () => {
    const onClose = vi.fn();
    render(<AddAmountModal onAdd={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
