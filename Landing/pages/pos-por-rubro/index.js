import Head from "next/head"
import Link from "next/link"
import Layout from "@/components/layout/Layout"
import Breadcrumb from "@/components/elements/Breadcrumb"
import rubros from "@/data/rubros"

const SITE_URL = "https://logify.cl"

const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "POS por rubro", item: `${SITE_URL}/pos-por-rubro` },
    ],
}

export default function RubrosIndex() {
    return (
        <Layout
            headTitle="Sistema POS por Rubro | Logify"
            description="Logify tiene un sistema POS adaptado a cada tipo de comercio: almacenes, minimarkets, botillerías, verdulerías, carnicerías, panaderías, ferreterías y farmacias."
            path="/pos-por-rubro"
        >
            <Head>
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            </Head>
            <Breadcrumb items={[
                { label: "Inicio", href: "/" },
                { label: "POS por rubro" },
            ]} />
            <section className="relative overflow-hidden bg-canvas pt-10 pb-20 lg:pb-24">
                <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none" />
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <h1 className="text-fg font-extrabold leading-[1.1] mb-6 tracking-tight" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.1rem)' }}>
                        Un sistema POS adaptado a tu rubro
                    </h1>
                    <p className="text-lg text-fg/60 leading-relaxed mb-12 max-w-2xl">
                        Logify se adapta a cómo vende cada tipo de comercio: por peso, por unidad, con catálogos grandes o con fiado de clientes frecuentes. Elige tu rubro para ver cómo funciona.
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {rubros.map((r) => (
                            <Link key={r.slug} href={`/pos-por-rubro/${r.slug}`}
                                className="group rounded-2xl bg-canvas-3 border border-canvas-border p-6 hover:border-brand-3/40 transition-colors"
                            >
                                <h2 className="text-fg font-bold text-lg mb-2">{r.nombre}</h2>
                                <p className="text-fg/55 text-sm leading-relaxed mb-4">{r.heroSubtitle}</p>
                                <span className="inline-flex items-center gap-1.5 text-brand-3 text-sm font-semibold group-hover:gap-2.5 transition-all">
                                    Ver sistema POS para {r.nombrePlural}
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </Layout>
    )
}
