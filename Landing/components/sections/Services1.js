import { useState } from "react"

const features = [
    { icon: "🏪", title: "Punto de Venta (POS)", short: "Vende de forma rápida e intuitiva. Agrega productos al carrito, calcula vueltos y genera comprobantes al instante.",
        detail: "El POS de Logify está diseñado para que tu cajero aprenda en segundos. Agrega productos con búsqueda rápida, calcula el vuelto automáticamente, y el stock se descuenta al instante. Compatible con lectores de código de barras y básculas.",
        bullets: ["Carrito de compras rápido","Cálculo automático de vuelto","Descuento automático de stock","Comprobante de venta digital"] },
    { icon: "📦", title: "Control de Inventario", short: "Gestióna tu stock con alertas de inventario crítico. Por producto, por categoría y por proveedor.",
        detail: "Mantén el control total de tu bodega. Registra cada producto con SKU, precio, costo y categoría. Logify te avisa automáticamente cuando un producto llega a nivel crítico, para que nunca te quedes sin stock de lo que más vendes.",
        bullets: ["Alertas de stock crítico y warning","Seguimiento por proveedor","Costos y precios por producto","Categorías personalizables"] },
    { icon: "📋", title: "Gestión de Pedidos", short: "Crea, confirma y da seguimiento a cada pedido. Desde la creación hasta la entrega final.",
        detail: "Cada pedido pasa por 5 etapas claras: Creado → En Preparación → En Reparto → Entregado. Puedes confirmar pedidos (descontando stock automáticamente) y cancelarlos con un motivo. El historial completo de cada pedido queda registrado.",
        bullets: ["5 estados de pedido (CREATED → ENTREGADO)","Validación de stock antes de crear","Cancelación con motivo","Historial completo por cliente"] },
    { icon: "🚚", title: "Despachos y Reparto", short: "Coordina entregas con código QR, asigna repartidores y registra la entrega con código de cliente y RUT.",
        detail: "Cada pedido confirmado genera un despacho automático con código QR único. El repartidor usa ese QR para retirar el pedido. La entrega se confirma en destino con el código del cliente y el RUT de quien recibe.",
        bullets: ["QR único por despacho","Retiro con código QR","Entrega con código cliente + RUT","Foto de prueba de entrega"] },
    { icon: "📊", title: "Dashboard y Reportes", short: "Visualiza tus ventas del día, pedidos activos, productos con stock crítico y genera reportes exportables.",
        detail: "El dashboard te muestra de un vistazo ¿cuánto vendiste hoy?, pedidos activos, productos con stock bajo y más. Puedes filtrar por fecha y exportar reportes detallados en CSV para usarlos en Excel u otras herramientas de análisis.",
        bullets: ["Ventas del día en CLP","Pedidos activos por estado","Top productos más vendidos","Exportación CSV de reportes"] },
    { icon: "👥", title: "Clientes e Historial", short: "Mantén un registro completo de tus clientes con su historial de pedidos, contactos y estadísticas.",
        detail: "Cada cliente tiene su perfil con historial completo de pedidos: cuántos ha hecho, cuáles fueron entregados, cuáles están activos y cuáles cancelados. Toda la trazabilidad desde el primer pedido hasta el último, en un solo lugar.",
        bullets: ["Perfil por cliente con historial","Estadísticas de pedidos","Datos de contacto","Búsqueda y filtro de clientes"] }
]

export default function Services1() {
    const [openIndex, setOpenIndex] = useState(null)
    return (
        <section className="py-24" id="caracteristicas">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <h2 className="text-brand-2 font-extrabold mb-4" style={{fontSize: 'clamp(1.8rem, 3vw, 2.5rem)'}}>Todo lo que tu negocio necesita</h2>
                    <p className="text-grey-700 text-lg">Una plataforma completa para gestionar tu pequeño comercio de forma eficiente.</p>
                </div>
                <div className="space-y-4">
                    {features.map((f, i) => (
                        <div key={i} className={`border rounded-2xl overflow-hidden transition-all duration-300 ${openIndex === i ? 'border-brand-1 shadow-lg shadow-brand-1/15' : 'border-grey-300 hover:shadow-md'}`}>
                            <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center gap-4 p-5 sm:p-6 text-left">
                                <span className="text-4xl shrink-0">{f.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <h5 className="text-brand-2 font-bold text-lg mb-1">{f.title}</h5>
                                    <p className="text-grey-500 text-sm line-clamp-1">{f.short}</p>
                                </div>
                                <svg className={`w-5 h-5 text-brand-2/40 shrink-0 transition-transform duration-300 ${openIndex === i ? 'rotate-180 text-brand-2' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div className={`transition-all duration-300 overflow-hidden ${openIndex === i ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="px-5 sm:px-6 pb-6">
                                    <p className="text-grey-700 mb-5">{f.detail}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {f.bullets.map((b, j) => (
                                            <div key={j} className="flex items-start gap-2 text-sm text-grey-700">
                                                <svg className="w-4 h-4 text-brand-3 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"/></svg>
                                                {b}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
