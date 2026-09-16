'use strict';

const log = require('../shared/logger');

const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'product_name_es',
  'product_name',
  'generic_name_es',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'categories_tags',
  'image_front_url',
  'image_url',
  'ingredients_text_es',
  'ingredients_text',
  'allergens_tags',
  'nutriments',
  'nutrition_grades',
  'nova_group',
  'ecoscore_grade',
  'countries_tags',
].join(',');

const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = Number(process.env.BARCODE_LOOKUP_TIMEOUT_MS || 5000);
const cache = new Map();

function mapOffCategoryToLogify(categoriesTags) {
  const tags = (categoriesTags || []).join(' ').toLowerCase();
  if (/beverage|drink|soda|juice|water|beer|wine/.test(tags)) return 'bebidas';
  if (/biscuit|cookie|cracker|wafer/.test(tags)) return 'galletas';
  if (/candy|candies|sweet|chocolate|gum|caramel/.test(tags)) return 'dulces';
  return 'otros';
}

function buildProductName(name, brandsField) {
  const candidates = (brandsField || '').split(',').map((brand) => brand.trim()).filter(Boolean);
  if (!candidates.length) return name;
  const lowerName = name.toLowerCase();
  if (candidates.some((brand) => lowerName.includes(brand.toLowerCase()))) return name;
  const shortestBrand = candidates.reduce((shortest, brand) => (brand.length < shortest.length ? brand : shortest));
  return `${shortestBrand} ${name}`;
}

function nutritionFrom(product) {
  const nutriments = product.nutriments || {};
  return {
    energyKcal100g: nutriments['energy-kcal_100g'] ?? null,
    proteins100g: nutriments.proteins_100g ?? null,
    carbohydrates100g: nutriments.carbohydrates_100g ?? null,
    sugars100g: nutriments.sugars_100g ?? null,
    fat100g: nutriments.fat_100g ?? null,
    saturatedFat100g: nutriments['saturated-fat_100g'] ?? null,
    fiber100g: nutriments.fiber_100g ?? null,
    salt100g: nutriments.salt_100g ?? null,
    sodium100g: nutriments.sodium_100g ?? null,
  };
}

function normalizeOpenFoodFactsProduct(product, barcode) {
  const rawName = String(product.product_name_es || product.product_name || '').trim();
  if (!rawName) return null;
  return {
    found: true,
    barcode,
    name: buildProductName(rawName, product.brands),
    genericName: String(product.generic_name_es || product.generic_name || '').trim() || null,
    brands: String(product.brands || '').split(',').map((brand) => brand.trim()).filter(Boolean),
    category: mapOffCategoryToLogify(product.categories_tags),
    categories: Array.isArray(product.categories_tags) ? product.categories_tags : [],
    imageUrl: product.image_front_url || product.image_url || null,
    quantity: product.quantity || null,
    servingSize: product.serving_size || null,
    ingredients: String(product.ingredients_text_es || product.ingredients_text || '').trim() || null,
    allergens: Array.isArray(product.allergens_tags) ? product.allergens_tags : [],
    nutrition: nutritionFrom(product),
    nutriScore: product.nutrition_grades || null,
    novaGroup: product.nova_group ?? null,
    ecoScore: product.ecoscore_grade || null,
    countries: Array.isArray(product.countries_tags) ? product.countries_tags : [],
    source: 'openfoodfacts',
  };
}

function cached(barcode) {
  const entry = cache.get(barcode);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(barcode);
    return null;
  }
  return { ...entry.value, cached: true };
}

function remember(barcode, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  const ttl = value.found ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  cache.set(barcode, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function lookupBarcode(barcode, fetchImpl = global.fetch) {
  const normalized = String(barcode || '').trim();
  if (!/^\d{6,14}$/.test(normalized)) {
    return { found: false, reason: 'invalid_barcode' };
  }
  const cacheHit = cached(normalized);
  if (cacheHit) return cacheHit;

  const url = `${OPEN_FOOD_FACTS_BASE_URL}/${encodeURIComponent(normalized)}.json?fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}`;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Logify/1.0 (logistica@logify.cl)',
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (response.status === 404) return remember(normalized, { found: false, reason: 'not_found' });
    if (!response.ok) return { found: false, reason: 'upstream_unavailable' };
    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return remember(normalized, { found: false, reason: 'not_found' });
    }
    const product = normalizeOpenFoodFactsProduct(data.product, normalized);
    return product
      ? remember(normalized, product)
      : remember(normalized, { found: false, reason: 'not_found' });
  } catch (err) {
    log.warn('Open Food Facts lookup failed', { barcode: normalized, message: err.message });
    return { found: false, reason: 'upstream_unavailable' };
  }
}

function clearBarcodeLookupCache() {
  cache.clear();
}

module.exports = {
  lookupBarcode,
  normalizeOpenFoodFactsProduct,
  mapOffCategoryToLogify,
  buildProductName,
  clearBarcodeLookupCache,
};
