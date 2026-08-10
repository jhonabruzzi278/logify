import Link from "next/link"
import { openCookiePreferences } from "@/util/cookieConsent"
import rubros from "@/data/rubros"
import { FacebookIcon, InstagramIcon, XIcon, YoutubeIcon } from "@/components/elements/SocialIcons"

const socials = [
    { name: "Facebook", href: "#", Icon: FacebookIcon },
    { name: "Instagram", href: "#", Icon: InstagramIcon },
    { name: "X", href: "#", Icon: XIcon },
    { name: "YouTube", href: "#", Icon: YoutubeIcon },
]

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
                        <h6 className="text-fg font-semibold mb-3">Síguenos</h6>
                        <div className="flex gap-3">
                            {socials.map(({ name, href, Icon }) => (
                                <Link key={name} href={href} aria-label={name} className="w-9 h-9 rounded-lg bg-tint/5 hover:bg-tint/10 flex items-center justify-center text-fg transition-colors">
                                    <Icon className="w-4 h-4" />
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h5 className="text-fg font-bold mb-4">Producto</h5>
                        <ul className="space-y-3">
                            {["Características","Cómo Funciona","Planes y Precios","Prueba gratis","Preguntas Frecuentes"].map((item, i) => (
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
                            <li><a href="tel:+56912345678" className="text-sm text-fg/60 hover:text-brand-3 transition-colors">+56 9 1234 5678</a></li>
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
                        <Link href="#" className="text-xs text-fg/40 hover:text-fg/60 transition-colors">Términos del Servicio</Link>
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
