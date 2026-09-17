import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { usePosCartRealtime } from "@/hooks/use-pos-cart-realtime";
import type { PaymentMethod, Product, SaleItem } from "@/types/domain";

export interface CartEntry {
  cartId: string;
  product: Product;
  quantity: number;
  isManualAmount?: boolean;
}

export interface ServerCart {
  id: string;
  version: number;
  updatedAt: string;
  items: Array<{ id: string; product: Product; quantity: number; isManualAmount?: boolean }>;
}

interface CheckoutInput {
  paymentMethod: PaymentMethod;
  vendorId: string;
  vendorName: string;
  customerId?: string | null;
  customerName?: string | null;
}

interface CheckoutResult {
  saleGroup: string;
  total: number;
  cart: ServerCart;
}

let manualAmountSeq = 0;

function mutationId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createManualAmountProduct(label: string, amount: number): Product {
  manualAmountSeq += 1;
  return {
    id: `manual-${manualAmountSeq}`,
    sku: label,
    name: label,
    stock: 1,
    price: amount,
    cost: 0,
    category: "otros",
    status: "healthy",
    updatedAt: new Date().toISOString(),
  };
}

function entries(cart: ServerCart): CartEntry[] {
  return cart.items.map((item) => ({
    cartId: item.id,
    product: item.product,
    quantity: item.quantity,
    isManualAmount: item.isManualAmount || undefined,
  }));
}

export function usePosCart(authToken?: string) {
  const [items, setItems] = useState<CartEntry[]>([]);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const mounted = useRef(true);
  const version = useRef(-1);
  const mutationQueue = useRef<Promise<void> | null>(null);
  const pendingMutations = useRef(0);

  const applyCart = useCallback((cart: ServerCart) => {
    if (mounted.current && cart.version >= version.current) {
      version.current = cart.version;
      setItems(entries(cart));
      setSyncError(null);
    }
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      applyCart(await apiFetch<ServerCart>("/api/pos/cart"));
    } catch {
      if (mounted.current) setSyncError("No se pudo sincronizar el carrito");
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [applyCart]);

  useEffect(() => {
    mounted.current = true;
    void refreshCart();
    // El WebSocket entrega cambios instantáneos entre dispositivos. Esta
    // consulta espaciada queda solo como red de seguridad ante proxies o redes
    // móviles que interrumpan conexiones persistentes.
    const interval = window.setInterval(() => void refreshCart(), 30000);
    const onFocus = () => void refreshCart();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshCart]);

  const realtimeConnected = usePosCartRealtime({ authToken, onCart: applyCart, onConnected: refreshCart });

  const syncMutation = useCallback((path: string, init: RequestInit) => {
    pendingMutations.current += 1;
    setSyncing(true);
    const task = (mutationQueue.current ?? Promise.resolve()).then(async () => {
      try {
        applyCart(await apiFetch<ServerCart>(path, init));
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "No se pudo sincronizar el carrito");
        await refreshCart();
      }
    });
    mutationQueue.current = task.catch(() => undefined);
    void task.finally(() => {
      pendingMutations.current -= 1;
      if (mounted.current && pendingMutations.current === 0) setSyncing(false);
    });
    return task;
  }, [applyCart, refreshCart]);

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setItems((previous) => {
      const existing = previous.find((entry) => entry.product.sku === product.sku && !entry.isManualAmount);
      return existing
        ? previous.map((entry) => entry.cartId === existing.cartId ? { ...entry, quantity: entry.quantity + quantity } : entry)
        : [...previous, { cartId: `pending-${mutationId()}`, product, quantity }];
    });
    void syncMutation("/api/pos/cart/items", {
      method: "POST",
      body: JSON.stringify({ sku: product.sku, quantity, mutationId: mutationId() }),
    });
  }, [syncMutation]);

  const addManualAmount = useCallback((label: string, amount: number) => {
    const product = createManualAmountProduct(label, amount);
    setItems((previous) => [...previous, { cartId: `pending-${mutationId()}`, product, quantity: 1, isManualAmount: true }]);
    void syncMutation("/api/pos/cart/manual-items", {
      method: "POST",
      body: JSON.stringify({ label, amount, mutationId: mutationId() }),
    });
  }, [syncMutation]);

  const removeFromCart = useCallback((cartId: string) => {
    setItems((previous) => previous.filter((entry) => entry.cartId !== cartId));
    if (!cartId.startsWith("pending-")) {
      void syncMutation(`/api/pos/cart/items/${encodeURIComponent(cartId)}`, {
        method: "DELETE",
        body: JSON.stringify({ mutationId: mutationId() }),
      });
    }
  }, [syncMutation]);

  const updateQuantity = useCallback((cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartId);
      return;
    }
    setItems((previous) => previous.map((entry) => entry.cartId === cartId ? { ...entry, quantity } : entry));
    if (!cartId.startsWith("pending-")) {
      void syncMutation(`/api/pos/cart/items/${encodeURIComponent(cartId)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, mutationId: mutationId() }),
      });
    }
  }, [removeFromCart, syncMutation]);

  const clearCart = useCallback(() => {
    setItems([]);
    void syncMutation("/api/pos/cart", {
      method: "DELETE",
      body: JSON.stringify({ mutationId: mutationId() }),
    });
  }, [syncMutation]);

  const checkout = useCallback(async (input: CheckoutInput) => {
    setSyncing(true);
    try {
      const result = await apiFetch<CheckoutResult>("/api/pos/cart/checkout", {
        method: "POST",
        body: JSON.stringify({ ...input, mutationId: mutationId() }),
      });
      applyCart(result.cart);
      return result;
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [applyCart]);

  const total = useMemo(() => items.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, entry) => sum + entry.quantity, 0), [items]);
  const saleItems = useMemo<SaleItem[]>(() => items.map((entry) => ({
    sku: entry.product.sku,
    name: entry.product.name,
    quantity: entry.quantity,
    unitPrice: entry.product.price,
    subtotal: entry.product.price * entry.quantity,
    isManualAmount: entry.isManualAmount,
  })), [items]);

  return { items, addToCart, addManualAmount, removeFromCart, updateQuantity, clearCart, checkout, refreshCart, syncing, syncError, realtimeConnected, total, itemCount, saleItems };
}
