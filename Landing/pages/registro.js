import Layout from "@/components/layout/Layout"
import OnboardingWizard from "@/components/onboarding/OnboardingWizard"

export default function Registro() {
    return (
        <Layout headTitle="Crea tu cuenta en Logify">
            <section className="py-24 bg-ink relative overflow-hidden min-h-screen flex items-center">
                <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none"/>
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-1/8 blur-3xl pointer-events-none"/>
                <div className="absolute bottom-[-220px] left-[-220px] w-[500px] h-[500px] rounded-full bg-purple/8 blur-3xl pointer-events-none"/>
                <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
                    <OnboardingWizard />
                </div>
            </section>
        </Layout>
    )
}
