import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Layout from "@/components/layout/Layout"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.logify.cl"

function slugify(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 63)
}

const INITIAL_FORM = {
    companyName: "", slug: "", contactEmail: "",
    ownerName: "", ownerUsername: "", ownerPassword: "", couponCode: "",
}

export default function Registro() {
    const [form, setForm] = useState(INITIAL_FORM)
    const [slugTouched, setSlugTouched] = useState(false)
    const [slugStatus, setSlugStatus] = useState(null) // null | "checking" | { available, reason }
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const debounceRef = useRef(null)

    const derivedSlug = useMemo(() => slugTouched ? form.slug : slugify(form.companyName), [slugTouched, form.slug, form.companyName])

    useEffect(() => {
        if (!derivedSlug || derivedSlug.length < 3) { setSlugStatus(null); return }
        setSlugStatus("checking")
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/signup/check-slug?slug=${encodeURIComponent(derivedSlug)}`)
                const data = await res.json()
                setSlugStatus(data)
            } catch {
                setSlugStatus(null)
            }
        }, 500)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [derivedSlug])

    const handleChange = (e) => {
        const { name, value } = e.target
        if (name === "slug") setSlugTouched(true)
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        try {
            const res = await fetch(`${API_BASE}/api/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, slug: derivedSlug }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "No se pudo crear tu cuenta")
            setSuccess(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Layout headTitle="Crea tu cuenta gratis">
            <section className="py-24 bg-gradient-to-br from-brand-2 to-brand-5 relative overflow-hidden min-h-screen">
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-1/8 blur-3xl pointer-events-none"/>
                <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 bg-brand-1/15 border border-brand-1/30 px-4 py-2 rounded-full mb-5 text-brand-1 text-sm font-semibold">
                            90 días gratis, sin tarjeta de crédito
                        </div>
                        <h1 className="text-white font-extrabold leading-tight mb-4" style={{fontSize: 'clamp(2rem, 4vw, 2.75rem)'}}>
                            Crea tu cuenta de <span className="text-brand-1">Logify</span>
                        </h1>
                        <p className="text-white/80">Tu panel queda listo al instante en tu propio subdominio.</p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/30">
                        {success ? (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-5">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16BA8F" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                                <h2 className="text-brand-2 font-extrabold text-2xl mb-3">Tu cuenta está lista</h2>
                                <p className="text-grey-500 mb-6">
                                    Ingresa con el usuario <strong className="text-brand-2">{success.ownerUsername}</strong> en tu panel:
                                </p>
                                <p className="mb-8">
                                    <a href={`${success.appUrl}/login`} className="font-bold text-brand-4 break-all">{success.appUrl}/login</a>
                                </p>
                                <a href={`${success.appUrl}/login`}
                                    className="inline-flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-3.5 px-8 rounded-xl hover:bg-yellow-400 hover:-translate-y-0.5 transition-all shadow-lg shadow-brand-1/30"
                                >
                                    Ir a mi panel
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                </a>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-brand-2 font-semibold text-sm mb-1.5">Nombre de tu empresa *</label>
                                        <input name="companyName" type="text" placeholder="Distribuidora Acme" required value={form.companyName} onChange={handleChange}
                                            className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                    </div>
                                    <div>
                                        <label className="block text-brand-2 font-semibold text-sm mb-1.5">Subdominio *</label>
                                        <div className="flex items-stretch">
                                            <input name="slug" type="text" placeholder="acme" required value={derivedSlug} onChange={handleChange}
                                                className="w-full px-4 py-3 border-2 border-r-0 border-grey-300 rounded-l-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white outline-none transition-all"/>
                                            <span className="inline-flex items-center px-3 border-2 border-grey-300 rounded-r-xl bg-grey-200 text-grey-500 text-sm whitespace-nowrap">.logify.cl</span>
                                        </div>
                                        {slugStatus === "checking" && <p className="text-xs text-grey-500 mt-1.5">Verificando disponibilidad…</p>}
                                        {slugStatus && slugStatus !== "checking" && (
                                            <p className={`text-xs mt-1.5 ${slugStatus.available ? "text-success" : "text-danger"}`}>
                                                {slugStatus.available ? "Disponible" : slugStatus.reason}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-brand-2 font-semibold text-sm mb-1.5">Email de contacto *</label>
                                        <input name="contactEmail" type="email" placeholder="contacto@acme.cl" required value={form.contactEmail} onChange={handleChange}
                                            className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-brand-2 font-semibold text-sm mb-1.5">Tu nombre *</label>
                                            <input name="ownerName" type="text" placeholder="Ana Contreras" required value={form.ownerName} onChange={handleChange}
                                                className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                        </div>
                                        <div>
                                            <label className="block text-brand-2 font-semibold text-sm mb-1.5">Usuario *</label>
                                            <input name="ownerUsername" type="text" placeholder="ana.contreras" required value={form.ownerUsername} onChange={handleChange}
                                                className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-brand-2 font-semibold text-sm mb-1.5">Contraseña *</label>
                                        <input name="ownerPassword" type="password" placeholder="Mínimo 10 caracteres, mayúscula, número y símbolo" required value={form.ownerPassword} onChange={handleChange}
                                            className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                    </div>
                                    <div>
                                        <label className="block text-brand-2 font-semibold text-sm mb-1.5">Código de cupón (opcional)</label>
                                        <input name="couponCode" type="text" placeholder="Ej: BIENVENIDA90" value={form.couponCode} onChange={handleChange}
                                            className="w-full px-4 py-3 border-2 border-grey-300 rounded-xl text-sm bg-grey-100 focus:border-brand-1 focus:bg-white focus:ring-4 focus:ring-brand-1/10 outline-none transition-all"/>
                                    </div>
                                </div>

                                {error && (
                                    <p className="mt-4 text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-4 py-3">{error}</p>
                                )}

                                <button type="submit" disabled={submitting}
                                    className="w-full mt-6 flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-4 rounded-xl hover:bg-yellow-400 hover:-translate-y-0.5 transition-all shadow-lg shadow-brand-1/30 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
                                    aria-label="Crear mi cuenta gratis en Logify">
                                    {submitting ? "Creando tu cuenta…" : "Crear mi cuenta gratis"}
                                </button>
                                <p className="text-center text-xs text-grey-500 mt-4">
                                    ¿Prefieres hablar con nosotros primero? <Link href="/#demo" className="text-brand-4 font-semibold">Solicita una demo</Link>
                                </p>
                            </form>
                        )}
                    </div>
                </div>
            </section>
        </Layout>
    )
}
