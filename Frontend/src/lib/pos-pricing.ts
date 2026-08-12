import type { Product } from "@/types/domain";

const WEIGHT_VOLUME_UNITS = new Set(["kg", "g", "l", "ml"]);

export function isWeightOrVolumeProduct(product: Product): boolean {
  return Boolean(product.unitOfMeasure && WEIGHT_VOLUME_UNITS.has(product.unitOfMeasure));
}

export function roundToNearest50(amount: number): number {
  return Math.round(amount / 50) * 50;
}

/** Subtotal de una linea del carrito, redondeado al $50 mas cercano cuando corresponde a un producto por peso/volumen. */
export function lineSubtotal(product: Product, quantity: number, roundWeightSubtotals: boolean): number {
  const raw = product.price * quantity;
  if (roundWeightSubtotals && isWeightOrVolumeProduct(product)) {
    return roundToNearest50(raw);
  }
  return raw;
}
