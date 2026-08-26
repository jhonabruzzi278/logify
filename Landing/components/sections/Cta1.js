import Link from "next/link"

export default function Cta1() {
    return (
        <section className="py-20 sm:py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-2 to-brand-5 rounded-3xl px-8 sm:px-14 py-14 shadow-[0_40px_100px_-30px_rgba(3,68,96,0.6)] border border-brand-1/20">
                    <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none" />
                    <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-brand-4/15 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-purple/10 blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                        <div>
                            <div className="inline-flex items-center gap-2 bg-brand-3/15 border border-brand-3/30 px-4 py-2 rounded-full mb-4 text-brand-3 text-sm font-semibold">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                Activación asistida
                            </div>
                            <h2 className="text-white font-extrabold leading-tight mb-3" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)' }}>
                                Gestiona tu negocio sin<br className="hidden lg:block" />
                                que te <span className="text-brand-1">consuma el día.</span>
                            </h2>
                            <p className="text-lg text-white/75 max-w-lg">
                                Sé más profesional, recupera horas y deja de vivir dentro de tu negocio. Migramos tus datos sin costo.
                            </p>
                        </div>
                        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                            <Link href="/registro" className="inline-flex items-center gap-2.5 bg-brand-1 text-ink font-bold px-8 py-4 rounded-xl hover:brightness-90 hover:-translate-y-1 transition-all shadow-[0_15px_40px_-10px_rgba(143,171,212,0.5)]">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                Solicitar acceso
                            </Link>
                            <p className="text-white/60 text-sm flex items-center gap-1.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                Te acompañamos en la configuración
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
