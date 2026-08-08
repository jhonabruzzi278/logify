import { useState } from "react"

const faqs = [
    { q: "¿Qué necesito para usar Logify?", a: "Solo un navegador web moderno y conexión a internet. Logify funciona 100% en la nube, no necesitas instalar nada." },
    { q: "¿Puedo probar Logify antes de pagar?", a: "Sí, ofrecemos 30 días de prueba gratuita en cualquier plan. Sin compromiso y sin necesidad de tarjeta de crédito." },
    { q: "¿Logify funciona para cualquier tipo de negocio?", a: "Logify está diseñado para pequeños y medianos comercios: almacenes, minimarkets, botillerías, ferias, tiendas de barrio, y cualquier negocio que necesite POS, inventario y despachos." },
    { q: "¿El stock se actualiza automáticamente?", a: "Sí. Cuando vendes desde el POS o confirmas un pedido, el stock se descuenta automáticamente. También recibirás alertas cuando un producto tenga stock crítico." },
    { q: "¿Cómo funciona el sistema de despachos?", a: "Cuando confirmas un pedido, se crea un despacho automáticamente. El repartidor usa un código QR para marcar el retiro, y la entrega se confirma con el código del cliente y su RUT." },
    { q: "¿Puedo cancelar un pedido?", a: "Sí, puedes cancelar pedidos en cualquier etapa. Si el stock ya fue descontado, se restaura automáticamente al cancelar." },
    { q: "¿Logify tiene app móvil?", a: "Por ahora Logify es una aplicación web progresiva (PWA) que funciona en cualquier dispositivo. Los repartidores pueden acceder desde su celular para gestionar entregas." },
    { q: "¿Puedo exportar mis datos?", a: "Sí, puedes exportar reportes de ventas, pedidos e inventario en formato CSV para usarlos en Excel u otras herramientas." },
]

export default function Faqs1() {
    const [active, setActive] = useState(null)
    return (
        <section className="py-24" id="faq">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <h2 className="text-brand-2 font-extrabold mb-4" style={{fontSize: 'clamp(1.8rem, 3vw, 2.5rem)'}}>Preguntas Frecuentes</h2>
                    <p className="text-grey-700 text-lg">Todo lo que necesitas saber sobre Logify.</p>
                </div>
                <div className="space-y-3">
                    {faqs.map((faq, i) => (
                        <div key={i} className={`border rounded-xl overflow-hidden transition-all duration-200 ${active === i ? 'border-brand-1 shadow-md' : 'border-grey-300'}`}>
                            <button onClick={() => setActive(active === i ? null : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
                                <span className="text-brand-2 font-semibold text-base flex-1">{faq.q}</span>
                                <svg className={`w-5 h-5 text-grey-500 shrink-0 transition-transform duration-200 ${active === i ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div className={`transition-all duration-200 overflow-hidden ${active === i ? 'max-h-96 pb-5 px-5' : 'max-h-0'}`}>
                                <p className="text-grey-700 text-sm leading-relaxed">{faq.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
