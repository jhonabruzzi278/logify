import { useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { adaptSupplier } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiSupplier } from "@/types/api";
import type { Supplier } from "@/types/domain";

const emptyForm = { name: "", rut: "", phone: "", email: "", address: "" };

export function SuppliersPage() {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: suppliers, loading, refresh } = useApiQuery<ApiSupplier[], Supplier[]>({
    path: "/api/suppliers", transform: (r) => r.map(adaptSupplier)
  });

  useAutoRefresh(() => { if (!loading) refresh(); }, 15000);

  const filtered = useMemo(() => {
    if (!suppliers) return [];
    if (!query) return suppliers;
    const q = query.toLowerCase();
    return suppliers.filter((s) => `${s.name} ${s.rut ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q));
  }, [suppliers, query]);

  function openEdit(s: Supplier) {
    setEditSupplier(s);
    setForm({ name: s.name, rut: s.rut ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
    setDialogOpen(true);
  }

  function closeDialog(open: boolean) {
    setDialogOpen(open);
    if (!open) { setEditSupplier(null); setForm(emptyForm); setFormError(""); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) { setFormError("El nombre es obligatorio"); return; }

    setSaving(true);
    try {
      const body = JSON.stringify({ name: form.name, rut: form.rut || null, phone: form.phone || null, email: form.email || null, address: form.address || null });
      if (editSupplier) {
        await apiFetch(`/api/suppliers/${editSupplier.id}`, { method: "PUT", body });
      } else {
        await apiFetch("/api/suppliers", { method: "POST", body });
      }
      closeDialog(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este proveedor?")) return;
    await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Proveedores</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Gestión de proveedores</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={closeDialog}>
            <DialogTrigger render={<Button className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-[#4B98CF] hover:bg-[#346384] text-white"><Plus className="h-3.5 w-3.5" />Nuevo proveedor</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>{editSupplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="suppliers-page-f91" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nombre *</label>
                  <Input id="suppliers-page-f91" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Distribuidora Andes" className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="suppliers-page-f96" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">RUT</label>
                    <Input id="suppliers-page-f96" value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} placeholder="76.123.456-7" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="suppliers-page-f100" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Teléfono</label>
                    <Input id="suppliers-page-f100" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56912345678" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="suppliers-page-f105" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Email</label>
                  <Input id="suppliers-page-f105" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ventas@proveedor.cl" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="suppliers-page-f109" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Dirección</label>
                  <Input id="suppliers-page-f109" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ruta 5 Km 10" className="h-9 text-sm" />
                </div>
                {formError && <p className="text-xs text-red-500">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => closeDialog(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <span className="text-xs text-[#6B7280]">{filtered.length} proveedores</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, RUT o teléfono..."
          className="h-10 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((supplier) => (
          <div key={supplier.id} className="rounded border border-[#DCE0E2] bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4B98CF]/10">
                <Building2 className="h-5 w-5 text-[#4B98CF]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#112b4a]">{supplier.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#6B7280] mt-0.5">
                  {supplier.rut && <span className="font-mono font-semibold text-[#112b4a]">RUT {supplier.rut}</span>}
                  {supplier.phone && <span>{supplier.phone}</span>}
                  {supplier.email && <span>{supplier.email}</span>}
                  {supplier.address && <span className="truncate">{supplier.address}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(supplier)} className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] text-[#4B98CF] hover:bg-[#4B98CF]/5 active:scale-[0.95] transition-colors" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => handleDelete(supplier.id)} className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] text-red-400 hover:bg-red-50 hover:text-red-600 active:scale-[0.95] transition-colors" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded border border-[#DCE0E2] bg-white py-16">
            <Building2 className="h-10 w-10 text-[#DCE0E2]" />
            <p className="mt-3 text-sm font-medium text-[#6B7280]">Sin proveedores</p>
            <p className="mt-1 text-xs text-[#6B7280]/70">Agrega tu primer proveedor para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
