import { useState, type FormEvent } from "react";
import { SignIn, SignUp, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { Building2 } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { readApiConfig } from "@/lib/api-config";
import { useDocumentMeta } from "@/hooks/use-document-meta";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
}

export function CreateOrganizationPage() {
  useDocumentMeta({ title: "Crear organización" });
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const clerk = useClerk();
  const [authMode, setAuthMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("No pudimos validar tu sesión. Vuelve a iniciar sesión.");
      const response = await fetch(`${readApiConfig().baseUrl}/api/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyName: companyName.trim(), slug: slug.trim(), businessIndustry: industry.trim() || null, phone: phone.trim() || null }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; organizationId?: string };
      if (!response.ok || !body.organizationId) throw new Error(body.error || "No se pudo crear la organización");
      await clerk.user?.reload();
      await clerk.setActive({ organization: body.organizationId });
      window.location.assign("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la organización");
      setSaving(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="min-h-dvh bg-[#F8FAFC] px-4 py-10">
      <main className="mx-auto w-full max-w-lg">
        <div className="mb-7 flex justify-center"><Logo variant="brand" /></div>
        {!isSignedIn ? (
          <div className="space-y-5">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#172554]">Crea tu organización</h1>
              <p className="mt-2 text-sm text-[#64748B]">Primero crea tu identidad personal o entra con la cuenta de Logify que ya utilizas.</p>
            </div>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => setAuthMode("sign-up")} className={`rounded-lg px-4 py-2 text-sm font-bold ${authMode === "sign-up" ? "bg-[#2563EB] text-white" : "bg-white text-[#475569]"}`}>Crear cuenta</button>
              <button type="button" onClick={() => setAuthMode("sign-in")} className={`rounded-lg px-4 py-2 text-sm font-bold ${authMode === "sign-in" ? "bg-[#2563EB] text-white" : "bg-white text-[#475569]"}`}>Ya tengo cuenta</button>
            </div>
            <div className="flex justify-center overflow-hidden rounded-2xl">
              {authMode === "sign-up"
                ? <SignUp routing="hash" signInUrl="/create-organization" fallbackRedirectUrl="/create-organization" />
                : <SignIn routing="hash" signUpUrl="/create-organization" fallbackRedirectUrl="/create-organization" />}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
            <Building2 className="h-9 w-9 text-[#2563EB]" />
            <h1 className="mt-3 text-2xl font-bold text-[#172554]">Datos de tu nueva organización</h1>
            <p className="mt-1 text-sm text-[#64748B]">Tu cuenta personal conservará su contraseña y podrá pertenecer a varias organizaciones.</p>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-[#172554]">Nombre de la empresa
                <input required value={companyName} onChange={(event) => { setCompanyName(event.target.value); if (!slug) setSlug(slugify(event.target.value)); }} className="mt-1 h-11 w-full rounded-lg border border-[#CBD5E1] px-3 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-[#172554]">Identificador
                <input required minLength={3} value={slug} onChange={(event) => setSlug(slugify(event.target.value))} className="mt-1 h-11 w-full rounded-lg border border-[#CBD5E1] px-3 font-normal" />
                <span className="mt-1 block text-xs font-normal text-[#64748B]">Se usa internamente y debe ser único.</span>
              </label>
              <label className="block text-sm font-semibold text-[#172554]">Rubro
                <input value={industry} onChange={(event) => setIndustry(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#CBD5E1] px-3 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-[#172554]">Teléfono
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#CBD5E1] px-3 font-normal" />
              </label>
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="mt-6 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white disabled:opacity-60">{saving ? "Creando…" : "Crear organización"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
