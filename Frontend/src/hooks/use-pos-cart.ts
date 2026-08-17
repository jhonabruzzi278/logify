import { useCallback, useMemo, useState } from "react";
import { lineSubtotal } from "@/lib/pos-pricing";
import type { Product, SaleItem } from "@/types/domain";

export interface CartEntry {
  /** Identidad única de la línea en el carrito (para React keys y edición) — no siempre igual a product.sku. */
  cartId: string;
  product: Product;
  quantity: number;
  /** Línea manual (Agregar Monto, Descuento, Recargo) — sin SKU real, no descuenta stock. */
  isManualAmount?: boolean;
}

const CART_KEY = "logify-pos-cart:v1";
let manualAmountSeq = 0;

/**
 * Producto sintético para una línea manual del carrito (monto libre, descuento
 * o recargo). El `sku` es la etiqueta legible (ej. "Descuento") — es lo que
 * queda guardado en `sales.sku` en el backend, ya que esas líneas no tienen
 * `name` propio ahí (solo se resuelve por join contra inventory).
 */
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

function readCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartEntry[];
    return parsed.filter((entry) => {
      if (!entry?.product?.sku || typeof entry?.product?.price !== "number" || isNaN(entry.product.price)) {
        return false;
      }
      if (!entry.isManualAmount) entry.product.price = Math.max(0, entry.product.price);
      entry.product.stock = Math.max(0, entry.product.stock ?? 0);
      entry.quantity = Math.max(1, entry.quantity ?? 1);
      if (!entry.cartId) entry.cartId = entry.product.sku;
      return true;
    });
  } catch {
    return [];
  }
}

function persistCart(items: CartEntry[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

export function usePosCart(options?: { roundWeightSubtotals?: boolean }) {
  const roundWeightSubtotals = options?.roundWeightSubtotals ?? false;
  const [items, setItems] = useState<CartEntry[]>(() => readCart());

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((e) => e.cartId === product.sku);
      let next: CartEntry[];
      if (existing) {
        next = prev.map((e) =>
          e.cartId === product.sku
            ? { ...e, quantity: e.quantity + quantity }
            : e
        );
      } else {
        next = [...prev, { cartId: product.sku, product, quantity }];
      }
      persistCart(next);
      return next;
    });
  }, []);

  const addManualAmount = useCallback((label: string, amount: number) => {
    manualAmountSeq += 1;
    const cartId = `manual-line-${Date.now()}-${manualAmountSeq}`;
    const product = createManualAmountProduct(label, amount);
    setItems((prev) => {
      const next = [...prev, { cartId, product, quantity: 1, isManualAmount: true }];
      persistCart(next);
      return next;
    });
  }, []);

  const removeFromCart = useCallback((cartId: string) => {
    setItems((prev) => {
      const next = prev.filter((e) => e.cartId !== cartId);
      persistCart(next);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((cartId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.filter((e) => e.cartId !== cartId);
        persistCart(next);
        return next;
      });
      return;
    }
    setItems((prev) => {
      const next = prev.map((e) =>
        e.cartId === cartId ? { ...e, quantity } : e
      );
      persistCart(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    persistCart([]);
  }, []);

  const getLineSubtotal = useCallback(
    (entry: CartEntry) => entry.isManualAmount
      ? entry.product.price * entry.quantity
      : lineSubtotal(entry.product, entry.quantity, roundWeightSubtotals),
    [roundWeightSubtotals]
  );

  const total = useMemo(
    () => items.reduce((sum, e) => sum + getLineSubtotal(e), 0),
    [items, getLineSubtotal]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, e) => sum + e.quantity, 0),
    [items]
  );

  const saleItems = useMemo<SaleItem[]>(
    () =>
      items.map((e) => ({
        sku: e.product.sku,
        name: e.product.name,
        quantity: e.quantity,
        unitPrice: e.product.price,
        subtotal: getLineSubtotal(e),
        isManualAmount: e.isManualAmount,
      })),
    [items, getLineSubtotal]
  );

  return {
    items,
    addToCart,
    addManualAmount,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    itemCount,
    saleItems,
    getLineSubtotal,
  };
}
