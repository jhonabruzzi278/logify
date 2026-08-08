import Link from "next/link"

export default function Info1() {
    return (
        <section className="py-20 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col lg:flex-row items-center gap-14">
                    <div className="lg:w-1/2 w-full">
                        <svg width="100%" viewBox="0 0 540 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[540px] mx-auto">
                            <rect x="20" y="20" width="500" height="380" rx="20" fill="white" stroke="#CDE2E7" strokeWidth="1"/>
                            <rect x="40" y="40" width="460" height="55" rx="10" fill="#034460"/>
                            <text x="60" y="72" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="white">Logify Dashboard</text>
                            <rect x="50" y="110" width="140" height="85" rx="12" fill="#FFE799"/>
                            <text x="65" y="142" fontFamily="Arial" fontSize="13" fill="#034460">Ventas Hoy</text>
                            <text x="65" y="175" fontFamily="Arial" fontWeight="bold" fontSize="24" fill="#034460">$245.600</text>
                            <rect x="205" y="110" width="140" height="85" rx="12" fill="#DFF9F3"/>
                            <text x="220" y="142" fontFamily="Arial" fontSize="13" fill="#034460">Pedidos Activos</text>
                            <text x="220" y="175" fontFamily="Arial" fontWeight="bold" fontSize="24" fill="#034460">12</text>
                            <rect x="360" y="110" width="140" height="85" rx="12" fill="#EBF5F8"/>
                            <text x="375" y="142" fontFamily="Arial" fontSize="13" fill="#034460">Stock Crítico</text>
                            <text x="375" y="175" fontFamily="Arial" fontWeight="bold" fontSize="24" fill="#FF3E3E">3</text>
                            <rect x="50" y="210" width="220" height="170" rx="12" fill="#F9FAF5" stroke="#CDE2E7"/>
                            <text x="70" y="240" fontFamily="Arial" fontWeight="bold" fontSize="14" fill="#034460">Ventas por Hora</text>
                            <rect x="70" y="255" width="180" height="12" rx="6" fill="#E0F0F6"/><rect x="70" y="255" width="120" height="12" rx="6" fill="#FEC201"/>
                            <rect x="70" y="280" width="180" height="12" rx="6" fill="#E0F0F6"/><rect x="70" y="280" width="150" height="12" rx="6" fill="#16BA8F"/>
                            <rect x="70" y="305" width="180" height="12" rx="6" fill="#E0F0F6"/><rect x="70" y="305" width="90" height="12" rx="6" fill="#28A7E6"/>
                            <rect x="70" y="330" width="180" height="12" rx="6" fill="#E0F0F6"/><rect x="70" y="330" width="60" height="12" rx="6" fill="#F69D30"/>
                            <rect x="290" y="210" width="220" height="170" rx="12" fill="#F9FAF5" stroke="#CDE2E7"/>
                            <text x="310" y="240" fontFamily="Arial" fontWeight="bold" fontSize="14" fill="#034460">Top Productos</text>
                            {[["1. Coca-Cola 2L","$85.200"],["2. Papas Lays","$42.100"],["3. Jugo Watt's","$38.500"],["4. Menta Alka","$24.300"]].map(([name, val], i) => (
                                <g key={i}>
                                    <text x="310" y={265 + i*25} fontFamily="Arial" fontSize="12" fill="#5B647C">{name}</text>
                                    <text x="460" y={265 + i*25} fontFamily="Arial" fontSize="12" fill="#034460">{val}</text>
                                </g>
                            ))}
                        </svg>
                    </div>
                    <div className="lg:w-1/2 w-full">
                        <h2 className="text-brand-2 font-extrabold mb-5" style={{fontSize: 'clamp(1.8rem, 3vw, 2.5rem)'}}>Control total de tu negocio</h2>
                        <p className="text-grey-700 text-lg mb-8">Logify te da visibilidad completa sobre tus ventas, inventario y pedidos en tiempo real. Toma decisiones informadas con datos actualizados al instante.</p>
                        <ul className="space-y-3 mb-8">
                            {["Dashboard en tiempo real con métricas clave","Alertas automáticas de stock crítico","Reportes exportables en CSV","Historial completo de clientes y pedidos","Multiusuario con roles y permisos"].map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-grey-700">
                                    <svg className="w-4 h-4 text-brand-3 shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"/></svg>
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <Link href="/registro" className="inline-flex items-center gap-2 bg-brand-1 text-brand-2 font-bold px-6 py-3.5 rounded-xl hover:bg-yellow-400 transition-all hover:-translate-y-0.5">
                            Probar Gratis 30 Días
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
