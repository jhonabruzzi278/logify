const steps = [
    { emoji: "🏪", title: "Regístrate y configura", desc: "Crea tu cuenta en minutos. Agrega productos, categorías y precios. Todo listo para vender." },
    { emoji: "🛒", title: "Vende desde el POS", desc: "Punto de venta rápido e intuitivo. Stock se descuenta automáticamente con cada venta." },
    { emoji: "🚚", title: "Gestióna pedidos y despachos", desc: "Confirma pedidos, asigna repartidores y sigue cada entrega con código QR en tiempo real." },
    { emoji: "📊", title: "Analiza y crece", desc: "Dashboard completo con métricas de ventas, pedidos y stock. Toma decisiones con datos reales." },
]

export default function Howitwork1() {
    return (
        <section className="py-24 bg-[#f0f4f8]" id="como-funciona">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <h2 className="text-brand-2 font-extrabold mb-4" style={{fontSize: 'clamp(1.8rem, 3vw, 2.5rem)'}}>¿Cómo Funciona?</h2>
                    <p className="text-grey-700 text-lg">En solo 4 pasos puedes tener tu negocio funcionando con Logify.</p>
                </div>
                <div className="flex flex-col lg:flex-row items-center gap-14">
                    <div className="lg:w-1/2 w-full">
                        <div className="bg-[#c5e0ed] rounded-2xl p-6 shadow-xl shadow-brand-2/15">
                            <div className="bg-brand-2 rounded-xl px-6 py-3 mb-4">
                                <p className="text-white font-bold text-sm">Flujo de Trabajo Logify</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4">
                                {[["🏪","#FEC201","#034460","Registro"],["🛒","#034460","#FEC201","Ventas"],["🚚","#FEC201","#034460","Despacho"],["📊","#16BA8F","white","Dashboard"]].map(([emoji, bg, fg, label], i) => (
                                    <div key={i} className="flex items-center gap-1 sm:gap-2">
                                        <div className="w-16 sm:w-20 h-12 sm:h-14 rounded-lg flex flex-col items-center justify-center" style={{background: bg}}>
                                            <span className="text-xl sm:text-2xl">{emoji}</span>
                                            <span className="text-[9px] sm:text-[10px] font-medium" style={{color: fg}}>{label}</span>
                                        </div>
                                        {i < 3 && <div className="w-3 sm:w-5 h-0.5 bg-brand-2 rounded-full"/>}
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-3">
                                {["Dashboard en Tiempo Real","Notificaciones Inteligentes"].map((title, i) => (
                                    <div key={i} className="bg-white rounded-xl px-4 py-3 border border-grey-300">
                                        <p className="text-brand-2 font-bold text-xs uppercase mb-1">{title}</p>
                                        <p className="text-grey-500 text-[11px]">{i===0?"Ventas del día · Pedidos activos · Alertas de stock · Reportes":"Alertas de stock crítico · Cambios de estado · Seguimiento en tiempo real"}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="lg:w-1/2 w-full">
                        <ul className="space-y-0">
                            {steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-5 py-5 transition-all duration-300 hover:translate-x-2">
                                    <div className="w-[84px] h-[84px] rounded-full bg-[#ffe799] border border-brand-1 flex items-center justify-center shrink-0 text-4xl shadow-md shadow-brand-1/20 hover:scale-105 hover:shadow-lg hover:shadow-brand-1/30 transition-all duration-300">
                                        {step.emoji}
                                    </div>
                                    <div className="pt-3">
                                        <h5 className="text-brand-2 font-bold text-lg mb-1.5">{step.title}</h5>
                                        <p className="text-grey-700 text-sm leading-relaxed">{step.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    )
}
