import type { ApiCashSession, ApiCustomer, ApiCustomerCredit, ApiInventory, ApiNotificationRecord, ApiOrder, ApiPurchase, ApiShipment, ApiSupplier } from "@/types/api";
import type { CashSession, Customer, CustomerCredit, HealthState, Order, OrderStage, Product, Purchase, Shipment, ShipmentStage, Supplier, TimelineEvent } from "@/types/domain";

type StatusMap<T extends string> = readonly (readonly [string, T])[];

const ORDER_STAGE_MAP: StatusMap<OrderStage> = [
  ["preparacion", "en_preparacion"],
  ["EN_PREPARACION", "en_preparacion"],
  ["reparto", "en_reparto"],
  ["EN_REPARTO", "en_reparto"],
  ["entregado", "entregado"],
  ["ENTREGADO", "entregado"],
  ["cancelado", "cancelado"],
  ["CANCELADO", "cancelado"],
  ["cancel", "cancelado"],
  ["reject", "cancelado"]
];

const SHIPMENT_STAGE_MAP: StatusMap<ShipmentStage> = [
  ["preparacion", "en_preparacion"],
  ["EN_PREPARACION", "en_preparacion"],
  ["reparto", "en_reparto"],
  ["EN_REPARTO", "en_reparto"],
  ["entregado", "entregado"],
  ["ENTREGADO", "entregado"],
  ["cancelado", "cancelado"],
  ["CANCELADO", "cancelado"],
  ["cancel", "cancelado"],
  ["deliver", "entregado"]
];

const HEALTH_MAP: StatusMap<HealthState> = [
  ["up", "healthy"],
  ["ok", "healthy"],
  ["healthy", "healthy"],
  ["warn", "warning"],
  ["degrad", "warning"],
  ["offline", "offline"]
];

const normalizeFromMap = <T extends string>(maps: StatusMap<T>, fallback: T) => (status: string): T => {
  const normalized = status.toLowerCase();
  for (const [keyword, stage] of maps) {
    if (normalized.includes(keyword)) return stage;
  }
  return fallback;
};

export const normalizeOrderStage = normalizeFromMap(ORDER_STAGE_MAP, "created");
export const normalizeShipmentStage = normalizeFromMap(SHIPMENT_STAGE_MAP, "en_preparacion");
export const normalizeHealth = normalizeFromMap(HEALTH_MAP, "critical");

export function calculateHealthFromStock(stock: number): HealthState {
  if (stock <= 0) return "critical";
  if (stock <= 5) return "warning";
  return "healthy";
}

type SnakeOrder = Record<string, unknown> & {
  id: number;
  customer_id?: number;
  customerId?: number;
  customer_name?: string | null;
  customerName?: string | null;
  sku: string;
  quantity: number;
  status: string;
  created_at?: string | null;
  createdAt?: string | null;
  assigned_to?: string | null;
  assignedTo?: string | null;
  cancel_reason?: string | null;
  cancelReason?: string | null;
  client_code?: string | null;
  clientCode?: string | null;
};

function readOrderField(order: SnakeOrder): {
  id: number;
  customerId: number;
  customerName: string | null;
  sku: string;
  quantity: number;
  status: string;
  createdAt: string | null;
  assignedTo: string | null;
  cancelReason: string | null;
  clientCode: string | null;
} {
  return {
    id: order.id,
    customerId: (order.customerId ?? order.customer_id ?? 0) as number,
    customerName: (order.customerName ?? order.customer_name ?? null) as string | null,
    sku: order.sku,
    quantity: order.quantity,
    status: order.status,
    createdAt: (order.createdAt ?? order.created_at ?? null) as string | null,
    assignedTo: (order.assignedTo ?? order.assigned_to ?? null) as string | null,
    cancelReason: (order.cancelReason ?? order.cancel_reason ?? null) as string | null,
    clientCode: (order.clientCode ?? order.client_code ?? null) as string | null,
  };
}

export function adaptOrder(apiOrder: ApiOrder, customerName?: string): Order {
  const f = readOrderField(apiOrder as unknown as SnakeOrder);
  return {
    id: String(f.id),
    customer: customerName ?? f.customerName ?? `Cliente #${f.customerId}`,
    customerId: String(f.customerId),
    source: "Sincronizacion BD",
    stage: normalizeOrderStage(f.status),
    sku: String(f.sku),
    quantity: f.quantity,
    createdAt: f.createdAt ?? new Date().toISOString(),
    eta: null,
    items: [
      {
        sku: String(f.sku),
        name: String(f.sku),
        quantity: f.quantity
      }
    ],
    timeline: [],
    assignedTo: f.assignedTo ?? undefined,
    cancelReason: f.cancelReason ?? null,
    clientCode: f.clientCode ?? null,
  };
}

type SnakeInventory = Record<string, unknown> & {
  id: number;
  sku: string;
  name?: string | null;
  stock: number;
  price?: number | null;
  cost?: number | null;
  category?: string | null;
};

const DEFAULT_PRODUCT_NAMES: Record<string, string> = {
  "LAPTOP-HP-15": "Laptop HP 15\"",
  "MONITOR-DELL-24": "Monitor Dell 24\"",
  "TECLADO-LOGI": "Teclado Logitech",
  "MOUSE-LOGI": "Mouse Logitech",
  "COCA-COLA-2L": "Coca-Cola 2L",
  "SPRITE-2L": "Sprite 2L",
  "DORITOS-180G": "Doritos 180g",
  "M&M-200G": "M&M 200g",
  "ACEITE-CRISTAL-1L": "Aceite Cristal 1L",
  "ARROZ-1KG": "Arroz 1Kg",
  "FIDEOS-400G": "Fideos 400g",
  "AZUCAR-1KG": "Azucar 1Kg",
};

const DEFAULT_CATEGORIES: Record<string, Product["category"]> = {
  "LAPTOP-HP-15": "otros",
  "MONITOR-DELL-24": "otros",
  "TECLADO-LOGI": "otros",
  "MOUSE-LOGI": "otros",
  "COCA-COLA-2L": "bebidas",
  "SPRITE-2L": "bebidas",
  "DORITOS-180G": "galletas",
  "M&M-200G": "dulces",
  "ACEITE-CRISTAL-1L": "otros",
  "ARROZ-1KG": "otros",
  "FIDEOS-400G": "otros",
  "AZUCAR-1KG": "otros",
};

const DEFAULT_PRICES: Record<string, number> = {
  "LAPTOP-HP-15": 450000,
  "MONITOR-DELL-24": 180000,
  "TECLADO-LOGI": 25000,
  "MOUSE-LOGI": 15000,
  "COCA-COLA-2L": 2200,
  "SPRITE-2L": 2000,
  "DORITOS-180G": 1200,
  "M&M-200G": 1800,
  "ACEITE-CRISTAL-1L": 3500,
  "ARROZ-1KG": 1800,
  "FIDEOS-400G": 1100,
  "AZUCAR-1KG": 1500,
};

export function adaptInventory(apiInventory: ApiInventory): Product {
  const inv = apiInventory as unknown as SnakeInventory;
  const name = (inv.name as string) || DEFAULT_PRODUCT_NAMES[inv.sku] || inv.sku;
  const price = (inv.price as number) ?? DEFAULT_PRICES[inv.sku] ?? 0;
  const cost = (inv.cost as number) ?? Math.round(price * 0.65);
  const cat = ((inv.category as string) || DEFAULT_CATEGORIES[inv.sku] || "otros") as Product["category"];
  return {
    id: String(inv.id),
    sku: inv.sku,
    name,
    stock: inv.stock,
    price,
    cost,
    category: cat,
    status: calculateHealthFromStock(inv.stock),
    updatedAt: new Date().toISOString(),
    imageUrl: (inv.image_url as string) || null,
    supplierId: apiInventory.supplier_id ?? null,
    unitOfMeasure: apiInventory.unit_of_measure ?? "unidad",
    taxRate: apiInventory.tax_rate ?? 0,
    priceIncludesTax: apiInventory.price_includes_tax ?? true,
    active: apiInventory.active ?? true,
    parentSku: apiInventory.parent_sku ?? null,
    variantLabel: apiInventory.variant_label ?? null,
  };
}

export function adaptSupplier(apiSupplier: ApiSupplier): Supplier {
  return {
    id: String(apiSupplier.id),
    name: apiSupplier.name,
    rut: apiSupplier.rut ?? null,
    phone: apiSupplier.phone ?? null,
    email: apiSupplier.email ?? null,
    address: apiSupplier.address ?? null,
    active: apiSupplier.active ?? true,
  };
}

type SnakeShipment = Record<string, unknown> & {
  id: number;
  order_id?: number;
  orderId?: number;
  customer_id?: number;
  customerId?: number;
  sku: string;
  quantity: number;
  status: string;
  tracking_number?: string | null;
  trackingNumber?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  shipped_at?: string | null;
  shippedAt?: string | null;
  proof_of_delivery_image?: string | null;
  proofOfDeliveryImage?: string | null;
  recipient_rut?: string | null;
  recipientRut?: string | null;
  customer_code?: string | null;
  customerCode?: string | null;
};

function readShipmentField(s: SnakeShipment) {
  return {
    id: s.id,
    orderId: (s.orderId ?? s.order_id ?? 0) as number,
    customerId: (s.customerId ?? s.customer_id ?? 0) as number,
    sku: s.sku,
    quantity: s.quantity,
    status: s.status,
    trackingNumber: (s.trackingNumber ?? s.tracking_number ?? null) as string | null,
    createdAt: (s.createdAt ?? s.created_at ?? null) as string | null,
    shippedAt: (s.shippedAt ?? s.shipped_at ?? null) as string | null,
    proofOfDeliveryImage: (s.proofOfDeliveryImage ?? s.proof_of_delivery_image ?? null) as string | null,
    recipientRut: (s.recipientRut ?? s.recipient_rut ?? null) as string | null,
    customerCode: (s.customerCode ?? s.customer_code ?? null) as string | null,
  };
}

export function adaptShipment(apiShipment: ApiShipment): Shipment {
  const f = readShipmentField(apiShipment as unknown as SnakeShipment);
  const stage = normalizeShipmentStage(f.status);
  return {
    id: String(f.id),
    orderId: String(f.orderId),
    customerId: String(f.customerId),
    sku: String(f.sku),
    quantity: f.quantity,
    carrier: f.trackingNumber ? "Transportista asignado" : "Pendiente de asignacion",
    tracking: f.trackingNumber ?? "Pendiente",
    stage,
    eta: f.status === 'EN_REPARTO'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : f.shippedAt ?? f.createdAt ?? null,
    createdAt: f.createdAt ?? new Date().toISOString(),
    shippedAt: f.shippedAt ?? null,
    exception: stage === "cancelado" ? "Envio cancelado" : undefined,
    proofOfDeliveryImage: f.proofOfDeliveryImage ?? null,
    recipientRut: f.recipientRut ?? null,
    customerCode: f.customerCode ?? null
  };
}

export function adaptNotifications(records: ApiNotificationRecord[]): TimelineEvent[] {
  return (records ?? [])
    .slice()
    .sort((left, right) => {
      const la = (left as unknown as Record<string, unknown>).occurredAt ?? (left as unknown as Record<string, unknown>).occurred_at ?? left.occurredAt;
      const ra = (right as unknown as Record<string, unknown>).occurredAt ?? (right as unknown as Record<string, unknown>).occurred_at ?? right.occurredAt;
      return new Date(la as string).getTime() - new Date(ra as string).getTime();
    })
    .map((record) => {
      const r = record as unknown as Record<string, unknown>;
      const occurredAt = (r.occurredAt ?? r.occurred_at ?? record.occurredAt) as string;
      const sourceService = (r.sourceService ?? r.source_service ?? record.sourceService ?? "external") as string;
      return {
        id: String(r.id ?? record.id),
        title: (r.stage ?? record.stage) as string,
        detail: `${r.message ?? record.message} | ${sourceService}`,
        timestamp: occurredAt,
        state: normalizeHealth((r.status ?? record.status) as string)
      };
    });
}

export function normalizeIntegrationHealth(rawStatus: string): HealthState {
  return normalizeHealth(rawStatus);
}

export function adaptCustomer(apiCustomer: ApiCustomer): Customer {
  const c = apiCustomer as unknown as Record<string, unknown>;
  return {
    id: String(c.id as number),
    name: c.name as string,
    phone: (c.phone as string) ?? undefined,
    address: (c.address as string) ?? undefined,
    email: (c.email as string) ?? undefined,
    createdAt: ((c.createdAt ?? c.created_at ?? new Date().toISOString()) as string),
    rut: (c.rut as string) ?? null,
    province: (c.province as string) ?? null,
    customerType: ((c.customerType ?? c.customer_type ?? "company") as Customer["customerType"]),
    creditLimit: c.credit_limit != null ? Number(c.credit_limit) : null,
    creditBalance: c.credit_balance != null ? Number(c.credit_balance) : 0,
  };
}

export function adaptCashSession(s: ApiCashSession): CashSession {
  return {
    id: String(s.id),
    vendorId: s.vendor_id,
    vendorName: s.vendor_name ?? s.vendor_id,
    openingAmount: Number(s.opening_amount),
    openedAt: s.opened_at,
    closedAt: s.closed_at,
    countedAmount: s.counted_amount != null ? Number(s.counted_amount) : null,
    expectedAmount: s.expected_amount != null ? Number(s.expected_amount) : null,
    difference: s.difference != null ? Number(s.difference) : null,
    status: s.status,
  };
}

export function adaptPurchase(apiPurchase: ApiPurchase): Purchase {
  return {
    id: String(apiPurchase.id),
    sku: apiPurchase.sku,
    productName: apiPurchase.product_name ?? apiPurchase.sku,
    unitOfMeasure: apiPurchase.unit_of_measure ?? "unidad",
    supplierId: apiPurchase.supplier_id != null ? String(apiPurchase.supplier_id) : null,
    supplierName: apiPurchase.supplier_name ?? null,
    unitCost: Number(apiPurchase.unit_cost),
    quantity: apiPurchase.quantity,
    subtotal: Number(apiPurchase.subtotal),
    updatePrices: apiPurchase.update_prices,
    purchasedAt: apiPurchase.purchased_at,
    createdBy: apiPurchase.created_by,
  };
}

export function adaptCustomerCredit(apiCredit: ApiCustomerCredit): CustomerCredit {
  return {
    creditLimit: apiCredit.creditLimit != null ? Number(apiCredit.creditLimit) : null,
    creditBalance: Number(apiCredit.creditBalance ?? 0),
    movements: (apiCredit.movements ?? []).map((m) => ({
      id: String(m.id),
      type: m.type,
      amount: Number(m.amount),
      balanceAfter: Number(m.balance_after),
      note: m.note ?? null,
      createdBy: m.created_by ?? null,
      createdAt: m.created_at,
    })),
  };
}
