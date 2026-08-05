import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PriceCheckModal } from "@/components/pos/price-check-modal";
import type { Product } from "@/types/domain";

const products: Product[] = [
  { id: "1", sku: "COCA-2L", name: "Coca-Cola 2L", stock: 50, price: 2500, cost: 1900, category: "bebidas", status: "healthy", updatedAt: new Date().toISOString() },
  { id: "2", sku: "PAN-500", name: "Pan de molde 500g", stock: 20, price: 1800, cost: 1200, category: "otros", status: "healthy", updatedAt: new Date().toISOString() },
];

describe("PriceCheckModal", () => {
  it("no muestra resultados hasta que se escribe una búsqueda", () => {
    render(<PriceCheckModal products={products} onClose={() => {}} />);
    expect(screen.queryByText("Coca-Cola 2L")).not.toBeInTheDocument();
  });

  it("muestra el precio del producto encontrado sin agregarlo a ningún carrito", () => {
    render(<PriceCheckModal products={products} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/escanea o busca/i), { target: { value: "coca" } });

    expect(screen.getByText("Coca-Cola 2L")).toBeInTheDocument();
    expect(screen.getByText("$2.500")).toBeInTheDocument();
    expect(screen.queryByText("Pan de molde 500g")).not.toBeInTheDocument();
  });

  it("muestra 'Sin resultados' cuando no hay coincidencias", () => {
    render(<PriceCheckModal products={products} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/escanea o busca/i), { target: { value: "zzz" } });
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });
});
