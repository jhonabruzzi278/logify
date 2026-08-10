import Link from "next/link"

export default function RubroHero({ rubro }) {
    return (
        <section className="relative overflow-hidden bg-canvas pt-10 pb-20 lg:pb-24">
            <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none" />
            <div className="absolute top-[-180px] right-[-160px] w-[500px] h-[500px] rounded-full bg-brand-1/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-220px] left-[-200px] w-[460px] h-[460px] rounded-full bg-brand-4/10 blur-[120px] pointer-events-none" />
            <div className="absolute top-[15%] left-[35%] w-[240px] h-[240px] rounded-full bg-purple/10 blur-[100px] pointer-events-none" />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-tint/10 px-4 py-1.5 rounded-full mb-6 text-fg/70 text-xs font-semibold uppercase tracking-wider">
                    Sistema POS · {rubro.nombre}
                </div>
                <h1 className="text-fg font-extrabold leading-[1.1] mb-6 tracking-tight" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.1rem)' }}>
                    Sistema POS para {rubro.nombrePlural}: {rubro.heroSubtitle}
                </h1>
                <p className="text-lg text-fg/60 leading-relaxed mb-9 max-w-2xl">
                    {rubro.heroIntro}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link href="/registro" className="inline-flex items-center gap-2 bg-brand-1 text-ink font-bold px-7 py-4 rounded-xl hover:brightness-90 transition-all hover:-translate-y-0.5 shadow-[0_12px_30px_-8px_rgba(143,171,212,0.5)]">
                        Prueba gratis 30 días
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </Link>
                    <Link href="/#planes" className="inline-flex items-center gap-2 text-fg font-semibold px-6 py-4 rounded-xl border border-tint/15 hover:border-tint/30 hover:bg-tint/5 transition-all">
                        Ver precios
                    </Link>
                </div>
            </div>
        </section>
    )
}
