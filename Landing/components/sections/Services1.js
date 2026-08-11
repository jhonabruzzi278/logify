import QrModel3D from "../elements/QrModel3D"

const stockItems = [
    { name: "Coca-Cola 500ml", ratio: 0.88, count: "44/50", color: "bg-brand-3" },
    { name: "Pan lactal Bimbo", ratio: 0.27, count: "8/30", color: "bg-brand-1" },
    { name: "Yerba Playadito 1kg", ratio: 0.75, count: "18/24", color: "bg-brand-4" },
]

const orderSteps = ["Creado", "Preparación", "Reparto", "Entregado"]

const topProducts = [
    ["Coca-Cola 2L", "$85.200"],
    ["Papas Lays", "$42.100"],
    ["Jugo Watt's", "$38.500"],
]

const clients = [
    ["SM", "Sofía M.", "$4.200", "#8FABD4"],
    ["CR", "Carlos R.", "$9.800", "#EFECE3"],
    ["DT", "Don Tito", "$14.500", "#8FABD4"],
]

export default function Services1() {
    return (
        <section className="py-24 sm:py-28" id="caracteristicas">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-14">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>
                        Las herramientas que tu negocio ya necesita
                    </h2>
                    <p className="text-fg/55 text-lg">
                        Diseñado con datos reales de almacenes, minimarkets y comercios de barrio. Ordenado por lo que más impacto tiene en tu caja.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* POS + cuenta corriente — large card */}
                    <div className="lg:col-span-2 rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center hover:border-tint/20 transition-colors">
                        <div className="flex-1">
                            <h3 className="text-fg font-bold text-xl mb-2">Registra cada venta</h3>
                            <p className="text-fg/55 text-sm leading-relaxed mb-4">Escáner de código de barras o monto rápido. Fiado y cuenta corriente por cliente, sin cuadernos.</p>
                            <ul className="space-y-1.5">
                                {["Carrito rápido + escáner", "Fiado con cuenta corriente", "Cierre de caja por método de pago"].map((b, i) => (
                                    <li key={i} className="flex items-center gap-2 text-fg/70 text-sm">
                                        <svg className="w-4 h-4 text-brand-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="w-full sm:w-64 shrink-0 rounded-xl bg-white text-ink p-4 shadow-xl">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-bold text-grey-500 uppercase tracking-wide">Ticket #4821</span>
                                <span className="text-[10px] font-bold text-brand-2 bg-brand-3/25 rounded-full px-2 py-0.5">4 items</span>
                            </div>
                            <div className="space-y-1.5 mb-3">
                                {["Coca 500ml", "Fideos", "Pan", "Detergente"].map((n, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs text-grey-700">
                                        <span>{n}</span><span className="font-semibold text-brand-2">$—</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between border-t border-grey-200 pt-2.5">
                                <span className="text-xs font-bold text-brand-2">Total</span>
                                <span className="text-lg font-extrabold text-brand-2">$6.830</span>
                            </div>
                        </div>
                    </div>

                    {/* Inventario */}
                    <div className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 hover:border-tint/20 transition-colors">
                        <h3 className="text-fg font-bold text-xl mb-2">Controla el stock en vivo</h3>
                        <p className="text-fg/55 text-sm leading-relaxed mb-5">Se actualiza solo con cada venta. Sabes qué reponer antes de que se acabe.</p>
                        <div className="space-y-3.5">
                            {stockItems.map((s, i) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-fg/70">{s.name}</span>
                                        <span className="text-fg/40 font-mono">{s.count}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-tint/10 overflow-hidden">
                                        <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.ratio * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pedidos */}
                    <div className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 hover:border-tint/20 transition-colors">
                        <h3 className="text-fg font-bold text-xl mb-2">Gestiona pedidos</h3>
                        <p className="text-fg/55 text-sm leading-relaxed mb-5">Crea, confirma y da seguimiento a cada pedido de creación a entrega.</p>
                        <div className="flex items-center gap-1.5">
                            {orderSteps.map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5 flex-1">
                                    <div className={`flex-1 h-1.5 rounded-full ${i <= 2 ? 'bg-brand-3' : 'bg-tint/10'}`} />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-fg/40 font-mono">
                            <span>Creado</span><span>Entregado</span>
                        </div>
                        <div className="mt-4 rounded-lg bg-tint/[0.03] border border-tint/10 px-3 py-2.5 text-xs text-fg/60">
                            Pedido #218 · <span className="text-brand-3 font-semibold">En reparto</span>
                        </div>
                    </div>

                    {/* Despachos */}
                    <div className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 flex flex-col hover:border-tint/20 transition-colors">
                        <h3 className="text-fg font-bold text-xl mb-2">Despachos con QR</h3>
                        <p className="text-fg/55 text-sm leading-relaxed mb-5 flex-1">Retiro y entrega verificados con QR único, código de cliente y RUT.</p>
                        <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-4 flex items-center gap-3">
                            <div className="w-16 h-16 rounded-lg bg-brand-3/15 border border-brand-3/25 overflow-hidden shrink-0">
                                <QrModel3D />
                            </div>
                            <div>
                                <p className="text-fg text-xs font-semibold">Despacho #DSP-0219</p>
                                <p className="text-brand-3 text-[11px] font-medium">Entregado · RUT verificado</p>
                            </div>
                        </div>
                    </div>

                    {/* Dashboard — large card */}
                    <div className="lg:col-span-2 rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center hover:border-tint/20 transition-colors">
                        <div className="flex-1 order-2 sm:order-1">
                            <div className="rounded-xl bg-tint/[0.03] border border-tint/10 p-4">
                                <p className="text-fg/40 text-[11px] uppercase tracking-wide mb-3">Top productos</p>
                                <div className="space-y-2">
                                    {topProducts.map(([name, val], i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="text-fg/70">{name}</span>
                                            <span className="text-fg font-semibold">{val}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 order-1 sm:order-2">
                            <h3 className="text-fg font-bold text-xl mb-2">Mira tus ingresos claros</h3>
                            <p className="text-fg/55 text-sm leading-relaxed mb-4">Cuánto vendiste hoy, cuánto cobraste, qué se fue. En números claros, sin Excel.</p>
                            <ul className="space-y-1.5">
                                {["Ventas del día en tiempo real", "Top productos más vendidos", "Exportación CSV de reportes"].map((b, i) => (
                                    <li key={i} className="flex items-center gap-2 text-fg/70 text-sm">
                                        <svg className="w-4 h-4 text-brand-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Clientes */}
                    <div className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 sm:p-8 hover:border-tint/20 transition-colors">
                        <h3 className="text-fg font-bold text-xl mb-2">Clientes e historial</h3>
                        <p className="text-fg/55 text-sm leading-relaxed mb-5">Quién te debe, cuánto y desde cuándo. Todo a la vista.</p>
                        <div className="space-y-2.5">
                            {clients.map(([initials, name, amount, color], i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-ink shrink-0" style={{ background: color }}>{initials}</div>
                                    <span className="text-fg/70 text-xs flex-1">{name}</span>
                                    <span className="text-fg font-semibold text-xs">{amount}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
