import { describe, it, expect } from "vitest";
import { isWeightOrVolumeProduct, roundToNearest50, lineSubtotal } from "@/lib/pos-pricing";
import type { Product } from "@/types/domain";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "1", sku: "SKU-1", name: "Producto", stock: 10, price: 1000, cost: 700,
    category: "otros", status: "healthy", updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isWeightOrVolumeProduct", () => {
  it.each(["kg", "g", "l", "ml"])("retorna true para unidad de medida %s", (unit) => {
    expect(isWeightOrVolumeProduct(makeProduct({ unitOfMeasure: unit }))).toBe(true);
  });

  it("retorna false para 'unidad'", () => {
    expect(isWeightOrVolumeProduct(makeProduct({ unitOfMeasure: "unidad" }))).toBe(false);
  });

  it("retorna false cuando unitOfMeasure no esta definido", () => {
    expect(isWeightOrVolumeProduct(makeProduct({ unitOfMeasure: undefined }))).toBe(false);
  });
});

describe("roundToNearest50", () => {
  it("redondea hacia arriba al múltiplo de 50 más cercano", () => {
    expect(roundToNearest50(1234)).toBe(1250);
  });

  it("redondea hacia abajo al múltiplo de 50 más cercano", () => {
    expect(roundToNearest50(1210)).toBe(1200);
  });

  it("no cambia un valor ya múltiplo de 50", () => {
    expect(roundToNearest50(1500)).toBe(1500);
  });

  it("un empate exacto en el punto medio redondea hacia arriba", () => {
    expect(roundToNearest50(1225)).toBe(1250);
  });
});

describe("lineSubtotal", () => {
  it("no redondea cuando roundWeightSubtotals es false, sin importar la unidad", () => {
    const product = makeProduct({ price: 1234, unitOfMeasure: "kg" });
    expect(lineSubtotal(product, 1, false)).toBe(1234);
  });

  it("redondea el subtotal de un producto por peso cuando roundWeightSubtotals es true", () => {
    const product = makeProduct({ price: 1234, unitOfMeasure: "kg" });
    expect(lineSubtotal(product, 1, true)).toBe(1250);
  });

  it("no redondea un producto por unidad aunque roundWeightSubtotals sea true", () => {
    const product = makeProduct({ price: 1234, unitOfMeasure: "unidad" });
    expect(lineSubtotal(product, 1, true)).toBe(1234);
  });

  it("aplica el redondeo sobre precio * cantidad, no solo sobre el precio unitario", () => {
    const product = makeProduct({ price: 411, unitOfMeasure: "g" });
    // 411 * 3 = 1233 -> redondeado a 1250
    expect(lineSubtotal(product, 3, true)).toBe(1250);
  });
});
