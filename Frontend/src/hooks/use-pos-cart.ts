import { useCallback, useMemo, useState } from "react";
import type { Product, SaleItem } from "@/types/domain";

export interface CartEntry {
  product: Product;
  quantity: number;
}

const CART_KEY = "logify-pos-cart:v1";

function readCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartEntry[];
    return parsed.filter((entry) => {
      if (!entry?.product?.sku || typeof entry?.product?.price !== "number" || isNaN(entry.product.price)) {
        return false;
      }
      entry.product.price = Math.max(0, entry.product.price);
      entry.product.stock = Math.max(0, entry.product.stock ?? 0);
      entry.quantity = Math.max(1, entry.quantity ?? 1);
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

export function usePosCart() {
  const [items, setItems] = useState<CartEntry[]>(() => readCart());

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((e) => e.product.sku === product.sku);
      let next: CartEntry[];
      if (existing) {
        next = prev.map((e) =>
          e.product.sku === product.sku
            ? { ...e, quantity: e.quantity + quantity }
            : e
        );
      } else {
        next = [...prev, { product, quantity }];
      }
      persistCart(next);
      return next;
    });
  }, []);

  const removeFromCart = useCallback((sku: string) => {
    setItems((prev) => {
      const next = prev.filter((e) => e.product.sku !== sku);
      persistCart(next);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((sku: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.filter((e) => e.product.sku !== sku);
        persistCart(next);
        return next;
      });
      return;
    }
    setItems((prev) => {
      const next = prev.map((e) =>
        e.product.sku === sku ? { ...e, quantity } : e
      );
      persistCart(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    persistCart([]);
  }, []);

  const total = useMemo(
    () => items.reduce((sum, e) => sum + e.product.price * e.quantity, 0),
    [items]
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
        subtotal: e.product.price * e.quantity,
      })),
    [items]
  );

  return {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    itemCount,
    saleItems,
  };
}
