export type Role = "owner" | "ops" | "warehouse" | "support" | "customer" | "shipper" | "vendor";

export type ProductCategory = "bebidas" | "galletas" | "dulces" | "otros";

export type PaymentMethod = "cash" | "transfer" | "debit" | "credit";

export type HealthState = "healthy" | "warning" | "critical" | "offline";
export type OrderStage = "created" | "en_preparacion" | "en_reparto" | "entregado" | "cancelado";
export type ShipmentStage = "en_preparacion" | "en_reparto" | "entregado" | "cancelado";

export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  stock: number;
  price: number;
  cost: number;
  category: ProductCategory;
  status: HealthState;
  updatedAt: string;
  imageUrl?: string | null;
  supplierId?: number | null;
  unitOfMeasure?: string;
  taxRate?: number;
  priceIncludesTax?: boolean;
  active?: boolean;
  parentSku?: string | null;
  variantLabel?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  rut?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active: boolean;
}

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
}

export interface TimelineEvent {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  state: HealthState | "done";
}

export interface Order {
  id: string;
  customer: string;
  customerId: string;
  source: string;
  stage: OrderStage;
  sku: string;
  quantity: number;
  createdAt: string;
  eta: string | null;
  items: OrderItem[];
  timeline: TimelineEvent[];
  assignedTo?: string;
  cancelReason?: string | null;
  clientCode?: string | null;
}

export type CustomerType = "individual" | "company";

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  createdAt: string;
  rut?: string | null;
  province?: string | null;
  customerType: CustomerType;
  creditLimit?: number | null;
  creditBalance?: number;
}

export interface CreditMovement {
  id: string;
  type: "charge" | "payment";
  amount: number;
  balanceAfter: number;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CustomerCredit {
  creditLimit: number | null;
  creditBalance: number;
  movements: CreditMovement[];
}

export interface CashSession {
  id: string;
  vendorId: string;
  vendorName: string;
  openingAmount: number;
  openedAt: string;
  closedAt: string | null;
  countedAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  status: "open" | "closed";
}

export interface Purchase {
  id: string;
  sku: string;
  productName: string;
  unitOfMeasure: string;
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number;
  quantity: number;
  subtotal: number;
  updatePrices: boolean;
  purchasedAt: string;
  createdBy: string | null;
}

export interface Shipment {
  id: string;
  orderId: string;
  customerId: string;
  sku: string;
  quantity: number;
  carrier: string;
  tracking: string;
  stage: ShipmentStage;
  eta: string | null;
  createdAt: string;
  shippedAt: string | null;
  exception?: string;
  proofOfDeliveryImage?: string | null;
  recipientRut?: string | null;
  customerCode?: string | null;
}

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  type: "stock" | "order" | "shipment" | "notification";
  severity: "critical" | "high" | "medium";
  createdAt: string;
  actionLabel: string;
}

export interface SaleItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** Costo unitario al momento de la venta; null en ventas anteriores a esta funcionalidad. */
  unitCost?: number | null;
  /** Línea sin SKU real (monto libre, descuento o recargo) — no descuenta stock. */
  isManualAmount?: boolean;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  paymentMethod: PaymentMethod;
  vendorId: string;
  vendorName: string;
  createdAt: string;
  customerId?: string | null;
  customerName?: string | null;
}
