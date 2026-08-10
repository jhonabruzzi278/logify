import { useState } from "react"
import Link from "next/link"

const ranges = {
    "Hoy": { ventas: "$184.300", ventasDelta: "+12.4%", ingreso: "$64.505", ingresoDelta: "+18%", ops: "47", opsDelta: "+5" },
    "7 días": { ventas: "$1.240.800", ventasDelta: "+9.1%", ingreso: "$434.280", ingresoDelta: "+11%", ops: "312", opsDelta: "+28" },
    "30 días": { ventas: "$5.180.400", ventasDelta: "+15.6%", ingreso: "$1.813.140", ingresoDelta: "+14%", ops: "1.286", opsDelta: "+140" },
}

const hours = [
    ["8h", 20], ["9h", 35], ["10h", 55], ["11h", 70], ["12h", 90], ["13h", 100],
    ["14h", 65], ["15h", 50], ["16h", 60], ["17h", 75], ["18h", 85], ["19h", 45],
]

export default function Info1() {
    const [range, setRange] = useState("Hoy")
    const data = ranges[range]

    return (
        <section className="py-24 sm:py-28 bg-canvas-2">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-12">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>
                        Tus números, en tiempo real.
                    </h2>
                    <p className="text-fg/55 text-lg">No esperes a fin de mes. Abre el panel y ve qué vendiste, cuánto ingresó y qué falta.</p>
                </div>

                <div className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                        <div className="flex gap-2">
                            {Object.keys(ranges).map((r) => (
                                <button key={r} type="button" onClick={() => setRange(r)}
                                    className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors ${range === r ? 'bg-brand-1 text-ink' : 'text-fg/50 hover:text-fg hover:bg-tint/5'}`}
                                >{r}</button>
                            ))}
                        </div>
                        <Link href="/registro" className="text-xs font-semibold text-brand-3 hover:text-fg flex items-center gap-1.5">
                            Ver panel completo
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </Link>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4 mb-8">
                        <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-5">
                            <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-2">Vendiste en total</p>
                            <p className="text-fg font-extrabold text-2xl mb-1">{data.ventas}</p>
                            <p className="text-brand-3 text-xs font-semibold">▲ {data.ventasDelta}</p>
                        </div>
                        <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-5">
                            <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-2">Ingreso estimado</p>
                            <p className="text-fg font-extrabold text-2xl mb-1">{data.ingreso}</p>
                            <p className="text-brand-3 text-xs font-semibold">▲ {data.ingresoDelta}</p>
                        </div>
                        <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-5">
                            <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-2">Operaciones</p>
                            <p className="text-fg font-extrabold text-2xl mb-1">{data.ops}</p>
                            <p className="text-brand-3 text-xs font-semibold">{data.opsDelta}</p>
                        </div>
                    </div>

                    <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-5 sm:p-6">
                        <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-5">Ventas por hora</p>
                        <div className="flex items-end gap-2 sm:gap-3 h-40">
                            {hours.map(([label, val], i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                    <div className="w-full rounded-t-md bg-gradient-to-t from-brand-4/40 to-brand-4 group-hover:from-brand-3/40 group-hover:to-brand-3 transition-colors" style={{ height: `${val}%` }} />
                                    <span className="text-[9px] sm:text-[10px] text-fg/30 font-mono">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mt-8">
                    <div className="flex items-start gap-3 text-fg/60 text-sm">
                        <svg className="w-5 h-5 text-brand-3 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
                        Alertas automáticas de stock crítico, en cuanto ocurren.
                    </div>
                    <div className="flex items-start gap-3 text-fg/60 text-sm">
                        <svg className="w-5 h-5 text-brand-3 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
                        Reportes exportables en CSV, listos para Excel.
                    </div>
                </div>
            </div>
        </section>
    )
}
