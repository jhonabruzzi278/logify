import Head from "next/head"

const SITE_URL = "https://logify.cl"
const DEFAULT_TITLE = "Logify - POS e Inventario para tu Negocio"
const DEFAULT_DESCRIPTION =
    "Logify: plataforma todo-en-uno para pequeños comercios. POS, control de inventario, pedidos, despachos y dashboard en un solo lugar."

const JSON_LD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Logify",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: DEFAULT_DESCRIPTION,
    offers: {
        "@type": "Offer",
        category: "SaaS"
    }
}
const JSON_LD_STRING = JSON.stringify(JSON_LD)

export default function PageHead({ headTitle, description, path = "/" }) {
    const title = headTitle || DEFAULT_TITLE
    const desc = description || DEFAULT_DESCRIPTION
    const canonicalUrl = `${SITE_URL}${path}`

    return (
        <Head>
            <title>{title}</title>
            <meta name="description" content={desc} />
            <link rel="canonical" href={canonicalUrl} />
            <link rel="icon" type="image/svg+xml" href="/assets/imgs/template/favicon.svg" />

            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Logify" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={desc} />
            <meta property="og:url" content={canonicalUrl} />
            {/* og-image.png (1200x630) todavía no existe: agregar el archivo real en
                Landing/public/og-image.png antes de desplegar. */}
            <meta property="og:image" content={`${SITE_URL}/og-image.png`} />
            <meta name="twitter:card" content="summary_large_image" />

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON_LD_STRING }}
            />
        </Head>
    )
}
