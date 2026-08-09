import type { Shipment } from "@/types/domain";

export function getMonthlyShipments(shipments: Shipment[], year: number, month: number) {
  return shipments.filter((shipment) => {
    const date = new Date(shipment.createdAt ?? shipment.shippedAt ?? "");
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

export function groupShipmentsByDay(shipments: Shipment[], year: number, month: number) {
  const shipmentsByDay = new Map<number, Shipment[]>();

  getMonthlyShipments(shipments, year, month).forEach((shipment) => {
    const day = new Date(shipment.createdAt ?? shipment.shippedAt ?? "").getDate();
    const dailyShipments = shipmentsByDay.get(day) ?? [];
    dailyShipments.push(shipment);
    shipmentsByDay.set(day, dailyShipments);
  });

  return shipmentsByDay;
}

export function getMonthlyShipmentStats(shipments: Shipment[]) {
  return {
    total: shipments.length,
    active: shipments.filter((shipment) => shipment.stage !== "entregado" && shipment.stage !== "cancelado").length,
    delivered: shipments.filter((shipment) => shipment.stage === "entregado").length,
  };
}
