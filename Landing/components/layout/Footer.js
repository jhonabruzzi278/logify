import Link from "next/link"
import { openCookiePreferences } from "@/util/cookieConsent"
import rubros from "@/data/rubros"

export default function Footer() {
    return (
        <footer className="bg-canvas border-t border-canvas-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    <div>
                        <svg width="150" height="36" viewBox="0 0 150 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-5">
                            <rect x="2" y="5" width="26" height="26" rx="7" fill="var(--color-brand-1)"/>
                            <text x="8" y="23" fontFamily="Arial" fontWeight="900" fontSize="15" fill="var(--color-ink)">S</text>
                            <text x="36" y="23" fontFamily="Arial" fontWeight="800" fontSize="17" fill="var(--color-fg)">Logify</text>
                        </svg>
                        <p className="text-sm text-fg/50 mb-5">Logify es la plataforma todo-en-uno para pequeños comercios. POS, inventario, pedidos, despachos y panel en un solo lugar.</p>
                        <p className="text-sm text-fg/50">Crea tu cuenta online y comienza a operar en minutos.</p>
                    </div>
                    <div>
                        <h5 className="text-fg font-bold mb-4">Producto</h5>
                        <ul className="space-y-3">
                            {["Características","Cómo Funciona","Planes y Precios","Crear cuenta","Preguntas Frecuentes"].map((item, i) => (
                                <li key={i}><a href={["/#caracteristicas","/#como-funciona","/#planes","/registro","/#faq"][i]} className="text-sm text-fg/50 hover:text-brand-3 transition-colors">{item}</a></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-fg font-bold mb-4">Por rubro</h5>
                        <ul className="space-y-3">
                            {rubros.slice(0, 4).map((r) => (
                                <li key={r.slug}><Link href={`/pos-por-rubro/${r.slug}`} className="text-sm text-fg/60 hover:text-brand-3 transition-colors">{r.nombre}</Link></li>
                            ))}
                            <li><Link href="/pos-por-rubro" className="text-sm text-fg/60 hover:text-brand-3 transition-colors">Ver todos los rubros</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-fg font-bold mb-4">Contacto</h5>
                        <ul className="space-y-3">
                            <li><a href="mailto:jonathanguerra278@gmail.com" className="text-sm text-fg/60 hover:text-brand-3 transition-colors">jonathanguerra278@gmail.com</a></li>
                            <li><a href="https://wa.me/56938980598" className="text-sm text-fg/60 hover:text-brand-3 transition-colors">+56 9 3898 0598</a></li>
                            <li><span className="text-sm text-fg/50">Santiago, Chile</span></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="border-t border-tint/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-sm text-fg/50">© Logify {new Date().getFullYear()}. Todos los derechos reservados.</span>
                    <div className="flex gap-6">
                        <Link href="/politica-de-privacidad" className="text-xs text-fg/40 hover:text-fg/60 transition-colors">Política de Privacidad</Link>
                        <button
                            type="button"
                            onClick={openCookiePreferences}
                            className="text-xs text-fg/40 hover:text-fg/60 transition-colors"
                        >
                            Preferencias de cookies
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    )
}
