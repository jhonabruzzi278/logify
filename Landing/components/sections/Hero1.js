export default function Hero1() {
    return (
        <section className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-28">
            <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none" />
            <div className="absolute top-[-220px] right-[-160px] w-[600px] h-[600px] rounded-full bg-brand-1/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-260px] left-[-200px] w-[560px] h-[560px] rounded-full bg-brand-4/10 blur-[120px] pointer-events-none" />
            <div className="absolute top-1/3 right-[8%] w-[220px] h-[220px] rounded-full bg-brand-3/10 blur-3xl pointer-events-none animate-float" />
            <div className="absolute top-[10%] left-[20%] w-[260px] h-[260px] rounded-full bg-purple/10 blur-[100px] pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
                    <div>
                        <div className="font-accent inline-flex items-center gap-2 bg-tint/[0.04] border border-tint/10 px-4 py-1.5 rounded-full mb-6 text-fg/70 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-3 animate-pulse-dot" />
                            Soporte real, todos los días
                        </div>
                        <h1 className="text-fg font-extrabold leading-[1.05] mb-6 tracking-tight" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}>
                            Deja la planilla.
                            <br />
                            Vende, controla
                            <br />
                            <span className="text-brand-3">y despacha.</span>
                        </h1>
                        <p className="text-lg text-fg/60 leading-relaxed mb-9 max-w-lg">
                            Logify es el sistema todo-en-uno para comercios: POS con fiado, control de stock en tiempo real, gestión de pedidos y despachos con QR. Fácil de usar desde el primer día, aunque nunca hayas usado un sistema.
                        </p>
                        <div className="flex flex-wrap gap-3 mb-10">
                            <a href="/registro" className="inline-flex items-center gap-2 bg-brand-1 text-ink font-bold px-7 py-4 rounded-xl hover:brightness-90 transition-all hover:-translate-y-0.5 shadow-[0_12px_30px_-8px_rgba(143,171,212,0.5)] focus:outline-none focus:ring-2 focus:ring-brand-3 focus:ring-offset-2 focus:ring-offset-canvas" aria-label="Crear cuenta en Logify">
                                Crear mi cuenta
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            </a>
                            <a href="/#planes" className="inline-flex items-center gap-2 text-fg font-semibold px-6 py-4 rounded-xl border border-tint/15 hover:border-tint/30 hover:bg-tint/5 transition-all focus:outline-none focus:ring-2 focus:ring-tint/30" aria-label="Ver precios de Logify">
                                Ver precios
                            </a>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute -top-6 -left-6 w-16 h-16 rounded-2xl bg-brand-4/15 border border-brand-4/25 rotate-12 hidden lg:block" />
                        <div className="rounded-2xl bg-canvas-2 border border-canvas-border shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] overflow-hidden">
                            <div className="h-[3px] bg-gradient-to-r from-brand-1 via-brand-3 to-purple" />
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-canvas-border bg-tint/[0.02]">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                                <span className="ml-3 text-[11px] text-fg/40 font-mono">logify.app/panel</span>
                            </div>
                            <div className="p-5 sm:p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <div>
                                        <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-1">Ticket #4821</p>
                                        <p className="text-fg font-bold text-lg">4 productos</p>
                                    </div>
                                    <span className="text-brand-3 text-xs font-bold bg-brand-3/10 border border-brand-3/25 rounded-full px-3 py-1">En curso</span>
                                </div>
                                <div className="space-y-2.5 mb-5">
                                    {[["Coca-Cola 500ml", "$1.200"], ["Marolio fideos", "$980"], ["Pan lactal", "$1.450"], ["Detergente x2", "$3.200"]].map(([name, price], i) => (
                                        <div key={i} className="flex items-center justify-between text-sm border-b border-tint/5 pb-2.5">
                                            <span className="text-fg/70">{name}</span>
                                            <span className="text-fg font-semibold">{price}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between rounded-xl bg-tint/[0.04] border border-tint/10 px-4 py-3 mb-5">
                                    <span className="text-fg/80 text-sm font-semibold">Total</span>
                                    <span className="text-fg font-extrabold text-xl">$6.830</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-3.5">
                                        <p className="text-fg/40 text-[10px] uppercase tracking-wide mb-1">Ingresos hoy</p>
                                        <p className="text-fg font-bold">$184.300</p>
                                        <p className="text-brand-3 text-xs font-semibold mt-0.5">▲ +12.4%</p>
                                    </div>
                                    <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-3.5">
                                        <p className="text-fg/40 text-[10px] uppercase tracking-wide mb-1">Stock crítico</p>
                                        <p className="text-fg font-bold">3 productos</p>
                                        <p className="text-warning text-xs font-semibold mt-0.5">Reponer hoy</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="hidden sm:flex absolute -bottom-6 -right-4 items-center gap-3 rounded-xl bg-canvas-2 border border-canvas-border shadow-xl px-4 py-3">
                            <div className="w-9 h-9 rounded-lg bg-brand-3/15 flex items-center justify-center text-brand-3 text-sm font-bold">QR</div>
                            <div>
                                <p className="text-fg text-xs font-semibold">Despacho confirmado</p>
                                <p className="text-fg/40 text-[11px]">hace 2 min</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
