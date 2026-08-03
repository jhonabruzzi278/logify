import { describe, it, expect } from "vitest";
import {
  adaptOrder, adaptInventory, adaptShipment, adaptNotifications, adaptCustomer, adaptSupplier,
  normalizeOrderStage, normalizeShipmentStage, calculateHealthFromStock, normalizeIntegrationHealth
} from "@/lib/api-adapters";
import type { ApiOrder, ApiInventory, ApiShipment, ApiNotificationRecord, ApiCustomer } from "@/types/api";

describe("normalizeOrderStage", () => {
  it("normaliza estados conocidos", () => {
    expect(normalizeOrderStage("CREATED")).toBe("created");
    expect(normalizeOrderStage("EN_PREPARACION")).toBe("en_preparacion");
    expect(normalizeOrderStage("EN_REPARTO")).toBe("en_reparto");
    expect(normalizeOrderStage("ENTREGADO")).toBe("entregado");
    expect(normalizeOrderStage("CANCELADO")).toBe("cancelado");
  });
  it("variantes parciales", () => {
    expect(normalizeOrderStage("cancel")).toBe("cancelado");
    expect(normalizeOrderStage("reject")).toBe("cancelado");
  });
  it("fallback a created", () => {
    expect(normalizeOrderStage("DESCONOCIDO")).toBe("created");
  });
});

describe("normalizeShipmentStage", () => {
  it("normaliza estados", () => {
    expect(normalizeShipmentStage("EN_PREPARACION")).toBe("en_preparacion");
    expect(normalizeShipmentStage("EN_REPARTO")).toBe("en_reparto");
    expect(normalizeShipmentStage("ENTREGADO")).toBe("entregado");
    expect(normalizeShipmentStage("CANCELADO")).toBe("cancelado");
    expect(normalizeShipmentStage("deliver")).toBe("entregado");
  });
  it("fallback a en_preparacion", () => {
    expect(normalizeShipmentStage("UNKNOWN")).toBe("en_preparacion");
  });
});

describe("calculateHealthFromStock", () => {
  it("critical si <= 0", () => {
    expect(calculateHealthFromStock(0)).toBe("critical");
    expect(calculateHealthFromStock(-5)).toBe("critical");
  });
  it("warning entre 1 y 5", () => {
    expect(calculateHealthFromStock(1)).toBe("warning");
    expect(calculateHealthFromStock(5)).toBe("warning");
  });
  it("healthy > 5", () => {
    expect(calculateHealthFromStock(6)).toBe("healthy");
    expect(calculateHealthFromStock(100)).toBe("healthy");
  });
});

describe("adaptOrder", () => {
  const apiOrder: ApiOrder = {
    id: 1, customerId: 10, sku: "COCA-2L", quantity: 5,
    status: "EN_PREPARACION", createdAt: "2026-05-01T10:00:00Z",
    assignedTo: "Luis Castro", cancelReason: null
  };
  it("convierte campos correctamente", () => {
    const r = adaptOrder(apiOrder, "Bar El Rincon");
    expect(r.id).toBe("1");
    expect(r.customer).toBe("Bar El Rincon");
    expect(r.customerId).toBe("10");
    expect(r.sku).toBe("COCA-2L");
    expect(r.quantity).toBe(5);
    expect(r.stage).toBe("en_preparacion");
    expect(r.assignedTo).toBe("Luis Castro");
  });
  it("nombre por defecto sin customerName", () => {
    expect(adaptOrder(apiOrder).customer).toBe("Cliente #10");
  });
  it("items inicializados", () => {
    const r = adaptOrder(apiOrder);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].sku).toBe("COCA-2L");
  });
  it("timeline vacio y eta null", () => {
    const r = adaptOrder(apiOrder);
    expect(r.timeline).toEqual([]);
    expect(r.eta).toBeNull();
  });
  it("fecha actual si createdAt null", () => {
    const r = adaptOrder({ ...apiOrder, createdAt: null });
    expect(r.createdAt).toBeTruthy();
  });
});

describe("adaptInventory", () => {
  const api: ApiInventory = {
    id: 5, sku: "COCA-2L", name: "Coca-Cola 2L",
    stock: 48, price: 2200, cost: 1500, category: "bebidas"
  };
  it("convierte campos", () => {
    const r = adaptInventory(api);
    expect(r.id).toBe("5");
    expect(r.sku).toBe("COCA-2L");
    expect(r.name).toBe("Coca-Cola 2L");
    expect(r.stock).toBe(48);
    expect(r.price).toBe(2200);
    expect(r.category).toBe("bebidas");
  });
  it("status healthy con stock > 5", () => {
    expect(adaptInventory({ ...api, stock: 50 }).status).toBe("healthy");
  });
  it("status warning con stock 1-5", () => {
    expect(adaptInventory({ ...api, stock: 3 }).status).toBe("warning");
  });
  it("status critical con stock 0", () => {
    expect(adaptInventory({ ...api, stock: 0 }).status).toBe("critical");
  });
});

describe("adaptShipment", () => {
  const api: ApiShipment = {
    id: 3, orderId: 10, customerId: 5, sku: 100001, quantity: 5,
    status: "EN_REPARTO", trackingNumber: "TRACK-12345678",
    createdAt: "2026-05-27T18:00:00Z", shippedAt: "2026-05-28T09:00:00Z",
    proofOfDeliveryImage: null, recipientRut: null, customerCode: null
  };
  it("convierte campos", () => {
    const r = adaptShipment(api);
    expect(r.id).toBe("3");
    expect(r.orderId).toBe("10");
    expect(r.stage).toBe("en_reparto");
    expect(r.tracking).toBe("TRACK-12345678");
    expect(r.carrier).toBe("Transportista asignado");
  });
  it("carrier pendiente sin tracking", () => {
    const r = adaptShipment({ ...api, trackingNumber: null });
    expect(r.carrier).toBe("Pendiente de asignacion");
    expect(r.tracking).toBe("Pendiente");
  });
  it("exception si cancelado", () => {
    const r = adaptShipment({ ...api, status: "CANCELADO" });
    expect(r.stage).toBe("cancelado");
    expect(r.exception).toBe("Envio cancelado");
  });
});

describe("adaptNotifications", () => {
  const records: ApiNotificationRecord[] = [
    { id: 1, eventId: "evt-001", orderId: 10, customerId: 5, stage: "Pedido creado", status: "up",
      message: "OK", targetAudience: "OPERATOR", sourceService: "orders-service",
      occurredAt: "2026-05-27T18:00:00Z", receivedAt: "2026-05-27T18:00:01Z" },
    { id: 2, eventId: "evt-002", orderId: 10, customerId: 5, stage: "Stock validado", status: "ok",
      message: "OK", targetAudience: "OPERATOR", sourceService: "inventory-service",
      occurredAt: "2026-05-27T18:01:00Z", receivedAt: "2026-05-27T18:01:01Z" },
  ];
  it("convierte a TimelineEvent[]", () => {
    const r = adaptNotifications(records);
    expect(r).toHaveLength(2);
    expect(r[0].title).toBe("Pedido creado");
  });
  it("ordena por occurredAt ascendente", () => {
    const r = adaptNotifications(records);
    expect(new Date(r[0].timestamp).getTime()).toBeLessThan(new Date(r[1].timestamp).getTime());
  });
  it("incluye sourceService en detail", () => {
    const r = adaptNotifications(records);
    expect(r[0].detail).toContain("orders-service");
  });
  it("array vacio sin entradas", () => {
    expect(adaptNotifications([])).toEqual([]);
  });
});

describe("adaptCustomer", () => {
  const api: ApiCustomer = {
    id: 1, name: "Bar El Rincon", phone: "+56912345678",
    address: "Av. Principal 123", email: "contacto@elrincon.cl",
    createdAt: "2026-01-15T10:00:00Z"
  };
  it("convierte campos", () => {
    const r = adaptCustomer(api);
    expect(r.id).toBe("1");
    expect(r.name).toBe("Bar El Rincon");
    expect(r.phone).toBe("+56912345678");
    expect(r.email).toBe("contacto@elrincon.cl");
  });
  it("campos opcionales nulos", () => {
    const r = adaptCustomer({ id: 2, name: "Kiosco", phone: null, address: null, email: null, createdAt: null });
    expect(r.phone).toBeUndefined();
    expect(r.email).toBeUndefined();
    expect(r.province).toBeNull();
  });
  it("convierte provincia cuando viene informada", () => {
    const r = adaptCustomer({ ...api, province: "Santiago" });
    expect(r.province).toBe("Santiago");
  });
});

describe("adaptSupplier", () => {
  it("convierte campos de proveedor", () => {
    const r = adaptSupplier({ id: 1, name: "Distribuidora Andes", rut: "76.123.456-7", phone: "+56912345678", email: "ventas@andes.cl", address: "Ruta 5 Km 10", active: true });
    expect(r.id).toBe("1");
    expect(r.name).toBe("Distribuidora Andes");
    expect(r.active).toBe(true);
  });
  it("campos opcionales nulos", () => {
    const r = adaptSupplier({ id: 2, name: "Proveedor X", rut: null, phone: null, email: null, address: null, active: false });
    expect(r.rut).toBeNull();
    expect(r.active).toBe(false);
  });
});

describe("adaptInventory campos ampliados", () => {
  it("incluye proveedor, unidad, IVA y variante", () => {
    const r = adaptInventory({
      id: 1, sku: "POLERA-M", name: "Polera Talla M", stock: 10, price: 9990, cost: 4000, category: "otros",
      supplier_id: 3, unit_of_measure: "unidad", tax_rate: 19, price_includes_tax: true, active: true,
      parent_sku: "POLERA", variant_label: "Talla M"
    });
    expect(r.supplierId).toBe(3);
    expect(r.unitOfMeasure).toBe("unidad");
    expect(r.taxRate).toBe(19);
    expect(r.parentSku).toBe("POLERA");
    expect(r.variantLabel).toBe("Talla M");
  });
  it("valores por defecto cuando no vienen", () => {
    const r = adaptInventory({ id: 2, sku: "SKU-2", name: "X", stock: 1, price: 100, cost: 50, category: "otros" });
    expect(r.unitOfMeasure).toBe("unidad");
    expect(r.active).toBe(true);
    expect(r.parentSku).toBeNull();
  });
});

describe("normalizeIntegrationHealth", () => {
  it("up -> healthy", () => expect(normalizeIntegrationHealth("up")).toBe("healthy"));
  it("warn -> warning", () => expect(normalizeIntegrationHealth("warn")).toBe("warning"));
  it("offline -> offline", () => expect(normalizeIntegrationHealth("offline")).toBe("offline"));
  it("desconocido -> critical", () => expect(normalizeIntegrationHealth("x")).toBe("critical"));
});
