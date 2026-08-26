import Link from "next/link"
import ThemeToggle from "../elements/ThemeToggle"

export default function Header1({ scroll, handleMobileMenuOpen }) {
    return (
        <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300 ${scroll ? 'bg-canvas/85 border-b border-canvas-border shadow-[0_8px_30px_rgba(0,0,0,0.35)]' : 'bg-canvas/40 border-b border-tint/5'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-[72px] gap-4">
                    <Link className="flex items-center shrink-0" href="/">
                        <svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="2" y="6" width="28" height="28" rx="8" fill="currentColor" className="text-brand-1"/>
                            <text x="9" y="25" fontFamily="Arial" fontWeight="900" fontSize="16" fill="var(--color-ink)">S</text>
                            <text x="36" y="25" fontFamily="Arial" fontWeight="800" fontSize="17" fill="var(--color-fg)">Logify</text>
                        </svg>
                    </Link>
                    <nav className="hidden xl:flex items-center gap-1">
                        {["Inicio","Características","Cómo Funciona","Planes","Crear cuenta","FAQ"].map((item, i) => {
                            const hrefs = ["/","/#caracteristicas","/#como-funciona","/#planes","/registro","/#faq"]
                            return (
                                <Link key={i} href={hrefs[i]}
                                    className="text-sm font-semibold text-fg/75 hover:text-fg hover:bg-tint/5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                                >{item}</Link>
                            )
                        })}
                    </nav>
                    <div className="flex items-center gap-2 shrink-0">
                        <ThemeToggle />
                        <a href="https://app.logify.cl/login"
                            className="hidden sm:inline-flex text-sm font-semibold text-fg/85 border border-tint/15 hover:border-tint/30 hover:text-fg px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-1 focus:ring-offset-2 focus:ring-offset-canvas"
                            aria-label="Acceso Clientes al software Logify"
                        >Acceso Clientes</a>
                        <Link href="/registro"
                            className="hidden sm:inline-flex text-sm font-bold text-ink bg-brand-1 hover:brightness-90 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap hover:-translate-y-0.5 shadow-[0_0_0_1px_rgba(143,171,212,0.4)] focus:outline-none focus:ring-2 focus:ring-brand-3 focus:ring-offset-2 focus:ring-offset-canvas"
                            aria-label="Crear cuenta en Logify"
                        >Crear cuenta</Link>
                        <button type="button" onClick={handleMobileMenuOpen} aria-label="Abrir menú" className="xl:hidden inline-flex flex-col items-center justify-center gap-1.5 w-10 h-10 rounded-lg border border-canvas-border shrink-0">
                            <span className="block w-5 h-0.5 bg-fg rounded-sm"/>
                            <span className="block w-5 h-0.5 bg-fg rounded-sm"/>
                            <span className="block w-5 h-0.5 bg-fg rounded-sm"/>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    )
}
