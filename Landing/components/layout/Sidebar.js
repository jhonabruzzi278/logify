import Link from "next/link"

export default function Sidebar({ openClass, handleMobileMenuClose }) {
    return (
        <div className={`fixed inset-0 z-[60] pointer-events-none ${openClass ? '' : 'hidden'}`}>
            <div
                role="button"
                tabIndex={-1}
                aria-label="Cerrar"
                className="absolute inset-0 bg-black/50 pointer-events-auto"
                onClick={handleMobileMenuClose}
                onKeyDown={(e) => { if (e.key === "Escape") handleMobileMenuClose() }}
            />
            <div className={`absolute top-0 right-0 w-80 max-w-[85vw] h-full bg-white shadow-2xl pointer-events-auto transition-transform duration-300 ${openClass ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex flex-col h-full p-6">
                    <div className="flex items-center justify-between pb-5 border-b border-gray-200">
                        <Link href="/" onClick={handleMobileMenuClose}>
                            <svg width="130" height="32" viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="2" y="3" width="26" height="26" rx="7" fill="var(--color-brand-1)"/>
                                <text x="8" y="21" fontFamily="Arial" fontWeight="900" fontSize="15" fill="var(--color-ink)">S</text>
                                <text x="35" y="21" fontFamily="Arial" fontWeight="800" fontSize="16" fill="var(--color-ink)">Logify</text>
                            </svg>
                        </Link>
                        <button type="button" onClick={handleMobileMenuClose} className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <nav className="flex-1 py-6">
                        <ul className="space-y-0">
                            {["Inicio","Características","Cómo Funciona","Planes","Solicitar acceso","FAQ"].map((item, i) => {
                                const hrefs = ["/","/#caracteristicas","/#como-funciona","/#planes","/registro","/#faq"]
                                return (
                                    <li key={i}>
                                        <Link href={hrefs[i]} onClick={handleMobileMenuClose}
                                            className="block py-3.5 font-semibold text-brand-2 hover:text-brand-3 border-b border-gray-100 transition-colors"
                                        >{item}</Link>
                                    </li>
                                )
                            })}
                        </ul>
                    </nav>
                    <div className="space-y-3 pt-4 border-t border-gray-200">
                        <Link href="/acceso" onClick={handleMobileMenuClose}
                            className="block w-full text-center text-sm font-bold text-brand-2 bg-brand-1 hover:brightness-90 py-3 rounded-lg transition-colors"
                        >Iniciar Sesión</Link>
                        <Link href="/registro" onClick={handleMobileMenuClose}
                            className="block w-full text-center text-sm font-bold text-white bg-brand-2 hover:bg-brand-5 py-3 rounded-lg transition-colors"
                        >Solicitar acceso</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
