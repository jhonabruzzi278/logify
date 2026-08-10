const supportFeatures = [
    { n: "01", title: "Horario amplio", desc: "De lunes a sábado, con buena disponibilidad. Te atendemos cuando más lo necesitas." },
    { n: "02", title: "Directo por WhatsApp", desc: "Sin tickets, sin formularios. Escribes como a un amigo y te respondemos." },
    { n: "03", title: "Respuesta rápida", desc: "Tiempo de respuesta promedio de minutos en horario de atención." },
    { n: "04", title: "Equipo que entiende tu rubro", desc: "Hablamos claro y directo. Entendemos el almacén, el minimarket. No un call center." },
]

const chat = [
    { me: true, text: "Hola, tengo un problema con el stock 😅", time: "21:52" },
    { me: false, text: "Hola! Cuéntame, ¿qué te pasa?", time: "21:52" },
    { me: true, text: "Me figura stock negativo en varios productos", time: "21:53" },
    { me: false, text: "Ya lo veo 👀 Dame 2 minutos y lo resuelvo", time: "21:54" },
    { me: false, text: "Listo ✅ Era un ajuste de inventario mal cargado", time: "21:56" },
    { me: true, text: "Genial, gracias 🙏", time: "21:56" },
]

export default function Support1() {
    return (
        <section className="py-24 sm:py-28 bg-canvas">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-fg font-extrabold mb-5 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>
                            Soporte que<br />realmente ayuda.
                        </h2>
                        <p className="text-fg/55 text-lg mb-10 max-w-md">
                            Un equipo real atiende tu consulta. Sin bots, sin formularios eternos. Respondemos por WhatsApp y resolvemos rápido.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-6">
                            {supportFeatures.map((f, i) => (
                                <div key={i}>
                                    <span className="text-fg/30 font-mono text-xs">{f.n}</span>
                                    <h3 className="text-fg font-bold mt-1 mb-1.5">{f.title}</h3>
                                    <p className="text-fg/50 text-sm leading-relaxed">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="rounded-2xl bg-canvas-2 border border-canvas-border shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] overflow-hidden max-w-sm mx-auto">
                            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-canvas-border bg-brand-3/10">
                                <div className="w-9 h-9 rounded-full bg-brand-3 flex items-center justify-center text-white font-bold text-sm">L</div>
                                <div>
                                    <p className="text-fg text-sm font-semibold">Soporte Logify</p>
                                    <p className="text-brand-3 text-[11px] flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-3" /> en línea
                                    </p>
                                </div>
                            </div>
                            <div className="p-4 space-y-2.5 max-h-[380px] overflow-hidden">
                                {chat.map((m, i) => (
                                    <div key={i} className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${m.me ? 'bg-brand-4 text-ink rounded-br-sm' : 'bg-tint/[0.06] text-fg/85 rounded-bl-sm'}`}>
                                            {m.text}
                                            <span className={`block text-[10px] mt-1 ${m.me ? 'text-ink/50' : 'text-fg/35'}`}>{m.time}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="px-4 py-3 border-t border-canvas-border">
                                <div className="rounded-full bg-tint/[0.04] border border-tint/10 px-4 py-2 text-fg/30 text-xs">Escribe un mensaje…</div>
                            </div>
                        </div>
                        <div className="hidden sm:block absolute -top-5 -right-3 rounded-xl bg-canvas-2 border border-canvas-border shadow-xl px-4 py-2.5 rotate-3">
                            <p className="text-fg/80 text-[11px] font-medium">"Me atendieron a las 10 PM. En 5 minutos solucionado."</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
