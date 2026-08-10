import rubros from "@/data/rubros"

const SITE_URL = "https://logify.cl"

function generateSitemap() {
    const staticPages = [
        { path: "/", priority: "1.0", changefreq: "weekly" },
        { path: "/pos-por-rubro", priority: "0.8", changefreq: "weekly" },
        { path: "/registro", priority: "0.7", changefreq: "monthly" },
        { path: "/acceso", priority: "0.5", changefreq: "monthly" },
        { path: "/politica-de-privacidad", priority: "0.3", changefreq: "yearly" },
    ]

    const rubroPages = rubros.map((r) => ({
        path: `/pos-por-rubro/${r.slug}`,
        priority: "0.7",
        changefreq: "weekly",
    }))

    const urls = [...staticPages, ...rubroPages]

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${SITE_URL}${u.path}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`
}

export async function getServerSideProps({ res }) {
    res.setHeader("Content-Type", "application/xml")
    res.write(generateSitemap())
    res.end()
    return { props: {} }
}

export default function Sitemap() {
    return null
}
