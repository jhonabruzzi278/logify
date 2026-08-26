import Link from "next/link"
import Layout from "@/components/layout/Layout"

export default function Acceso() {
    return (
        <Layout headTitle="Acceso Clientes">
            <section className="py-24 bg-ink relative overflow-hidden min-h-screen">
                <div className="absolute inset-0 bg-noise opacity-40 pointer-events-none"/>
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-1/8 blur-3xl pointer-events-none"/>
                <div className="absolute bottom-[-220px] left-[-220px] w-[500px] h-[500px] rounded-full bg-purple/8 blur-3xl pointer-events-none"/>
                <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center mb-10">
                        <h1 className="text-white font-extrabold leading-tight mb-4" style={{fontSize: 'clamp(2rem, 4vw, 2.75rem)'}}>
                            Accede a tu <span className="text-brand-1">panel</span>
                        </h1>
                        <p className="text-white/80">Todos los clientes ingresan desde el mismo lugar. Logify identificará tu empresa automáticamente.</p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/30">
                        <p className="text-sm leading-6 text-grey-500">
                            Usa tu correo o usuario y la contraseña entregada durante la activación. En tu primer ingreso te guiaremos para dejar el negocio configurado.
                        </p>
                        <a href="https://app.logify.cl/login"
                            className="w-full mt-6 flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-4 rounded-xl hover:brightness-90 hover:-translate-y-0.5 transition-colors shadow-lg shadow-brand-1/30 focus:outline-none focus:ring-2 focus:ring-brand-3 focus:ring-offset-2"
                            aria-label="Iniciar sesión en Logify"
                        >
                            Ingresar a Logify
                        </a>
                        <p className="text-center text-xs text-grey-500 mt-4">
                            ¿Todavía no tienes una cuenta? <Link href="/registro" className="text-brand-3 font-semibold">Solicita acceso</Link>
                        </p>
                    </div>
                </div>
            </section>
        </Layout>
    )
}
