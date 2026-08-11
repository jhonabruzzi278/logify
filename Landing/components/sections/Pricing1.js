import { useState } from "react"
import Link from "next/link"

const plan = {
    name: "Negocio",
    desc: "Todo lo que tu negocio necesita para vender, controlar stock, gestionar pedidos y despachar, en un solo lugar.",
    monthly: 10000,
    annualTotal: 60000,
    features: [
        "POS con carrito rápido y escáner de código de barras",
        "Fiado y cuenta corriente por cliente",
        "Cierre de caja por método de pago",
        "Productos ilimitados",
        "Alertas de stock crítico y bajo",
        "Costos, precios y categorías personalizables",
        "Gestión de pedidos con 5 estados",
        "Cancelación de pedidos con motivo",
        "Despachos con QR y asignación de repartidor",
        "Entrega verificada con código de cliente y RUT",
        "Panel con ventas, ingresos y reportes exportables en CSV",
        "Historial y estadísticas por cliente",
        "Multiusuario con roles y permisos",
        "Soporte por WhatsApp",
    ],
}

const discountPct = Math.round(100 - (plan.annualTotal / (plan.monthly * 12)) * 100)
const formatCLP = (n) => n.toLocaleString("es-CL")

export default function Pricing1() {
    const [annual, setAnnual] = useState(false)
    const displayPrice = annual ? Math.round(plan.annualTotal / 12) : plan.monthly

    return (
        <section className="py-24 sm:py-28" id="planes">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="relative flex justify-center mb-2">
                    <div className="absolute inset-x-0 top-10 h-64 bg-brand-1/10 blur-[100px] pointer-events-none" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/assets/imgs/mockups/plan-basico-monitor.webp"
                        alt="Panel de Logify abierto en un computador de escritorio junto a una impresora de tickets"
                        className="relative w-full max-w-xl h-auto"
                        loading="lazy"
                    />
                </div>

                <div className="text-center max-w-2xl mx-auto mb-10">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>Elige tu plan.</h2>
                    <p className="text-fg/55 text-lg">Prueba gratuita de 30 días. Después pagas el precio normal, sin compromiso y cancela cuando quieras.</p>
                </div>

                <div className="flex justify-center mb-12">
                    <div className="inline-flex items-center gap-1 bg-canvas-3 border border-canvas-border rounded-full p-1">
                        <button type="button" onClick={() => setAnnual(false)}
                            className={`text-sm font-semibold px-5 py-2 rounded-full transition-colors ${!annual ? 'bg-brand-1 text-ink' : 'text-fg/60 hover:text-fg'}`}
                        >Mensual</button>
                        <button type="button" onClick={() => setAnnual(true)}
                            className={`text-sm font-semibold px-5 py-2 rounded-full transition-colors flex items-center gap-2 ${annual ? 'bg-brand-1 text-ink' : 'text-fg/60 hover:text-fg'}`}
                        >
                            Anual
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${annual ? 'bg-ink/15 text-ink' : 'bg-brand-3/15 text-brand-3'}`}>-{discountPct}%</span>
                        </button>
                    </div>
                </div>

                <div className="flex justify-center">
                    <div className="rounded-2xl p-8 sm:p-10 flex flex-col max-w-2xl w-full bg-canvas-3 border-2 border-brand-1 relative shadow-[0_30px_70px_-30px_rgba(143,171,212,0.25)]">
                        <h3 className="text-fg font-bold text-xl mb-2">{plan.name}</h3>
                        <p className="text-fg/60 text-sm mb-6 max-w-md">{plan.desc}</p>
                        <div className="mb-6">
                            <div className="flex items-baseline gap-1">
                                <span className="text-fg font-extrabold" style={{ fontSize: '2.5rem' }}>${formatCLP(displayPrice)}</span>
                                <span className="text-fg/50 text-sm">/mes</span>
                            </div>
                            {annual ? (
                                <p className="text-fg/40 text-xs mt-1">${formatCLP(plan.annualTotal)} facturado anualmente</p>
                            ) : (
                                <p className="text-fg/40 text-xs mt-1">o ${formatCLP(plan.annualTotal)}/año ({discountPct}% dto.)</p>
                            )}
                            <p className="text-fg/40 text-xs mt-1">Precio normal después de tu prueba gratis de 30 días.</p>
                        </div>
                        <div className="border-t border-tint/10 mb-6" />
                        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                            {plan.features.map((feat, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-fg/75">
                                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-brand-3" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
                                    {feat}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-8">
                            <Link href="/registro"
                                className="block text-center font-bold py-3.5 rounded-xl transition-all hover:-translate-y-0.5 bg-brand-1 text-ink hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-brand-3 focus:ring-offset-2 focus:ring-offset-canvas-3"
                                aria-label="Comenzar prueba gratuita de Logify">
                                Comenzar Prueba
                                <svg className="w-4 h-4 inline ml-2" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
