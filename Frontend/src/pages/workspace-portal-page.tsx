import { useState } from "react";
import { ArrowRight, Building2, KeyRound, LifeBuoy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildTenantUrl, normalizeTenantSlug } from "@/lib/tenant-navigation";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { Logo } from "@/components/common/logo";

interface WorkspacePortalPageProps {
  destination?: "/login" | "/forgot-password";
}

export function WorkspacePortalPage({ destination = "/login" }: WorkspacePortalPageProps) {
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");
  const isRecovery = destination === "/forgot-password";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = normalizeTenantSlug(workspace);
    if (!slug) {
      setError("Ingresa el subdominio de tu empresa, por ejemplo: lapercha");
      return;
    }
    window.location.assign(buildTenantUrl(slug, destination));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10 sm:py-16">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl shadow-[#172554]/5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#172554] p-8 text-white sm:p-10 lg:p-12">
          <div
            className="pointer-events-none absolute -right-28 -top-28 h-[320px] w-[320px] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, #8B5CF6 0%, transparent 70%)" }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 -left-20 h-[300px] w-[300px] rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)" }}
            aria-hidden="true"
          />

          <div className="relative z-10">
            <Logo variant="light" />
            <p className="mt-1.5 text-xs text-[#94A3B8]">Portal central de acceso</p>

            <span className="mt-8 inline-flex items-center rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#C4B5FD]">
              Identificación de empresa
            </span>

            <h1 className="mt-4 text-3xl font-bold leading-tight">Tu empresa tiene un espacio privado.</h1>
            <p className="mt-4 text-sm leading-6 text-[#CBD5E1]">
              Antes de iniciar sesión identificamos tu empresa para mantener usuarios, permisos y datos en el tenant correcto.
            </p>

            <div className="mt-8 space-y-3 text-sm text-[#CBD5E1]">
              <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#60A5FA]" />
                <span>El portal no abre datos ni sesiones de ninguna empresa.</span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#60A5FA]" />
                <span>Login y recuperación continúan dentro de tu subdominio.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex flex-col justify-center overflow-hidden p-8 sm:p-10 lg:p-12">
          <div
            className="pointer-events-none absolute -right-28 -top-28 h-[280px] w-[280px] rounded-full opacity-50 blur-3xl"
            style={{ background: "hsl(var(--accent))" }}
            aria-hidden="true"
          />

          <div className="relative z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">Encontrar mi empresa</p>
            <h2 className="mt-1 text-2xl font-bold text-[#172554]">{isRecovery ? "Recuperar acceso" : "Ir a mi espacio de trabajo"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              Escribe solo el nombre que aparece antes de <strong>.logify.cl</strong>. También puedes pegar la dirección completa.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="workspace" className="mb-1.5 block text-xs font-bold text-[#172554]">Espacio de trabajo</label>
                <div className="flex items-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/15">
                  <Input
                    id="workspace"
                    value={workspace}
                    onChange={(event) => { setWorkspace(event.target.value); setError(""); }}
                    placeholder="lapercha"
                    autoComplete="organization"
                    autoFocus
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <span className="pr-3 text-sm text-[#64748B]">.logify.cl</span>
                </div>
                {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
              </div>
              <Button type="submit" className="h-11 w-full bg-[#2563EB] font-bold hover:bg-[#1D4ED8]">
                {isRecovery ? "Continuar recuperación" : "Continuar al login"}<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-start gap-3">
                <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
                <p className="text-xs leading-5 text-[#64748B]">
                  ¿No recuerdas el nombre? Revisa el correo de bienvenida o solicita ayuda en <a href="mailto:soporte@logify.cl" className="font-bold text-[#2563EB] hover:underline">soporte@logify.cl</a>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <SupportWhatsappButton variant="mono" />
    </main>
  );
}
