import { useEffect, useState } from "react"
import Link from "next/link"
import {
    readCookieConsent,
    saveCookieConsent,
    OPEN_COOKIE_PREFERENCES_EVENT,
} from "@/util/cookieConsent"
import { applyCookieConsent } from "@/util/analytics"

const CATEGORIES = [
    {
        key: "necessary",
        title: "Necesarias",
        description:
            "Imprescindibles para el funcionamiento del sitio: sesión, autenticación y seguridad. No pueden desactivarse.",
        locked: true,
    },
    {
        key: "analytics",
        title: "Analíticas",
        description:
            "Google Analytics/Ads: nos permiten medir visitas y el rendimiento de campañas.",
    },
    {
        key: "marketing",
        title: "Marketing",
        description:
            "Meta Pixel y TikTok Pixel: se usan para medir y personalizar publicidad en esas plataformas.",
    },
]

export default function CookieConsent() {
    // 'hidden' | 'banner' | 'preferences'
    const [view, setView] = useState("hidden")
    const [draft, setDraft] = useState({ necessary: true, analytics: false, marketing: false })

    useEffect(() => {
        const existing = readCookieConsent()
        if (existing) {
            applyCookieConsent(existing)
        } else {
            setView("banner")
        }

        const handleOpenPreferences = () => {
            setDraft(readCookieConsent() || { necessary: true, analytics: false, marketing: false })
            setView("preferences")
        }
        window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences)
        return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences)
    }, [])

    function acceptAll() {
        const consent = saveCookieConsent({ analytics: true, marketing: true })
        applyCookieConsent(consent)
        setView("hidden")
    }

    function rejectAll() {
        const consent = saveCookieConsent({ analytics: false, marketing: false })
        applyCookieConsent(consent)
        setView("hidden")
    }

    function openPreferences() {
        setDraft(readCookieConsent() || { necessary: true, analytics: false, marketing: false })
        setView("preferences")
    }

    function savePreferences() {
        const consent = saveCookieConsent(draft)
        applyCookieConsent(consent)
        setView("hidden")
    }

    function toggleCategory(key) {
        setDraft((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    if (view === "hidden") return null

    return (
        <div className="fixed inset-x-0 bottom-0 z-[9999] px-4 pb-4 sm:px-6" role="dialog" aria-live="polite" aria-label="Preferencias de cookies">
            {view === "banner" && (
                <div className="max-w-3xl mx-auto rounded-2xl bg-brand-2 text-white shadow-2xl border border-white/10 p-5 sm:p-6">
                    <p className="text-sm text-white/80 leading-relaxed">
                        Usamos cookies propias y de terceros (Google, Meta y TikTok) para el funcionamiento del sitio,
                        medir el uso y mostrar publicidad relevante. Podés aceptarlas, rechazarlas o elegir cuáles
                        activar. Más información en nuestra{" "}
                        <Link href="/politica-de-privacidad" className="text-brand-1 underline hover:no-underline">
                            Política de Privacidad
                        </Link>
                        .
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={acceptAll}
                            className="px-4 py-2 rounded-lg bg-brand-1 text-brand-2 text-sm font-semibold hover:brightness-95 transition"
                        >
                            Aceptar todas
                        </button>
                        <button
                            type="button"
                            onClick={rejectAll}
                            className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition"
                        >
                            Rechazar todas
                        </button>
                        <button
                            type="button"
                            onClick={openPreferences}
                            className="px-4 py-2 rounded-lg text-white/70 text-sm font-semibold hover:text-white transition"
                        >
                            Personalizar
                        </button>
                    </div>
                </div>
            )}

            {view === "preferences" && (
                <div className="max-w-3xl mx-auto rounded-2xl bg-brand-2 text-white shadow-2xl border border-white/10 p-5 sm:p-6">
                    <h3 className="text-base font-bold text-brand-1">Preferencias de cookies</h3>
                    <p className="mt-2 text-sm text-white/70">
                        Elegí qué categorías de cookies querés permitir. Podés cambiar esta decisión cuando quieras
                        desde el enlace &quot;Preferencias de cookies&quot; en el pie de página.
                    </p>

                    <div className="mt-4 space-y-4">
                        {CATEGORIES.map((category) => (
                            <label
                                key={category.key}
                                className={`flex items-start justify-between gap-4 rounded-lg border border-white/10 p-3 ${category.locked ? "opacity-70" : "cursor-pointer"}`}
                            >
                                <span>
                                    <span className="block text-sm font-semibold text-white">{category.title}</span>
                                    <span className="block text-xs text-white/60 mt-1">{category.description}</span>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={category.locked ? true : Boolean(draft[category.key])}
                                    disabled={category.locked}
                                    onChange={() => toggleCategory(category.key)}
                                    className="mt-1 h-5 w-5 shrink-0 accent-brand-1"
                                />
                            </label>
                        ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={savePreferences}
                            className="px-4 py-2 rounded-lg bg-brand-1 text-brand-2 text-sm font-semibold hover:brightness-95 transition"
                        >
                            Guardar preferencias
                        </button>
                        <button
                            type="button"
                            onClick={rejectAll}
                            className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition"
                        >
                            Rechazar todas
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
