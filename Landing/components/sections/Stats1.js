export default function Stats1() {
    const stats = [
        { icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10", value: "+500", label: "Comercios Activos" },
        { icon: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12", value: "+50k", label: "Pedidos Gestiónados" },
        { icon: "M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6", value: "+120k", label: "Productos Vendidos" },
        { icon: "M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3", value: "99%", label: "Satisfacción Cliente" },
    ]
    return (
        <section className="py-20 bg-brand-2">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((s, i) => (
                        <div key={i} className="flex items-center gap-5 p-6 bg-white/5 border border-brand-1/20 rounded-2xl hover:bg-white/8 hover:border-brand-1/40 hover:-translate-y-1 transition-all duration-300">
                            <div className="w-16 h-16 rounded-xl bg-brand-1/10 flex items-center justify-center shrink-0">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FEC201" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {s.icon.split(/(?=M)/).map((d, j) => <path key={j} d={d}/>)}
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-4xl font-extrabold text-brand-1 leading-none mb-1">{s.value}</h2>
                                <p className="text-sm text-white/70 font-medium">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
