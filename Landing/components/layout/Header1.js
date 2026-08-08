import Link from "next/link"

export default function Header1({ scroll, handleMobileMenuOpen }) {
    return (
        <header className={`fixed top-0 left-0 right-0 z-50 bg-white transition-shadow duration-300 ${scroll ? 'shadow-lg' : ''}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-[72px] gap-4">
                    <Link className="flex items-center shrink-0" href="/">
                        <svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="2" y="6" width="28" height="28" rx="8" fill="currentColor" className="text-brand-1"/>
                            <text x="9" y="25" fontFamily="Arial" fontWeight="900" fontSize="16" fill="#034460">S</text>
                            <text x="36" y="25" fontFamily="Arial" fontWeight="800" fontSize="17" fill="#034460">Logify</text>
                        </svg>
                    </Link>
                    <nav className="hidden xl:flex items-center gap-1">
                        {["Inicio","Características","Cómo Funciona","Planes","Prueba gratis","FAQ"].map((item, i) => {
                            const hrefs = ["/","#caracteristicas","#como-funciona","#planes","/registro","#faq"]
                            return (
                                <Link key={i} href={hrefs[i]}
                                    className="text-sm font-semibold text-brand-2 hover:text-brand-1 hover:bg-brand-1/10 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                                >{item}</Link>
                            )
                        })}
                    </nav>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/acceso"
                            className="hidden sm:inline-flex text-sm font-semibold text-brand-2 border-2 border-grey-300 hover:border-brand-2 px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-1 focus:ring-offset-2"
                            aria-label="Acceso Clientes al software Logify"
                        >Acceso Clientes</Link>
                        <Link href="/registro"
                            className="text-sm font-bold text-brand-2 bg-brand-1 hover:bg-yellow-400 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                            aria-label="Prueba Logify gratis por 30 dias"
                        >Prueba gratis</Link>
                        <button onClick={handleMobileMenuOpen} className="xl:hidden flex flex-col gap-1.5 p-2">
                            <span className="block w-6 h-0.5 bg-brand-2 rounded-sm"/>
                            <span className="block w-6 h-0.5 bg-brand-2 rounded-sm"/>
                            <span className="block w-6 h-0.5 bg-brand-2 rounded-sm"/>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    )
}
