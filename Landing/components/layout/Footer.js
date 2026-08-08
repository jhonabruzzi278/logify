import Link from "next/link"
import { openCookiePreferences } from "@/util/cookieConsent"

export default function Footer() {
    return (
        <footer className="bg-brand-2">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    <div>
                        <svg width="150" height="36" viewBox="0 0 150 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-5">
                            <rect x="2" y="5" width="26" height="26" rx="7" fill="#FEC201"/>
                            <text x="8" y="23" fontFamily="Arial" fontWeight="900" fontSize="15" fill="#034460">S</text>
                            <text x="36" y="23" fontFamily="Arial" fontWeight="800" fontSize="17" fill="white">Logify</text>
                        </svg>
                        <p className="text-sm text-white/70 mb-5">Logify es la plataforma todo-en-uno para pequeños comercios. POS, inventario, pedidos, despachos y dashboard en un solo lugar.</p>
                        <h6 className="text-brand-1 font-semibold mb-3">Síguenos</h6>
                        <div className="flex gap-3">
                            {["facebook","instagram","twitter","youtube"].map(s => (
                                <Link key={s} href="#" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-brand-1/20 flex items-center justify-center text-white/60 hover:text-brand-1 transition-colors">{s[0].toUpperCase()}</Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h5 className="text-brand-1 font-bold mb-4">Producto</h5>
                        <ul className="space-y-3">
                            {["Características","Cómo Funciona","Planes y Precios","Prueba gratis","Preguntas Frecuentes"].map((item, i) => (
                                <li key={i}><a href={["#caracteristicas","#como-funciona","#planes","/registro","#faq"][i]} className="text-sm text-white/60 hover:text-brand-1 transition-colors">{item}</a></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-brand-1 font-bold mb-4">Empresa</h5>
                        <ul className="space-y-3">
                            {["Sobre Nosotros","Blog","Carreras","Prensa"].map((item, i) => (
                                <li key={i}><Link href="#" className="text-sm text-white/60 hover:text-brand-1 transition-colors">{item}</Link></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-brand-1 font-bold mb-4">Contacto</h5>
                        <ul className="space-y-3">
                            <li><a href="mailto:contacto@logify.cl" className="text-sm text-white/60 hover:text-brand-1 transition-colors">contacto@logify.cl</a></li>
                            <li><a href="tel:+56912345678" className="text-sm text-white/60 hover:text-brand-1 transition-colors">+56 9 1234 5678</a></li>
                            <li><span className="text-sm text-white/50">Santiago, Chile</span></li>
                        </ul>
                        <h6 className="text-brand-1 font-semibold mt-5 mb-2">Horario</h6>
                        <p className="text-sm text-white/70">Lun - Vie: 9:00 - 18:00</p>
                    </div>
                </div>
            </div>
            <div className="border-t border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-sm text-white/50">© Logify {new Date().getFullYear()}. Todos los derechos reservados.</span>
                    <div className="flex gap-6">
                        <Link href="/politica-de-privacidad" className="text-xs text-white/40 hover:text-white/60 transition-colors">Política de Privacidad</Link>
                        <Link href="#" className="text-xs text-white/40 hover:text-white/60 transition-colors">Términos del Servicio</Link>
                        <button
                            type="button"
                            onClick={openCookiePreferences}
                            className="text-xs text-white/40 hover:text-white/60 transition-colors"
                        >
                            Preferencias de cookies
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    )
}
