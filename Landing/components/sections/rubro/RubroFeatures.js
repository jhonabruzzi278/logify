export default function RubroFeatures({ rubro }) {
    return (
        <section className="py-20 sm:py-24 bg-canvas" id="funciones">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-4">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)' }}>
                        Las funciones que más usan {rubro.articulo === "la" ? "las" : "los"} {rubro.nombrePlural}
                    </h2>
                    <p className="text-fg/55 text-lg">
                        Configuración en 5 minutos, sin curva de aprendizaje. La mayoría registra su primera venta el mismo día que crea la cuenta.
                    </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-5 mt-10">
                    {rubro.features.map((f, i) => (
                        <div key={i} className="rounded-2xl bg-canvas-3 border border-canvas-border p-6 hover:border-tint/20 transition-colors">
                            <h3 className="text-fg font-bold text-lg mb-1.5">{f.title}</h3>
                            <p className="text-fg/55 text-sm leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-10 flex items-center gap-3 text-fg/50 text-sm">
                    <span className="text-brand-3 font-bold">+500 comercios</span>
                    ya gestionan sus ventas con Logify. Todos empezaron con la misma prueba de 30 días.
                </div>
            </div>
        </section>
    )
}
