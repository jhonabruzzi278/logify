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
  name: string;
  stock: number;
  price: number;
  cost: number;
  category: string;
  image_url?: string | null;
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
