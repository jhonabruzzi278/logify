import Head from "next/head"
import Layout from "@/components/layout/Layout"
import Breadcrumb from "@/components/elements/Breadcrumb"
import RubroHero from "@/components/sections/rubro/RubroHero"
import RubroProblems from "@/components/sections/rubro/RubroProblems"
import RubroFeatures from "@/components/sections/rubro/RubroFeatures"
import RubroFaqs from "@/components/sections/rubro/RubroFaqs"
import RubroCta from "@/components/sections/rubro/RubroCta"
import rubros from "@/data/rubros"

const SITE_URL = "https://logify.cl"

function buildJsonLd(rubro) {
    const breadcrumbList = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "POS por rubro", item: `${SITE_URL}/pos-por-rubro` },
            { "@type": "ListItem", position: 3, name: rubro.nombre, item: `${SITE_URL}/pos-por-rubro/${rubro.slug}` },
        ],
    }
    const faqPage = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: rubro.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
    }
    return [breadcrumbList, faqPage]
}

export default function RubroPage({ rubro }) {
    const jsonLd = buildJsonLd(rubro)
    return (
        <Layout headTitle={rubro.metaTitle} description={rubro.metaDescription} path={`/pos-por-rubro/${rubro.slug}`}>
            <Head>
                {jsonLd.map((data, i) => (
                    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
                ))}
            </Head>
            <Breadcrumb items={[
                { label: "Inicio", href: "/" },
                { label: "POS por rubro", href: "/pos-por-rubro" },
                { label: rubro.nombre },
            ]} />
            <RubroHero rubro={rubro} />
            <RubroProblems rubro={rubro} />
            <RubroFeatures rubro={rubro} />
            <RubroFaqs rubro={rubro} />
            <RubroCta rubro={rubro} />
        </Layout>
    )
}

export async function getStaticPaths() {
    return {
        paths: rubros.map((r) => ({ params: { rubro: r.slug } })),
        fallback: false,
    }
}

export async function getStaticProps({ params }) {
    const rubro = rubros.find((r) => r.slug === params.rubro)
    if (!rubro) {
        return { notFound: true }
    }
    return { props: { rubro } }
}
