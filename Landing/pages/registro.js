import Layout from "@/components/layout/Layout"
import OnboardingWizard from "@/components/onboarding/OnboardingWizard"

export default function Registro() {
    return (
        <Layout headTitle="Crea tu cuenta gratis">
            <section className="py-24 bg-gradient-to-br from-brand-2 to-brand-5 relative overflow-hidden min-h-screen flex items-center">
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-1/8 blur-3xl pointer-events-none"/>
                <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
                    <OnboardingWizard />
                </div>
            </section>
        </Layout>
    )
}
