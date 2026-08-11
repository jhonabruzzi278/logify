import Layout from "@/components/layout/Layout"
import Comparison1 from "@/components/sections/Comparison1"
import Cta1 from "@/components/sections/Cta1"
import Faqs1 from "@/components/sections/Faqs1"
import Hero1 from "@/components/sections/Hero1"
import Howitwork1 from "@/components/sections/Howitwork1"
import Info1 from "@/components/sections/Info1"
import Pricing1 from "@/components/sections/Pricing1"
import Services1 from "@/components/sections/Services1"
import Showcase1 from "@/components/sections/Showcase1"
import Support1 from "@/components/sections/Support1"

export default function Home() {
    return (
        <Layout>
            <Hero1 />
            <Services1 />
            <Showcase1 />
            <Support1 />
            <Info1 />
            <Howitwork1 />
            <Pricing1 />
            <Comparison1 />
            <Faqs1 />
            <Cta1 />
        </Layout>
    )
}
