import { describe, expect, it } from "vitest";
import {
  getMonthlyShipments,
  getMonthlyShipmentStats,
  groupShipmentsByDay,
} from "@/lib/calendar-shipments";
import type { Shipment } from "@/types/domain";

function shipment(id: string, createdAt: string, stage: Shipment["stage"] = "en_preparacion"): Shipment {
  return {
    id,
    orderId: `order-${id}`,
    customerId: "customer-1",
    sku: "SKU-1",
    quantity: 1,
    carrier: "Carrier",
    tracking: `TRACK-${id}`,
    stage,
    eta: null,
    createdAt,
    shippedAt: null,
  };
}

describe("calendar shipments", () => {
  it("agrupa exclusivamente los envios recibidos desde la API", () => {
    const shipments = [
      shipment("real-10", "2026-08-10T12:00:00.000Z"),
      shipment("real-13", "2026-08-13T12:00:00.000Z"),
      shipment("other-month", "2026-09-10T12:00:00.000Z"),
    ];

    const grouped = groupShipmentsByDay(shipments, 2026, 7);

    expect([...grouped.keys()]).toEqual([10, 13]);
    expect([...grouped.values()].flat().map(({ id }) => id)).toEqual(["real-10", "real-13"]);
  });

  it("calcula estadisticas solo para el mes seleccionado", () => {
    const shipments = [
      shipment("active", "2026-08-03T12:00:00.000Z"),
      shipment("delivered", "2026-08-04T12:00:00.000Z", "entregado"),
      shipment("cancelled", "2026-08-05T12:00:00.000Z", "cancelado"),
      shipment("other-month", "2026-09-06T12:00:00.000Z", "entregado"),
    ];

    const monthlyShipments = getMonthlyShipments(shipments, 2026, 7);

    expect(getMonthlyShipmentStats(monthlyShipments)).toEqual({
      total: 3,
      active: 1,
      delivered: 1,
    });
  });
});
