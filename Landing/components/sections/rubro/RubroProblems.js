export default function RubroProblems({ rubro }) {
    return (
        <section className="py-20 sm:py-24 bg-canvas-2">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-12">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)' }}>
                        Lo que {rubro.articulo === "la" ? "una" : "un"} {rubro.nombre.toLowerCase()} enfrenta cada día
                    </h2>
                </div>
                <div className="grid sm:grid-cols-3 gap-5">
                    {rubro.painPoints.map((p, i) => (
                        <div key={i} className="rounded-2xl bg-canvas-3 border border-canvas-border p-6">
                            <div className="w-9 h-9 rounded-lg bg-brand-3/10 border border-brand-3/20 flex items-center justify-center text-brand-3 font-bold text-sm mb-4">
                                {String(i + 1).padStart(2, "0")}
                            </div>
                            <h3 className="text-fg font-bold text-base mb-2 leading-snug">{p.title}</h3>
                            <p className="text-fg/55 text-sm leading-relaxed">{p.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
