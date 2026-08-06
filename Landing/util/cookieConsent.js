// Utilidades de consentimiento de cookies, compartidas entre el banner y
// cualquier lugar que necesite saber si el usuario habilitó analítica o
// marketing (por ejemplo antes de inyectar Google Analytics/Ads, Meta Pixel
// o TikTok Pixel).

export const COOKIE_CONSENT_STORAGE_KEY = "logify_cookie_consent"
export const COOKIE_CONSENT_UPDATED_EVENT = "logify:cookie-consent-updated"
export const OPEN_COOKIE_PREFERENCES_EVENT = "logify:open-cookie-preferences"

const DEFAULT_CONSENT = { necessary: true, analytics: false, marketing: false }

export function readCookieConsent() {
    if (typeof window === "undefined") return null
    try {
        const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_CONSENT, ...parsed, necessary: true }
    } catch {
        return null
    }
}

export function saveCookieConsent(partialConsent) {
    if (typeof window === "undefined") return
    const consent = {
        ...DEFAULT_CONSENT,
        ...partialConsent,
        necessary: true,
        updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent))
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: consent }))
    return consent
}

export function openCookiePreferences() {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT))
}
