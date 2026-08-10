const steps = [
    { emoji: "🏪", title: "Regístrate y configura", desc: "Crea tu cuenta en minutos. Agrega productos, categorías y precios. Todo listo para vender.", iconBg: "bg-brand-4/10 border-brand-4/20" },
    { emoji: "🛒", title: "Vende desde el POS", desc: "Punto de venta rápido e intuitivo. Stock se descuenta automáticamente con cada venta.", iconBg: "bg-brand-1/10 border-brand-1/20" },
    { emoji: "🚚", title: "Gestiona pedidos y despachos", desc: "Confirma pedidos, asigna repartidores y sigue cada entrega con código QR en tiempo real.", iconBg: "bg-brand-3/10 border-brand-3/20" },
    { emoji: "📊", title: "Analiza y crece", desc: "Panel completo con métricas de ventas, pedidos y stock. Toma decisiones con datos reales.", iconBg: "bg-brand-4/10 border-brand-4/20" },
]

export default function Howitwork1() {
    return (
        <section className="py-24 sm:py-28" id="como-funciona">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-14">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>
                        En 4 pasos, tu negocio funcionando.
                    </h2>
                    <p className="text-fg/55 text-lg">Sin instalaciones ni curva de aprendizaje. Empiezas a operar el mismo día.</p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {steps.map((step, i) => (
                        <div key={i} className="relative rounded-2xl bg-canvas-3 border border-canvas-border p-6 hover:border-tint/20 hover:-translate-y-1 transition-all duration-300">
                            <span className="absolute top-5 right-5 text-fg/10 font-extrabold text-3xl leading-none">{String(i + 1).padStart(2, "0")}</span>
                            <div className={`w-14 h-14 rounded-xl border flex items-center justify-center text-2xl mb-5 ${step.iconBg}`}>
                                {step.emoji}
                            </div>
                            <h3 className="text-fg font-bold text-lg mb-2">{step.title}</h3>
                            <p className="text-fg/55 text-sm leading-relaxed">{step.desc}</p>
                            {i < steps.length - 1 && (
                                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-tint/10" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
