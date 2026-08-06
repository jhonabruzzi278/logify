// Carga condicional de scripts de terceros segun el consentimiento de
// cookies. No hay IDs reales todavia (GA4 Measurement ID, Meta Pixel ID,
// TikTok Pixel ID) -- completar los TODO de abajo cuando existan y
// setearlos como NEXT_PUBLIC_GA_MEASUREMENT_ID / NEXT_PUBLIC_META_PIXEL_ID /
// NEXT_PUBLIC_TIKTOK_PIXEL_ID. Hasta entonces estas funciones son no-ops
// seguros: no inyectan ningun script.

function injectScript(src, { async = true } = {}) {
    if (typeof document === "undefined") return
    if (document.querySelector(`script[src="${src}"]`)) return
    const script = document.createElement("script")
    script.src = src
    script.async = async
    document.head.appendChild(script)
}

function loadGoogleAnalytics() {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    if (!measurementId || typeof window === "undefined") return
    if (window.dataLayer) return

    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
        window.dataLayer.push(arguments)
    }
    window.gtag("js", new Date())
    window.gtag("config", measurementId, { anonymize_ip: true })
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)
}

function loadMetaPixel() {
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
    if (!pixelId || typeof window === "undefined") return
    if (window.fbq) return

    // TODO: reemplazar por el snippet oficial de Meta Pixel cuando se tenga
    // el pixelId real (Events Manager > Configurar Meta Pixel).
    injectScript("https://connect.facebook.net/en_US/fbevents.js")
}

function loadTikTokPixel() {
    const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID
    if (!pixelId || typeof window === "undefined") return
    if (window.ttq) return

    // TODO: reemplazar por el snippet oficial de TikTok Pixel cuando se
    // tenga el pixelId real (TikTok Ads Manager > Assets > Events).
    injectScript("https://analytics.tiktok.com/i18n/pixel/events.js")
}

// Llamar cada vez que cambia el consentimiento (banner, preferencias, o al
// cargar la pagina si ya habia una decision guardada). Cada categoria carga
// su script solo si el usuario la habilito Y existe el ID configurado.
export function applyCookieConsent(consent) {
    if (!consent) return
    if (consent.analytics) loadGoogleAnalytics()
    if (consent.marketing) {
        loadMetaPixel()
        loadTikTokPixel()
    }
}
