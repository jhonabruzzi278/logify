import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePosCart } from "@/hooks/use-pos-cart";
import type { Product } from "@/types/domain";

const mockProduct: Product = {
  id: "1", sku: "COCA-2L", name: "Coca-Cola 2L", stock: 50, price: 2500, cost: 1900,
  category: "bebidas", status: "healthy", updatedAt: new Date().toISOString(),
};

describe("usePosCart", () => {
  beforeEach(() => { localStorage.clear(); });

  it("agrega un producto real al carrito", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addToCart(mockProduct, 1));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(2500);
  });

  it("agrega una línea manual (Agregar Monto) sin chocar con productos reales", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addToCart(mockProduct, 2));
    act(() => result.current.addManualAmount("Monto", 1000));

    expect(result.current.items).toHaveLength(2);
    const manualEntry = result.current.items.find((e) => e.isManualAmount);
    expect(manualEntry).toBeDefined();
    expect(manualEntry?.product.sku).not.toBe(mockProduct.sku);
    expect(result.current.total).toBe(2500 * 2 + 1000);
  });

  it("un descuento se agrega como línea manual con monto negativo", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addToCart(mockProduct, 1));
    act(() => result.current.addManualAmount("Descuento", -250));

    expect(result.current.total).toBe(2500 - 250);
    const saleItem = result.current.saleItems.find((i) => i.isManualAmount);
    expect(saleItem?.unitPrice).toBe(-250);
  });

  it("saleItems marca isManualAmount solo en las líneas manuales", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addToCart(mockProduct, 1));
    act(() => result.current.addManualAmount("Recargo", 200));

    const real = result.current.saleItems.find((i) => i.sku === mockProduct.sku);
    const manual = result.current.saleItems.find((i) => i.sku !== mockProduct.sku);
    expect(real?.isManualAmount).toBeUndefined();
    expect(manual?.isManualAmount).toBe(true);
  });

  it("dos líneas manuales con la misma etiqueta tienen cartId único pero comparten el sku (para verse igual en Reportes)", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addManualAmount("Monto", 500));
    act(() => result.current.addManualAmount("Monto", 500));

    const cartIds = result.current.items.map((e) => e.cartId);
    expect(new Set(cartIds).size).toBe(2);
    expect(result.current.items.every((e) => e.product.sku === "Monto")).toBe(true);
  });

  it("el sku de una línea manual es la etiqueta legible (para que Reportes muestre 'Descuento', no un id generado)", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addManualAmount("Descuento", -100));

    expect(result.current.saleItems[0].sku).toBe("Descuento");
    expect(result.current.saleItems[0].name).toBe("Descuento");
  });

  it("eliminar una línea manual por cartId no afecta a otra línea manual con la misma etiqueta", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addManualAmount("Monto", 500));
    act(() => result.current.addManualAmount("Monto", 700));
    const [first, second] = result.current.items;

    act(() => result.current.removeFromCart(first.cartId));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cartId).toBe(second.cartId);
    expect(result.current.total).toBe(700);
  });

  it("clearCart vacía tanto productos reales como líneas manuales", () => {
    const { result } = renderHook(() => usePosCart());
    act(() => result.current.addToCart(mockProduct, 1));
    act(() => result.current.addManualAmount("Monto", 500));
    act(() => result.current.clearCart());

    expect(result.current.items).toHaveLength(0);
    expect(result.current.total).toBe(0);
  });
});
