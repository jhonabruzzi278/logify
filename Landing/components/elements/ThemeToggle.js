import { useEffect, useState } from "react"

export default function ThemeToggle({ className = "" }) {
    const [theme, setTheme] = useState("dark")

    useEffect(() => {
        const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"
        setTheme(current)
    }, [])

    const toggle = () => {
        const next = theme === "light" ? "dark" : "light"
        setTheme(next)
        document.documentElement.setAttribute("data-theme", next)
        try {
            localStorage.setItem("logify-theme", next)
        } catch {
            // localStorage unavailable (private mode / disabled) — theme just won't persist
        }
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border border-canvas-border text-fg/70 hover:text-fg hover:border-fg/30 transition-colors ${className}`}
        >
            {theme === "light" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
            )}
        </button>
    )
}
