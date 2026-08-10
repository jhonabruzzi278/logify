const rows = [
    { label: "Ventas mostrador (POS) + pedidos B2B", manual: false, logify: true },
    { label: "Cuenta corriente y fiado por cliente", manual: false, logify: true },
    { label: "Control de stock en tiempo real", manual: false, logify: true },
    { label: "Despachos con QR y seguimiento", manual: false, logify: true },
    { label: "Multiusuario con roles diferenciados", manual: false, logify: true },
    { label: "Panel y reportes exportables", manual: false, logify: true },
    { label: "Acceso desde cualquier dispositivo", manual: true, logify: true },
    { label: "Riesgo de error humano y pérdida de datos", manual: true, logify: false },
]

function Check() {
    return <svg className="w-5 h-5 text-brand-3 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" /></svg>
}

function Cross() {
    return <svg className="w-5 h-5 text-fg/20 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" /></svg>
}

export default function Comparison1() {
    return (
        <section className="py-24 sm:py-28 bg-canvas" id="comparar">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>Logify vs. planillas y cuadernos</h2>
                    <p className="text-fg/55 text-lg">Logify cubre tanto la venta al público (B2C) como tus pedidos B2B, todo en un solo sistema.</p>
                </div>
                <div className="rounded-2xl border border-canvas-border bg-canvas-2 overflow-hidden">
                    <div className="grid grid-cols-3 text-sm sm:text-base font-bold">
                        <div className="p-4 sm:p-5 text-fg/70">Función</div>
                        <div className="p-4 sm:p-5 text-center text-fg/70">Planillas / cuaderno</div>
                        <div className="p-4 sm:p-5 text-center bg-brand-1 text-ink">Logify</div>
                    </div>
                    {rows.map((row, i) => (
                        <div key={i} className={`grid grid-cols-3 text-sm border-t border-canvas-border ${i % 2 === 0 ? 'bg-tint/[0.015]' : ''}`}>
                            <div className="p-4 sm:p-5 text-fg/75 font-medium">{row.label}</div>
                            <div className="p-4 sm:p-5 flex items-center justify-center">{row.manual ? <Check /> : <Cross />}</div>
                            <div className="p-4 sm:p-5 flex items-center justify-center bg-brand-1/5">{row.logify ? <Check /> : <Cross />}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
