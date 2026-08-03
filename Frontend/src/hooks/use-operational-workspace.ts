import { useCallback, useMemo } from "react";
import type { Order, Product, ProductCategory, Sale, Shipment, ShipmentStage } from "@/types/domain";
import { apiFetch } from "@/lib/api-client";

export type OrderDecisionType = "approved" | "rejected";

export interface OperationalOrder extends Order {
  operationalDecision: OrderDecisionType | null;
  operationalNote: string | null;
  operationalUpdatedAt: string | null;
  needsReview: boolean;
  canConfirm: boolean;
}

export interface OperationalProduct extends Product {
  stockDelta: number;
  lastAdjustmentReason: string | null;
  lastAdjustmentAt: string | null;
  isCustom: boolean;
}

export interface OperationalShipment extends Shipment {
  isManual: boolean;
  operationalNote: string | null;
  operationalUpdatedAt: string | null;
}

export interface OperationalActivity {
  id: string;
  type: "order" | "inventory" | "shipment";
  title: string;
  detail: string;
  createdAt: string;
  href: string;
}

export function useOperationalWorkspace({
  orders = [],
  inventory = [],
  shipments = []
}: {
  orders?: Order[];
  inventory?: Product[];
  shipments?: Shipment[];
}) {
  const safeOrders = orders ?? [];
  const safeInventory = inventory ?? [];
  const safeShipments = shipments ?? [];

  const operationalInventory = useMemo<OperationalProduct[]>(() => {
    return safeInventory.map((product) => ({
      ...product,
      stockDelta: 0,
      lastAdjustmentReason: null,
      lastAdjustmentAt: null,
      isCustom: false,
    }));
  }, [safeInventory]);

  const operationalOrders = useMemo<OperationalOrder[]>(() => {
    return safeOrders
      .map((order) => ({
        ...order,
        operationalDecision: null,
        operationalNote: null,
        operationalUpdatedAt: null,
        needsReview: order.stage === "created",
        canConfirm: order.stage === "created",
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [safeOrders]);

  const operationalShipments = useMemo<OperationalShipment[]>(() => {
    return safeShipments
      .map((shipment) => ({
        ...shipment,
        isManual: false,
        operationalNote: null,
        operationalUpdatedAt: null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [safeShipments]);

  const validationQueue = useMemo(() => operationalOrders.filter((o) => o.needsReview), [operationalOrders]);
  const dispatchQueue = useMemo(() => operationalOrders.filter((o) => o.canConfirm), [operationalOrders]);
  const stockQueue = useMemo(() => operationalInventory.filter((p) => p.stock <= 5), [operationalInventory]);

  const activities = useMemo<OperationalActivity[]>(() => {
    return safeOrders.slice(0, 4).map((o) => ({
      id: `order-${o.id}`,
      type: "order" as const,
      title: `Pedido ${o.id}`,
      detail: o.stage === "created" ? "Pendiente de confirmacion" :
              o.stage === "en_preparacion" ? "En preparacion" :
              o.stage === "en_reparto" ? "En reparto" :
              o.stage === "entregado" ? "Entregado" : "Cancelado",
      createdAt: o.createdAt,
      href: `/orders/${o.id}`,
    }));
  }, [safeOrders]);

  async function adjustInventory(product: Product, delta: number, _reason?: string) {
    await apiFetch(`/api/inventory/${encodeURIComponent(product.sku)}/adjust?delta=${delta}`, {
      method: "POST",
    });
  }

  async function addProduct(data: {
    sku: string; name: string; stock: number; price: number; cost: number; category: ProductCategory; imageUrl?: string;
    supplierId?: number | null; unitOfMeasure?: string; taxRate?: number; active?: boolean;
  }) {
    const response = await apiFetch("/api/inventory", {
      method: "POST",
      body: JSON.stringify({
        sku: data.sku.trim().toUpperCase().replace(/\s+/g, "-"),
        name: data.name.trim(),
        stock: data.stock,
        price: data.price,
        cost: data.cost,
        category: data.category,
        imageUrl: data.imageUrl || null,
        supplierId: data.supplierId ?? null,
        unitOfMeasure: data.unitOfMeasure ?? "unidad",
        taxRate: data.taxRate ?? 0,
        active: data.active ?? true,
      }),
    });
    return response;
  }

  async function deleteProduct(sku: string) {
    await apiFetch(`/api/inventory/${encodeURIComponent(sku)}`, {
      method: "DELETE",
    });
  }

  async function recordSale(sale: Sale) {
    await apiFetch("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        items: JSON.stringify(sale.items),
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        vendorId: sale.vendorId,
        vendorName: sale.vendorName,
        createdAt: new Date(sale.createdAt),
      }),
    });
  }

  async function getAllSales(): Promise<Sale[]> {
    try {
      const raw = await apiFetch<Array<{ id: number; items: string; total: number; paymentMethod: string; vendorId: string; vendorName: string; createdAt: string }>>("/api/sales");
      return raw.map((s) => ({
        id: `sale-${s.id}`,
        items: JSON.parse(s.items),
        total: s.total,
        paymentMethod: s.paymentMethod as Sale["paymentMethod"],
        vendorId: s.vendorId,
        vendorName: s.vendorName,
        createdAt: s.createdAt,
      }));
    } catch {
      return [];
    }
  }

  const memoizedGetAllSales = useCallback(getAllSales, []);

  async function confirmOrder(order: Order) {
    await apiFetch(`/api/orders/${order.id}/confirm`, { method: "PUT" });
  }

  async function cancelOrder(order: Order, reason: string) {
    await apiFetch(`/api/orders/${order.id}/cancel`, {
      method: "PUT",
      body: JSON.stringify({ reason }),
    });
  }

  async function validateOrder(order: Order, decision: OrderDecisionType, _note?: string) {
    const status = decision === "approved" ? "EN_PREPARACION" : "CANCELADO";
    await apiFetch(`/api/orders/${order.id}/status?status=${status}`, { method: "PUT" });
    if (decision === "approved") {
      try {
        await apiFetch("/api/shipments", {
          method: "POST",
          body: JSON.stringify({ orderId: Number(order.id), customerId: Number(order.customerId), sku: order.sku, quantity: order.quantity }),
        });
      } catch {
      }
    }
  }

  async function deleteOrder(orderId: string) {
    await apiFetch(`/api/orders/${orderId}`, { method: "DELETE" });
  }

  async function updateShipmentStage(shipment: Shipment, stage: ShipmentStage, _note?: string, proof?: { proofOfDeliveryImage?: string; recipientRut?: string; customerCode?: string }) {
    const body = proof ? JSON.stringify(proof) : undefined;
    await apiFetch(`/api/shipments/${shipment.id}/stage?stage=${stage}`, { method: "PUT", body });
  }

  return {
    operationalOrders,
    operationalInventory,
    operationalShipments,
    validationQueue,
    dispatchQueue,
    stockQueue,
    activities,
    validateOrder,
    confirmOrder,
    cancelOrder,
    adjustInventory,
    updateShipmentStage,
    recordSale,
    getAllSales: memoizedGetAllSales,
    addProduct,
    deleteProduct,
    deleteOrder,
  };
}
