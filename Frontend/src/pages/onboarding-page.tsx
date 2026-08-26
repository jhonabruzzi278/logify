import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, PackageCheck, Rocket, Store } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { Logo } from "@/components/common/logo";
import { PageLoader } from "@/components/common/page-loader";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { completeOnboarding, getOnboarding } from "@/lib/onboarding-service";
import { cn } from "@/lib/utils";

const INDUSTRIES = ["Almacén", "Minimarket", "Botillería", "Verdulería", "Distribuidora", "Ferretería", "Otro"];
const GOALS = [
  { id: "ventas", label: "Ordenar ventas y caja" },
  { id: "inventario", label: "Controlar inventario" },
  { id: "pedidos", label: "Centralizar pedidos" },
  { id: "despachos", label: "Coordinar despachos" },
  { id: "reportes", label: "Medir el negocio" },
];

export function OnboardingPage() {
  useDocumentMeta({ title: "Configura tu negocio", description: "Completa la configuración inicial de Logify.", canonicalPath: "/onboarding" });
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", contactEmail: "", businessCountry: "Chile", businessIndustry: "",
    businessPhone: "", usedPosBefore: null as boolean | null, goals: [] as string[],
  });

  useEffect(() => {
    if (session?.role !== "owner") { setLoading(false); return; }
    let cancelled = false;
    void getOnboarding()
      .then((data) => {
        if (cancelled) return;
        setCompleted(data.completed);
        setForm({
          name: data.name ?? "", contactEmail: data.contactEmail ?? "",
          businessCountry: data.businessCountry ?? "Chile", businessIndustry: data.businessIndustry ?? "",
          businessPhone: data.businessPhone ?? "", usedPosBefore: data.usedPosBefore,
          goals: data.goals ?? [],
        });
      })
      .catch(() => { if (!cancelled) setError("No pudimos cargar la configuración. Intenta nuevamente."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.role]);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(form.name.trim() && form.businessIndustry);
    if (step === 1) return form.usedPosBefore !== null && form.goals.length > 0;
    return true;
  }, [form, step]);

  if (loading) return <PageLoader />;
  if (session?.role !== "owner" || completed) return <Navigate to="/dashboard" replace />;

  function toggleGoal(goal: string) {
    setForm((current) => ({
      ...current,
      goals: current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal],
    }));
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await completeOnboarding({ ...form, usedPosBefore: Boolean(form.usedPosBefore) });
      navigate("/dashboard", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#F8FAFC] lg:grid-cols-[0.72fr_1.28fr]">
      <aside className="relative hidden overflow-hidden bg-[#172554] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#8B5CF6]/30 blur-3xl" aria-hidden="true" />
        <Logo variant="light" />
        <div className="relative max-w-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#93C5FD]">Activación inicial</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">Deja tu operación lista para empezar.</h1>
          <p className="mt-4 text-sm leading-6 text-[#CBD5E1]">Tres pasos breves. Podrás ajustar estos datos más adelante desde Configuración.</p>
          <ol className="mt-10 space-y-5">
            {["Tu negocio", "Tu operación", "Todo listo"].map((label, index) => (
              <li key={label} className="flex items-center gap-4">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-colors", index <= step ? "border-[#60A5FA] bg-[#2563EB] text-white" : "border-white/20 text-white/45")}>{index < step ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className={cn("text-sm font-medium", index <= step ? "text-white" : "text-white/45")}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-[#94A3B8]">Logify · Configuración segura de empresa</p>
      </aside>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10">
        <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-[#DBEAFE] blur-3xl" aria-hidden="true" />
        <div className="relative w-full max-w-2xl">
          <div className="mb-8 flex items-center justify-between">
            <div className="lg:hidden"><Logo variant="brand" /></div>
            <p className="ml-auto text-xs font-semibold text-[#64748B]">Paso {step + 1} de 3</p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#E2E8F0]" aria-hidden="true">
            <div className="h-full bg-[#2563EB] transition-all duration-300" style={{ width: `${((step + 1) / 3) * 100}%` }} />
          </div>

          <div key={step} className="mt-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {step === 0 ? (
              <div>
                <Store className="h-7 w-7 text-[#2563EB]" />
                <h2 className="mt-5 text-3xl font-bold text-[#172554]">Cuéntanos sobre tu negocio</h2>
                <p className="mt-2 text-sm text-[#64748B]">Usaremos estos datos en tu operación y documentos.</p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2 text-sm font-semibold text-[#172554]">Nombre del negocio
                    <Input className="mt-2 h-11 bg-white" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
                  </label>
                  <label className="text-sm font-semibold text-[#172554]">Rubro
                    <select className="mt-2 h-11 w-full rounded-md border border-input bg-white px-3 text-sm" value={form.businessIndustry} onChange={(event) => setForm({ ...form, businessIndustry: event.target.value })}>
                      <option value="">Selecciona un rubro</option>{INDUSTRIES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-[#172554]">País
                    <Input className="mt-2 h-11 bg-white" value={form.businessCountry} onChange={(event) => setForm({ ...form, businessCountry: event.target.value })} />
                  </label>
                  <label className="text-sm font-semibold text-[#172554]">Correo de contacto
                    <Input type="email" className="mt-2 h-11 bg-white" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} />
                  </label>
                  <label className="text-sm font-semibold text-[#172554]">Teléfono
                    <Input className="mt-2 h-11 bg-white" value={form.businessPhone} onChange={(event) => setForm({ ...form, businessPhone: event.target.value })} placeholder="+56 9..." />
                  </label>
                </div>
              </div>
            ) : step === 1 ? (
              <div>
                <PackageCheck className="h-7 w-7 text-[#2563EB]" />
                <h2 className="mt-5 text-3xl font-bold text-[#172554]">Ajustemos el punto de partida</h2>
                <p className="mt-2 text-sm text-[#64748B]">Esto nos ayuda a priorizar tu primera experiencia.</p>
                <fieldset className="mt-8">
                  <legend className="text-sm font-bold text-[#172554]">¿Ya utilizabas un sistema de ventas?</legend>
                  <div className="mt-3 flex gap-3">
                    {[{ value: true, label: "Sí" }, { value: false, label: "No, es el primero" }].map((option) => (
                      <button key={option.label} type="button" onClick={() => setForm({ ...form, usedPosBefore: option.value })} className={cn("rounded-full border px-5 py-2.5 text-sm font-semibold transition-all", form.usedPosBefore === option.value ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#CBD5E1] bg-white text-[#475569] hover:border-[#94A3B8]")}>{option.label}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-8">
                  <legend className="text-sm font-bold text-[#172554]">¿Qué quieres resolver primero?</legend>
                  <p className="mt-1 text-xs text-[#64748B]">Puedes elegir más de una opción.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {GOALS.map((goal) => {
                      const selected = form.goals.includes(goal.id);
                      return <button key={goal.id} type="button" aria-pressed={selected} onClick={() => toggleGoal(goal.id)} className={cn("flex items-center justify-between border-b px-1 py-3 text-left text-sm font-medium transition-colors", selected ? "border-[#2563EB] text-[#1D4ED8]" : "border-[#E2E8F0] text-[#475569] hover:text-[#172554]")}><span>{goal.label}</span>{selected ? <Check className="h-4 w-4" /> : null}</button>;
                    })}
                  </div>
                </fieldset>
              </div>
            ) : (
              <div>
                <Rocket className="h-7 w-7 text-[#2563EB]" />
                <h2 className="mt-5 text-3xl font-bold text-[#172554]">Tu espacio está listo</h2>
                <p className="mt-2 text-sm text-[#64748B]">Guardaremos la configuración y te llevaremos al panel principal.</p>
                <dl className="mt-8 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
                  <div className="flex justify-between gap-6 py-4"><dt className="text-sm text-[#64748B]">Negocio</dt><dd className="text-right text-sm font-semibold text-[#172554]">{form.name}</dd></div>
                  <div className="flex justify-between gap-6 py-4"><dt className="text-sm text-[#64748B]">Rubro</dt><dd className="text-right text-sm font-semibold text-[#172554]">{form.businessIndustry}</dd></div>
                  <div className="flex justify-between gap-6 py-4"><dt className="text-sm text-[#64748B]">Prioridades</dt><dd className="text-right text-sm font-semibold text-[#172554]">{form.goals.length} seleccionadas</dd></div>
                </dl>
              </div>
            )}
          </div>

          {error ? <p role="alert" className="mt-6 text-sm font-medium text-red-600">{error}</p> : null}
          <div className="mt-10 flex items-center justify-between border-t border-[#E2E8F0] pt-6">
            <Button type="button" variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving}><ArrowLeft className="mr-2 h-4 w-4" />Atrás</Button>
            {step < 2 ? <Button type="button" onClick={() => setStep((value) => value + 1)} disabled={!canContinue}>Continuar<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" onClick={() => void finish()} disabled={saving}>{saving ? "Guardando..." : "Entrar a Logify"}<ArrowRight className="ml-2 h-4 w-4" /></Button>}
          </div>
        </div>
        <SupportWhatsappButton variant="mono" />
      </section>
    </main>
  );
}
