export interface ApiErrorResponse {
  error: string;
}

export interface ApiLoginRequest {
  username: string;
  password: string;
}

export interface ApiOrder {
  id: number;
  customerId: number;
  sku: string;
  quantity: number;
  status: string;
  createdAt: string | null;
  assignedTo: string | null;
  cancelReason: string | null;
  clientCode?: string | null;
}

export interface ApiCustomer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  createdAt: string | null;
  rut?: string | null;
  province?: string | null;
  customer_type?: "individual" | "company";
  credit_limit?: number | string | null;
  credit_balance?: number | string | null;
}

export interface ApiCreditMovement {
  id: number;
  type: "charge" | "payment";
  amount: number | string;
  balance_after: number | string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ApiCustomerCredit {
  creditLimit: number | string | null;
  creditBalance: number | string;
  movements: ApiCreditMovement[];
}

export interface ApiSalesCloseSummary {
  date: string;
  summary: { paymentMethod: string; count: number; total: number }[];
  grandTotal: number;
}

export interface ApiCashSession {
  id: number;
  tenant_id: number;
  vendor_id: string;
  vendor_name: string | null;
  opening_amount: number | string;
  opened_at: string;
  closed_at: string | null;
  counted_amount: number | string | null;
  expected_amount: number | string | null;
  difference: number | string | null;
  status: "open" | "closed";
}

export interface ApiPurchase {
  id: number;
  tenant_id: number;
  sku: string;
  supplier_id: number | null;
  unit_cost: number | string;
  quantity: number;
  subtotal: number | string;
  update_prices: boolean;
  purchased_at: string;
  created_by: string | null;
  product_name?: string | null;
  unit_of_measure?: string | null;
  supplier_name?: string | null;
}

export interface ApiSupplier {
  id: number;
  name: string;
  rut: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  created_at?: string | null;
}

export interface ApiBusinessSettings {
  name: string;
  contactEmail: string | null;
  businessRut: string | null;
  businessCountry: string | null;
  businessIndustry: string | null;
  businessPhone: string | null;
}

export interface ApiOnboarding {
  completed: boolean;
  name: string;
  contactEmail: string | null;
  businessCountry: string | null;
  businessIndustry: string | null;
  businessPhone: string | null;
  usedPosBefore: boolean | null;
  goals: string[];
}

export type ApiSystemSettings = Record<string, boolean | string | number>;

export interface ApiInvitation {
  id: number;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

export interface ApiCreateOrderRequest {
  customerId: number;
  sku: string;
  quantity: number;
}

export interface ApiCreateOrderResponse {
  orderId: number;
  status: string;
  message: string;
  createdAt?: string | null;
  clientCode?: string | null;
}

export interface ApiInventory {
  id: number;
  sku: string;
  barcode?: string | null;
  name: string;
  stock: number;
  price: number;
  cost: number;
  category: string;
  image_url?: string | null;
  supplier_id?: number | null;
  unit_of_measure?: string | null;
  tax_rate?: number | null;
  price_includes_tax?: boolean | null;
  active?: boolean | null;
  parent_sku?: string | null;
  variant_label?: string | null;
}

export interface ApiShipment {
  id: number;
  orderId: number;
  customerId: number;
  sku: string;
  quantity: number;
  status: string;
  trackingNumber: string | null;
  createdAt: string | null;
  shippedAt: string | null;
  proofOfDeliveryImage?: string | null;
  recipientRut?: string | null;
  customerCode?: string | null;
}

export interface ApiNotificationRecord {
  id: number;
  eventId: string;
  orderId: number;
  customerId: number;
  stage: string;
  status: string;
  message: string;
  targetAudience: string;
  sourceService: string;
  occurredAt: string;
  receivedAt: string;
}
