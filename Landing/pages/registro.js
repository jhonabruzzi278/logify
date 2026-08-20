import Layout from "@/components/layout/Layout"

// El signup self-service (OnboardingWizard) esta desactivado temporalmente:
// crea el tenant en Postgres pero el subdominio resultante (<slug>.logify.cl)
// depende del wildcard *.logify.cl en Vercel, que se dio de baja al migrar
// hacia el modelo de portal unico (ver wiki/Multi-Tenant.md). Reactivar aca
// cuando el flujo de alta quede adaptado a ese modelo.
export default function Registro() {
    return (
        <Layout headTitle="Crea tu cuenta gratis">
            <section className="py-24 bg-ink relative overflow-hidden min-h-screen flex items-center">
                <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none"/>
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-1/8 blur-3xl pointer-events-none"/>
                <div className="absolute bottom-[-220px] left-[-220px] w-[500px] h-[500px] rounded-full bg-purple/8 blur-3xl pointer-events-none"/>
                <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full text-center">
                    <h1 className="text-white font-extrabold leading-tight mb-4" style={{fontSize: 'clamp(2rem, 4vw, 2.75rem)'}}>
                        El registro está <span className="text-brand-1">en pausa</span>
                    </h1>
                    <p className="text-white/80 mb-8">
                        Estamos actualizando cómo se crean las cuentas nuevas en Logify.
                        Escríbenos y te ayudamos a activar tu cuenta manualmente mientras tanto.
                    </p>
                    <a href="https://wa.me/56938980598"
                        className="inline-flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-4 px-8 rounded-xl hover:brightness-90 hover:-translate-y-0.5 transition-colors shadow-lg shadow-brand-1/30"
                    >
                        Escribir por WhatsApp
                    </a>
                </div>
            </section>
        </Layout>
    )
}
