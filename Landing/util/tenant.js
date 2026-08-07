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

export function tenantLoginUrl(slug) {
    return `https://${slug}.logify.cl/login`
}
