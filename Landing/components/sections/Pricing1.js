import Link from "next/link"

const plan = { name: "Negocio", desc: "La opcion mas completa para tu negocio en crecimiento.", price: "39", year: "399", features: ["POS completo + carrito","Productos ilimitados","Despachos con QR + repartidor","Dashboard avanzado + reportes","Alertas de stock crítico","Soporte prioritario"] }

export default function Pricing1() {
    return (
        <section className="py-24 bg-grey-100" id="planes">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <h2 className="text-brand-2 font-extrabold mb-4" style={{fontSize: 'clamp(1.8rem, 3vw, 2.5rem)'}}>Plan de Negocio</h2>
                    <p className="text-grey-500 text-lg">Prueba gratuita de 90 días. Sin compromiso, cancela cuando quieras.</p>
                </div>
                <div className="flex justify-center">
                    <div className="rounded-2xl p-8 flex flex-col max-w-md w-full bg-brand-2 border-2 border-brand-1 relative shadow-lg shadow-brand-1/20">
                        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-1 text-brand-2 text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">Mas Popular</span>
                        <h3 className="text-brand-1 font-bold text-xl mb-2">{plan.name}</h3>
                        <p className="text-white/70 text-sm mb-6">{plan.desc}</p>
                        <div className="mb-6">
                            <div className="flex items-baseline gap-1">
                                <span className="text-brand-1 font-extrabold" style={{fontSize: '2.5rem'}}>${plan.price}</span>
                                <span className="text-white/60 text-sm">/mes</span>
                            </div>
                            <div className="flex items-baseline gap-1 -mt-1">
                                <span className="text-brand-1 font-bold text-lg">${plan.year}</span>
                                <span className="text-white/60 text-xs">/año</span>
                            </div>
                        </div>
                        <div className="border-t border-grey-200 mb-6"/>
                        <ul className="space-y-3 flex-1">
                            {plan.features.map((feat, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-white/80">
                                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-brand-1" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"/></svg>
                                    {feat}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-8">
                            <Link href="/registro"
                                className="block text-center font-bold py-3.5 rounded-xl transition-all hover:-translate-y-0.5 bg-brand-1 text-brand-2 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-brand-2"
                                aria-label="Comenzar prueba gratuita de Logify">
                                Comenzar Prueba
                                <svg className="w-4 h-4 inline ml-2" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
