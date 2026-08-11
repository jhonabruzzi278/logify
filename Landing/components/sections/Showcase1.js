export default function Showcase1() {
    return (
        <section className="py-24 sm:py-28">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mb-14">
                    <h2 className="text-fg font-extrabold mb-4 tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.75rem)' }}>
                        Así se ve Logify en tu negocio
                    </h2>
                    <p className="text-fg/55 text-lg">
                        El mismo panel, en cualquier pantalla. Desde el mesón con el celular o desde la oficina con el computador.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                    <div className="lg:col-span-3 rounded-2xl bg-canvas-3 border border-canvas-border overflow-hidden hover:border-tint/20 transition-colors">
                        <div className="aspect-[16/10.7]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/assets/imgs/mockups/hero-dashboard.jpg"
                                alt="Panel de Logify abierto en laptop, mostrando el dashboard con ventas y alertas de stock"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                        <div className="p-6">
                            <h3 className="text-fg font-bold text-lg mb-1">Panel completo desde tu computador</h3>
                            <p className="text-fg/55 text-sm">Ventas, stock, pedidos y reportes en un solo lugar, sin instalar nada.</p>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex flex-col gap-5">
                        <div className="rounded-2xl bg-canvas-3 border border-canvas-border overflow-hidden hover:border-tint/20 transition-colors flex-1">
                            <div className="aspect-[3/2]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/assets/imgs/mockups/phone-dashboard.jpg"
                                    alt="Panel de Logify abierto en celular, mostrando indicadores de ventas"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <div className="p-5">
                                <h3 className="text-fg font-bold text-base mb-1">También desde tu celular</h3>
                                <p className="text-fg/55 text-sm">Revisa el negocio o gestiona un despacho desde cualquier lugar.</p>
                            </div>
                        </div>

                        <div className="rounded-2xl bg-canvas-3 border border-canvas-border overflow-hidden hover:border-tint/20 transition-colors">
                            <div className="aspect-[16/9.5]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/assets/imgs/mockups/dashboard-b2b.jpg"
                                    alt="Panel B2B de Logify con pedidos, envíos y calendario"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <div className="p-5">
                                <h3 className="text-fg font-bold text-base mb-1">Vista B2B para pedidos y envíos</h3>
                                <p className="text-fg/55 text-sm">Un modo dedicado para distribuidoras y ventas por mayor.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
