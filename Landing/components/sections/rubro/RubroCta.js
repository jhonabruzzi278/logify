import Link from "next/link"

export default function RubroCta({ rubro }) {
    return (
        <section className="py-20 sm:py-24">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-2 to-brand-5 rounded-3xl px-8 sm:px-14 py-14 shadow-[0_40px_100px_-30px_rgba(3,68,96,0.6)] border border-brand-1/20 text-center">
                    <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none" />
                    <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-brand-4/15 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-[-100px] left-[-100px] w-[300px] h-[300px] rounded-full bg-purple/10 blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col items-center">
                        <h2 className="text-white font-extrabold leading-tight mb-3" style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.6rem)' }}>
                            Tu {rubro.nombre.toLowerCase()} en control, <span className="text-brand-1">desde hoy.</span>
                        </h2>
                        <p className="text-lg text-white/75 max-w-lg mb-8">
                            Activación asistida por nuestro equipo, con configuración guiada.
                        </p>
                        <Link href="/registro" className="inline-flex items-center gap-2.5 bg-brand-1 text-ink font-bold px-8 py-4 rounded-xl hover:brightness-90 hover:-translate-y-1 transition-all shadow-[0_15px_40px_-10px_rgba(143,171,212,0.5)]">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            Crear mi cuenta
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
