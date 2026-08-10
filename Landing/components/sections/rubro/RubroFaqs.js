import { useState } from "react"

export default function RubroFaqs({ rubro }) {
    const [active, setActive] = useState(0)
    return (
        <section className="py-20 sm:py-24 bg-canvas-2" id="faq">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-12">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)' }}>
                        Lo que preguntan {rubro.articulo === "la" ? "las dueñas y dueños" : "los dueños"} de {rubro.nombre.toLowerCase()}
                    </h2>
                </div>
                <div className="space-y-3">
                    {rubro.faqs.map((faq, i) => (
                        <div key={i} className={`rounded-xl overflow-hidden transition-all duration-200 border ${active === i ? 'border-brand-1/40 bg-canvas-3' : 'border-canvas-border bg-canvas-3/50'}`}>
                            <button type="button" onClick={() => setActive(active === i ? null : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
                                <span className="text-fg font-semibold text-base flex-1">{faq.q}</span>
                                <svg className={`w-5 h-5 text-fg/40 shrink-0 transition-transform duration-200 ${active === i ? 'rotate-180 text-brand-3' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            <div className={`transition-all duration-200 overflow-hidden ${active === i ? 'max-h-96 pb-5 px-5' : 'max-h-0'}`}>
                                <p className="text-fg/55 text-sm leading-relaxed">{faq.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
