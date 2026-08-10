import { useState } from "react"
import Link from "next/link"
import { slugify } from "@/util/tenant"
import QuestionShell from "./QuestionShell"
import { TextField, PhoneField, PasswordField, ChoiceGrid, MultiChoiceGrid, BooleanChoice, validatePassword } from "./fields"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.logify.cl"

const BUSINESS_TYPES = [
    "Almacén", "Gastronomía", "Kiosco", "Indumentaria", "Servicios", "Farmacia",
    "Electrónica", "Petshop", "Ferretería", "Artículos de belleza", "Accesorios", "Otro",
]

const GOALS = [
    "Organizar mis ventas",
    "Controlar mi stock",
    "Controlar lo que me deben",
    "Delegar tareas a mis empleados",
    "Saber mis ingresos",
    "Ver estadísticas avanzadas",
    "Facturar automáticamente",
]

const STEPS = ["phone", "email", "ownerName", "companyName", "businessIndustry", "usedPosBefore", "goals", "transition", "password"]

const INITIAL_ANSWERS = {
    countryCode: "+56",
    phoneNumber: "",
    contactEmail: "",
    ownerName: "",
    companyName: "",
    businessIndustry: "",
    usedPosBefore: null,
    goals: [],
    ownerPassword: "",
}

function usernameFromName(name) {
    const base = slugify(name).replace(/-+/g, ".")
    return base || "usuario"
}

function isValidEmail(value) {
    const v = value.trim()
    if (v.includes(" ") || v.length < 5) return false
    const at = v.indexOf("@")
    if (at <= 0 || at !== v.lastIndexOf("@")) return false
    const dot = v.indexOf(".", at)
    return dot > at + 1 && dot < v.length - 1
}

function isStepValid(kind, answers) {
    switch (kind) {
        case "phone": return answers.phoneNumber.trim().length >= 6
        case "email": return isValidEmail(answers.contactEmail)
        case "ownerName": return answers.ownerName.trim().length >= 2
        case "companyName": return answers.companyName.trim().length >= 2
        case "businessIndustry": return Boolean(answers.businessIndustry)
        case "usedPosBefore": return answers.usedPosBefore !== null
        case "goals": return answers.goals.length > 0
        case "transition": return true
        case "password": return validatePassword(answers.ownerPassword)
        default: return true
    }
}

export default function OnboardingWizard() {
    const [stepIndex, setStepIndex] = useState(0)
    const [answers, setAnswers] = useState(INITIAL_ANSWERS)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const kind = STEPS[stepIndex]
    const total = STEPS.length
    const valid = isStepValid(kind, answers)

    function update(patch) {
        setAnswers((prev) => ({ ...prev, ...patch }))
    }

    function goNext() {
        setError(null)
        setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }

    function goBack() {
        setError(null)
        setStepIndex((i) => Math.max(i - 1, 0))
    }

    function selectAndAdvance(patch) {
        setAnswers((prev) => ({ ...prev, ...patch }))
        setError(null)
        setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }

    async function submitSignup() {
        setSubmitting(true)
        setError(null)
        const baseSlug = slugify(answers.companyName) || "negocio"
        const ownerUsername = usernameFromName(answers.ownerName)
        const body = {
            companyName: answers.companyName.trim(),
            contactEmail: answers.contactEmail.trim(),
            ownerName: answers.ownerName.trim(),
            ownerUsername,
            ownerPassword: answers.ownerPassword,
            phone: `${answers.countryCode} ${answers.phoneNumber}`.trim(),
            businessIndustry: answers.businessIndustry,
            usedPosBefore: answers.usedPosBefore,
            goals: answers.goals,
        }

        try {
            let attempt = 0
            let lastError = null
            while (attempt < 5) {
                const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
                const res = await fetch(`${API_BASE}/api/signup`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...body, slug }),
                })
                const data = await res.json()
                if (res.ok) {
                    setSuccess(data)
                    return
                }
                lastError = data.error || "No se pudo crear tu cuenta"
                const isSlugTaken = res.status === 409 || /subdominio ya esta en uso/i.test(lastError)
                if (!isSlugTaken) break
                attempt += 1
            }
            setError(lastError || "No se pudo crear tu cuenta")
        } catch {
            setError("No se pudo conectar con Logify. Intenta de nuevo.")
        } finally {
            setSubmitting(false)
        }
    }

    function handleSubmit(e) {
        e.preventDefault()
        if (!valid || submitting) return
        if (kind === "password") {
            submitSignup()
            return
        }
        goNext()
    }

    if (success) {
        return (
            <div className="w-full max-w-lg mx-auto text-center animate-fade-in-up">
                <div className="w-20 h-20 rounded-full bg-brand-3/10 flex items-center justify-center mx-auto mb-5">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-3)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h2 className="text-white font-extrabold text-2xl mb-3">Tu cuenta está lista</h2>
                <p className="text-white/80 mb-4">
                    Ingresa con el usuario <strong className="text-brand-1">{success.ownerUsername}</strong> en tu panel:
                </p>
                <div className="bg-white/10 border-2 border-brand-1/30 rounded-xl px-5 py-4 mb-6 text-left">
                    <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">El nombre de tu negocio en Logify es</p>
                    <p className="text-brand-1 font-extrabold text-xl mb-2 break-all">{success.tenantSlug}</p>
                    <p className="text-xs text-white/70 leading-relaxed">
                        Guarda este dato: es lo que usas para volver a entrar a tu panel.
                        Si alguna vez lo olvidas, entra a <Link href="/acceso" className="text-brand-1 font-semibold">logify.cl/acceso</Link> y te llevamos directo.
                    </p>
                </div>
                <a href={`${success.appUrl}/login`}
                    className="inline-flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-3.5 px-8 rounded-xl hover:brightness-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-brand-1/30"
                >
                    Ir a mi panel
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </a>
            </div>
        )
    }

    const enterHint = <p className="text-white/50 text-xs mt-3">Presiona Enter ↵ para continuar</p>

    let continueLabel = "Continuar"
    if (submitting) continueLabel = "Creando tu cuenta…"
    else if (kind === "password") continueLabel = "Crear mi cuenta gratis"

    const continueButton = (
        <button type="submit" disabled={!valid || submitting}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-brand-1 text-brand-2 font-bold py-3.5 rounded-xl hover:brightness-90 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
            {continueLabel}
        </button>
    )

    return (
        <>
            {kind === "phone" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack={false} title="¿A qué número te contactamos?" hint="Lo usamos para coordinar activación y soporte." onSubmit={handleSubmit} footer={<>{continueButton}{enterHint}</>}>
                    <PhoneField countryCode={answers.countryCode} phoneNumber={answers.phoneNumber} onCountryChange={(v) => update({ countryCode: v })} onNumberChange={(v) => update({ phoneNumber: v })} autoFocus />
                </QuestionShell>
            )}

            {kind === "email" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Cuál es tu email?" hint="Te enviamos confirmación y novedades de activación." onSubmit={handleSubmit} footer={<>{continueButton}{enterHint}</>}>
                    <TextField type="email" value={answers.contactEmail} onChange={(v) => update({ contactEmail: v })} placeholder="tu@email.com" autoFocus />
                </QuestionShell>
            )}

            {kind === "ownerName" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Cómo es tu nombre?" hint="Para saber cómo dirigirnos a vos." onSubmit={handleSubmit} footer={<>{continueButton}{enterHint}</>}>
                    <TextField value={answers.ownerName} onChange={(v) => update({ ownerName: v })} placeholder="Tu nombre" autoFocus />
                </QuestionShell>
            )}

            {kind === "companyName" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Cómo se llama tu negocio?" hint="Aparece en reportes y tickets." onSubmit={handleSubmit} footer={<>{continueButton}{enterHint}</>}>
                    <TextField value={answers.companyName} onChange={(v) => update({ companyName: v })} placeholder="Ej: Kiosco Centro" autoFocus />
                </QuestionShell>
            )}

            {kind === "businessIndustry" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Qué tipo de negocio es?" hint="Esto nos ayuda a configurar funciones específicas." onSubmit={handleSubmit} footer={null}>
                    <ChoiceGrid options={BUSINESS_TYPES} value={answers.businessIndustry} onSelect={(v) => selectAndAdvance({ businessIndustry: v })} />
                </QuestionShell>
            )}

            {kind === "usedPosBefore" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Usaste alguna vez un sistema POS en tu negocio?" hint="Para saber si necesitas ayuda extra." onSubmit={handleSubmit} footer={null}>
                    <BooleanChoice value={answers.usedPosBefore} onSelect={(v) => selectAndAdvance({ usedPosBefore: v })} />
                </QuestionShell>
            )}

            {kind === "goals" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¿Cuál es tu objetivo con Logify?" hint="Selecciona todas las que apliquen." onSubmit={handleSubmit} footer={continueButton}>
                    <MultiChoiceGrid options={GOALS} values={answers.goals} onToggle={(opt) => update({
                        goals: answers.goals.includes(opt) ? answers.goals.filter((g) => g !== opt) : [...answers.goals, opt]
                    })} />
                </QuestionShell>
            )}

            {kind === "transition" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="¡Todo listo!" hint="Vamos a crear tu cuenta y activar tu prueba gratis de 30 días para que empieces a usar Logify ahora mismo." onSubmit={handleSubmit} footer={continueButton}>
                    <div />
                </QuestionShell>
            )}

            {kind === "password" && (
                <QuestionShell step={stepIndex + 1} total={total} showBack onBack={goBack} title="Crea tu contraseña" hint="Para proteger tu cuenta, define una contraseña personal antes de continuar." onSubmit={handleSubmit} footer={<>{error && <p className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3">{error}</p>}{continueButton}</>}>
                    <PasswordField value={answers.ownerPassword} onChange={(v) => update({ ownerPassword: v })} autoFocus />
                </QuestionShell>
            )}
        </>
    )
}
