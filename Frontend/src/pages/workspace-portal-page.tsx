import { useState } from "react";
import { ArrowRight, Building2, KeyRound, LifeBuoy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildTenantUrl, normalizeTenantSlug } from "@/lib/tenant-navigation";

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
    <main className="min-h-screen bg-[#F4F8FB] px-4 py-10 sm:py-16">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[#DCE0E2] bg-white shadow-xl shadow-[#112B4A]/5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-[#10243B] p-8 text-white sm:p-10 lg:p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4B98CF] text-xl font-bold">L</div>
            <div>
              <p className="text-lg font-bold">Logify</p>
              <p className="text-xs text-[#A9C1D9]">Portal central de acceso</p>
            </div>
          </div>
          <h1 className="mt-12 text-3xl font-bold leading-tight">Tu empresa tiene un espacio privado.</h1>
          <p className="mt-4 text-sm leading-6 text-[#C9D8E6]">
            Antes de iniciar sesión identificamos tu empresa para mantener usuarios, permisos y datos en el tenant correcto.
          </p>
          <div className="mt-8 space-y-4 text-sm text-[#DCE8F2]">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-[#6BB3E8]" /><span>El portal no abre datos ni sesiones de ninguna empresa.</span></div>
            <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-[#6BB3E8]" /><span>Login y recuperación continúan dentro de tu subdominio.</span></div>
          </div>
        </section>

        <section className="flex flex-col justify-center p-8 sm:p-10 lg:p-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4B98CF]/10 text-[#4B98CF]">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[1.2px] text-[#6B7280]">Encontrar mi empresa</p>
          <h2 className="mt-1 text-2xl font-bold text-[#112B4A]">{isRecovery ? "Recuperar acceso" : "Ir a mi espacio de trabajo"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B7280]">
            Escribe solo el nombre que aparece antes de <strong>.logify.cl</strong>. También puedes pegar la dirección completa.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="workspace" className="mb-1.5 block text-xs font-bold text-[#112B4A]">Espacio de trabajo</label>
              <div className="flex items-center rounded-lg border border-[#DCE0E2] bg-[#F8FBFD] focus-within:border-[#4B98CF] focus-within:ring-2 focus-within:ring-[#4B98CF]/15">
                <Input
                  id="workspace"
                  value={workspace}
                  onChange={(event) => { setWorkspace(event.target.value); setError(""); }}
                  placeholder="lapercha"
                  autoComplete="organization"
                  autoFocus
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <span className="pr-3 text-sm text-[#6B7280]">.logify.cl</span>
              </div>
              {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
            </div>
            <Button type="submit" className="h-11 w-full bg-[#4B98CF] font-bold hover:bg-[#346384]">
              {isRecovery ? "Continuar recuperación" : "Continuar al login"}<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-[#DCE0E2] bg-[#F8FBFD] p-4">
            <div className="flex items-start gap-3">
              <LifeBuoy className="mt-0.5 h-4 w-4 text-[#4B98CF]" />
              <p className="text-xs leading-5 text-[#6B7280]">
                ¿No recuerdas el nombre? Revisa el correo de bienvenida o solicita ayuda en <a href="mailto:soporte@logify.cl" className="font-bold text-[#4B98CF] hover:underline">soporte@logify.cl</a>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
