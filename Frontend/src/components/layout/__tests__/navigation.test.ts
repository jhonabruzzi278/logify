import { describe, it, expect } from "vitest";
import { getVisibleNavItems } from "@/components/layout/navigation";

describe("getVisibleNavItems", () => {
  it("en modo b2b muestra Pedidos pero no Punto de Venta", () => {
    const items = getVisibleNavItems("owner", "b2b").map((i) => i.title);
    expect(items).toContain("Pedidos");
    expect(items).not.toContain("Punto de Venta");
  });

  it("en modo b2c muestra Punto de Venta pero no Pedidos", () => {
    const items = getVisibleNavItems("owner", "b2c").map((i) => i.title);
    expect(items).toContain("Punto de Venta");
    expect(items).not.toContain("Pedidos");
  });

  it("los items 'both' (ej. Clientes, Inventario) se muestran en ambos modos", () => {
    const b2b = getVisibleNavItems("owner", "b2b").map((i) => i.title);
    const b2c = getVisibleNavItems("owner", "b2c").map((i) => i.title);
    expect(b2b).toContain("Clientes");
    expect(b2c).toContain("Clientes");
    expect(b2b).toContain("Inventario");
    expect(b2c).toContain("Inventario");
  });

  it("sigue respetando el filtro por permiso de rol dentro de cada modo", () => {
    const shipperItems = getVisibleNavItems("shipper", "b2c").map((i) => i.title);
    expect(shipperItems).not.toContain("Punto de Venta");
  });

  it("por defecto (sin mode) filtra como b2b", () => {
    const items = getVisibleNavItems("owner").map((i) => i.title);
    expect(items).toContain("Pedidos");
    expect(items).not.toContain("Punto de Venta");
  });
});
