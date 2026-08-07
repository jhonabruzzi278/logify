import Link from "next/link"

export default function Cta1() {
    return (
        <section className="py-20 bg-gradient-to-br from-grey-100 to-grey-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-2 to-brand-5 rounded-3xl px-8 sm:px-14 py-14 shadow-2xl shadow-brand-2/30">
                    <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-brand-1/15 blur-3xl pointer-events-none"/>
                    <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-brand-3/10 blur-3xl pointer-events-none"/>
                    <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                        <div>
                            <div className="inline-flex items-center gap-2 bg-brand-1/15 border border-brand-1/30 px-4 py-2 rounded-full mb-4 text-brand-1 text-sm font-semibold">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                Oferta por tiempo limitado
                            </div>
                            <h2 className="text-white font-extrabold leading-tight mb-3" style={{fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)'}}>
                                ¿Listo para transformar<br className="hidden lg:block"/>
                                <span className="text-brand-1">tu negocio?</span>
                            </h2>
                            <p className="text-lg text-white/80 max-w-lg">
                                Únete a los cientos de comercios que ya confían en Logify. Prueba gratis por 90 días, sin compromiso.
                            </p>
                        </div>
                        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                            <Link href="#demo" className="inline-flex items-center gap-2.5 bg-brand-1 text-brand-2 font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 hover:-translate-y-1 transition-all shadow-lg shadow-brand-1/40">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                Solicitar Demo Gratis
                            </Link>
                            <p className="text-white/60 text-sm flex items-center gap-1.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                Sin tarjeta de crédito
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
