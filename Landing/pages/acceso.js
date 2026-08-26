import { useState } from "react"
import Link from "next/link"
import Layout from "@/components/layout/Layout"
import { slugify, tenantLoginUrl } from "@/util/tenant"

export default function Acceso() {
    const [slug, setSlug] = useState("")

    const handleSubmit = (e) => {
        e.preventDefault()
        const clean = slugify(slug)
        if (!clean) return
        window.location.href = tenantLoginUrl(clean)
    }

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
                        <p className="text-white/80">Ingresa el subdominio de tu empresa para ir a tu panel de Logify.</p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/30">
                        <form onSubmit={handleSubmit}>
                            <label htmlFor="slug" className="block text-brand-2 font-semibold text-sm mb-1.5">Subdominio de tu empresa</label>
                            <div className="flex items-stretch">
                                <input
                                    id="slug"
                                    name="slug"
                                    type="text"
                                    placeholder="acme"
                                    required
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-r-0 border-grey-300 rounded-l-xl text-sm bg-grey-100 text-brand-2 [color-scheme:light] focus:border-brand-1 focus:bg-white outline-none transition-colors"
                                />
                                <span className="inline-flex items-center px-3 border-2 border-grey-300 rounded-r-xl bg-grey-200 text-grey-500 text-sm whitespace-nowrap">.logify.cl</span>
                            </div>
                            <p className="text-xs text-grey-500 mt-1.5">
                                Es el subdominio que te asignamos al activar tu cuenta.
                            </p>

                            <button type="submit"
                                className="w-full mt-6 flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-4 rounded-xl hover:brightness-90 hover:-translate-y-0.5 transition-colors shadow-lg shadow-brand-1/30 focus:outline-none focus:ring-2 focus:ring-brand-3 focus:ring-offset-2"
                                aria-label="Ir a mi panel de Logify"
                            >
                                Ir a mi panel
                            </button>
                            <p className="text-center text-xs text-grey-500 mt-4">
                                ¿Todavía no tienes acceso? <Link href="/registro" className="text-brand-3 font-semibold">Solicítalo aquí</Link>
                            </p>
                        </form>
                    </div>
                </div>
            </section>
        </Layout>
    )
}
