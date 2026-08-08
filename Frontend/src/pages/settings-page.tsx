import { useEffect, useState } from "react";
import { Building2, Save, SlidersHorizontal } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ApiBusinessSettings, ApiSystemSettings } from "@/types/api";

interface SystemToggle {
  key: string;
  label: string;
  description: string;
}

const SYSTEM_TOGGLES: SystemToggle[] = [
  { key: "cashRegisterEnabled", label: "Activar sistema de caja", description: "Activa el control de sesiones de caja y registro de transacciones en efectivo." },
  { key: "requireDeleteReason", label: "Guardar motivo al eliminar productos", description: "Pide un motivo cada vez que se elimina un producto del carrito del POS." },
  { key: "productImagesEnabled", label: "Productos con imágenes", description: "Habilita el campo para subir o buscar imágenes en cada producto." },
  { key: "priceFromCostEnabled", label: "Calcular precio por costo", description: "Muestra el cálculo de precio final según costo y margen." },
  { key: "weightRoundingEnabled", label: "Redondeo automático para productos por peso", description: "Redondea el subtotal de productos vendidos por peso/volumen al múltiplo de $50 más cercano." },
];

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border-2 border-transparent shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B98CF] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60",
        checked ? "bg-[#4B98CF]" : "bg-[#DCE0E2]"
      )}
    >
      <span className={cn(
        "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform",
        checked ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

export function SettingsPage() {
  const { data: business, loading: businessLoading, refresh: refreshBusiness } = useApiQuery<ApiBusinessSettings, ApiBusinessSettings>({
    path: "/api/settings/business", transform: (r) => r
  });
  const { data: system, refresh: refreshSystem } = useApiQuery<ApiSystemSettings, ApiSystemSettings>({
    path: "/api/settings/system", transform: (r) => r
  });

  const [businessForm, setBusinessForm] = useState({ name: "", contactEmail: "", businessRut: "", businessCountry: "", businessIndustry: "", businessPhone: "" });
  const [businessError, setBusinessError] = useState("");
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [toggleSaving, setToggleSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;
    setBusinessForm({
      name: business.name ?? "",
      contactEmail: business.contactEmail ?? "",
      businessRut: business.businessRut ?? "",
      businessCountry: business.businessCountry ?? "",
      businessIndustry: business.businessIndustry ?? "",
      businessPhone: business.businessPhone ?? "",
    });
  }, [business]);

  useEffect(() => {
    if (!system) return;
    setToggles(Object.fromEntries(SYSTEM_TOGGLES.map((t) => [t.key, Boolean(system[t.key])])));
  }, [system]);

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusinessError("");
    setBusinessSaved(false);
    if (!businessForm.name.trim()) { setBusinessError("El nombre del negocio es obligatorio"); return; }
    setBusinessSaving(true);
    try {
      await apiFetch("/api/settings/business", { method: "PUT", body: JSON.stringify(businessForm) });
      setBusinessSaved(true);
      refreshBusiness();
      setTimeout(() => setBusinessSaved(false), 3000);
    } catch (err) {
      setBusinessError(err instanceof ApiRequestError ? err.message : "Error al guardar");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function handleToggle(key: string, value: boolean) {
    setToggles((prev) => ({ ...prev, [key]: value }));
    setToggleSaving(key);
    try {
      await apiFetch("/api/settings/system", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      refreshSystem();
    } catch {
      setToggles((prev) => ({ ...prev, [key]: !value }));
    } finally {
      setToggleSaving(null);
    }
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Sistema</p>
        <h1 className="text-xl font-bold text-[#112b4a]">Configuración</h1>
      </div>

      <div className="rounded border border-[#DCE0E2] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#4B98CF]" />
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Datos del negocio</p>
        </div>
        {businessLoading && !business ? (
          <p className="text-sm text-[#6B7280]">Cargando...</p>
        ) : (
          <form onSubmit={handleSaveBusiness} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="settings-page-f125" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nombre del negocio *</label>
                <Input id="settings-page-f125" value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="settings-page-f129" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Email de contacto</label>
                <Input id="settings-page-f129" type="email" value={businessForm.contactEmail} onChange={(e) => setBusinessForm({ ...businessForm, contactEmail: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="settings-page-f133" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">RUT / CUIT</label>
                <Input id="settings-page-f133" value={businessForm.businessRut} onChange={(e) => setBusinessForm({ ...businessForm, businessRut: e.target.value })} placeholder="76.123.456-7" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="settings-page-f137" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Teléfono</label>
                <Input id="settings-page-f137" value={businessForm.businessPhone} onChange={(e) => setBusinessForm({ ...businessForm, businessPhone: e.target.value })} placeholder="+56912345678" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="settings-page-f141" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">País</label>
                <Input id="settings-page-f141" value={businessForm.businessCountry} onChange={(e) => setBusinessForm({ ...businessForm, businessCountry: e.target.value })} placeholder="Chile" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="settings-page-f145" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Rubro</label>
                <Input id="settings-page-f145" value={businessForm.businessIndustry} onChange={(e) => setBusinessForm({ ...businessForm, businessIndustry: e.target.value })} placeholder="Kiosco, retail, distribución..." className="h-9 text-sm" />
              </div>
            </div>
            {businessError && <p className="text-xs text-red-500">{businessError}</p>}
            {businessSaved && <p className="text-xs font-semibold text-[#4EB4A5]">Datos guardados correctamente</p>}
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" className="flex items-center gap-1.5 bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={businessSaving}>
                <Save className="h-3.5 w-3.5" /> {businessSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="rounded border border-[#DCE0E2] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#4B98CF]" />
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Opciones del sistema</p>
        </div>
        <div className="divide-y divide-[#F5F7F9]">
          {SYSTEM_TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#112b4a]">{toggle.label}</p>
                <p className="mt-0.5 text-xs text-[#6B7280]">{toggle.description}</p>
              </div>
              <Toggle
                checked={Boolean(toggles[toggle.key])}
                disabled={toggleSaving === toggle.key}
                label={toggle.label}
                onChange={(v) => handleToggle(toggle.key, v)}
              />
            </div>
          ))}
        </div>
        {toggleSaving && <p className="mt-2 text-[10px] text-[#6B7280]">Guardando...</p>}
      </div>
    </div>
  );
}
