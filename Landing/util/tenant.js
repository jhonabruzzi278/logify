export function slugify(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 63)
}

// "logify" es el tenant flagship, ya migrado a Clerk -- vive en app.logify.cl
// (el portal), no en un subdominio propio (esta reservado, ver
// Frontend/src/lib/tenant-navigation.ts RESERVED_TENANT_SLUGS y
// Backend/orders-service/src/index.js RESERVED_TENANT_SLUGS). Sin este caso
// especial, tenantLoginUrl("logify") arma "logify.logify.cl", un subdominio
// que nunca existio -- callejon sin salida para el unico tenant que hoy
// funciona de verdad.
const PORTAL_TENANT_SLUG = "logify"
const PORTAL_LOGIN_URL = "https://app.logify.cl/login"

export function tenantLoginUrl(slug) {
    if (slug === PORTAL_TENANT_SLUG) return PORTAL_LOGIN_URL
    return `https://${slug}.logify.cl/login`
}
