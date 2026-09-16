import { apiFetch } from "@/lib/api-client";
import type { ProductCategory } from "@/types/domain";

export interface BarcodeNutrition {
  energyKcal100g: number | null;
  proteins100g: number | null;
  carbohydrates100g: number | null;
  sugars100g: number | null;
  fat100g: number | null;
  saturatedFat100g: number | null;
  fiber100g: number | null;
  salt100g: number | null;
  sodium100g: number | null;
}

export interface BarcodeLookupResult {
  found: boolean;
  barcode?: string;
  name?: string;
  genericName?: string | null;
  brands?: string[];
  category?: ProductCategory;
  categories?: string[];
  imageUrl?: string | null;
  quantity?: string | null;
  servingSize?: string | null;
  ingredients?: string | null;
  allergens?: string[];
  nutrition?: BarcodeNutrition;
  nutriScore?: string | null;
  novaGroup?: number | null;
  ecoScore?: string | null;
  countries?: string[];
  source?: "openfoodfacts";
  cached?: boolean;
  reason?: "invalid_barcode" | "not_found" | "upstream_unavailable";
}

export function lookupBarcode(code: string): Promise<BarcodeLookupResult> {
  return apiFetch<BarcodeLookupResult>(`/api/inventory/barcode-lookup?barcode=${encodeURIComponent(code.trim())}`);
}
