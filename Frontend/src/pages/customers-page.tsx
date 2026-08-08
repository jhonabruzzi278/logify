import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, MapPin, Pencil, Plus, Search, Trash2, User, UserPlus, XCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { CUSTOMER_TYPE_BY_MODE, useBusinessMode } from "@/hooks/use-business-mode";
import { useDebounce } from "@/hooks/use-debounce";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptCustomer } from "@/lib/api-adapters";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiCustomer } from "@/types/api";
import type { Customer, CustomerType } from "@/types/domain";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = { individual: "Persona natural", company: "Empresa" };

interface RutValidation {
  valid: boolean;
  formatted?: string;
  error?: string;
}

interface AddressSuggestion {
  displayName: string;
  lat: number;
  lon: number;
}

function formatRut(value: string) {
  const clean = value.replace(/[^0-9kK]/g, "");
  if (clean.length <= 1) return clean;
  const dv = clean.slice(-1).toUpperCase();
  const body = clean.slice(0, -1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

export function CustomersPage() {
  const { mode } = useBusinessMode();
  const { can } = usePermissions();
  const canManage = can("customers.manage");
  const segmentType = CUSTOMER_TYPE_BY_MODE[mode];
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", rut: "", province: "", customerType: segmentType, creditLimit: "" });
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [rutStatus, setRutStatus] = useState<RutValidation | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);

  const debouncedRut = useDebounce(form.rut, 400);
  const debouncedAddress = useDebounce(form.address, 400);

  // form.customerType se inicializa una sola vez con el segmentType del
  // primer render. Sin este sync, cambiar de modo B2B/B2C y abrir "Nuevo
  // cliente" sin haber cerrado antes el dialogo en ese modo guarda el
  // cliente con el customerType viejo -- queda invisible en la lista
  // filtrada por segmentType (bug real: cliente creado en modo B2B con
  // customerType "individual").
  useEffect(() => {
    if (!editCustomer) {
      setForm((f) => ({ ...f, customerType: segmentType }));
    }
  }, [segmentType, editCustomer]);

  const { data: customers, loading, refresh } = useApiQuery<ApiCustomer[], Customer[]>({
    path: "/api/customers", transform: (r) => r.map(adaptCustomer)
  });

  useEffect(() => {
    const clean = debouncedRut.trim();
    if (!clean) { setRutStatus(null); return; }
    let cancelled = false;
    apiFetch<RutValidation>(`/api/customers/validate-rut?rut=${encodeURIComponent(clean)}`)
      .then((r) => { if (!cancelled) setRutStatus(r); })
      .catch(() => { if (!cancelled) setRutStatus(null); });
    return () => { cancelled = true; };
  }, [debouncedRut]);

  useEffect(() => {
    const q = debouncedAddress.trim();
    if (q.length < 3) { setAddressSuggestions([]); return; }
    let cancelled = false;
    setAddressLoading(true);
    apiFetch<AddressSuggestion[]>(`/api/customers/address-suggest?q=${encodeURIComponent(q)}`)
      .then((r) => { if (!cancelled) setAddressSuggestions(r); })
      .catch(() => { if (!cancelled) setAddressSuggestions([]); })
      .finally(() => { if (!cancelled) setAddressLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedAddress]);

  useAutoRefresh(() => { if (!loading) refresh(); }, 15000);

  const filtered = useMemo(() => {
    if (!customers) return [];
    let list = customers.filter((c) => c.customerType === segmentType);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((c) => `${c.name} ${c.phone ?? ""} ${c.address ?? ""} ${c.email ?? ""} ${c.rut ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [customers, query, segmentType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) { setFormError("El nombre es obligatorio"); return; }

    setCreating(true);
    try {
      const body = JSON.stringify({
        name: form.name, phone: form.phone, address: form.address, email: form.email,
        rut: form.rut || null, province: form.province || null,
        customerType: form.customerType, creditLimit: form.creditLimit || null,
      });
      if (editCustomer) {
        await apiFetch(`/api/customers/${editCustomer.id}`, { method: "PUT", body });
      } else {
        await apiFetch("/api/customers", { method: "POST", body });
      }
      setForm({ name: "", phone: "", address: "", email: "", rut: "", province: "", customerType: segmentType, creditLimit: "" });
      setEditCustomer(null);
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Error al guardar");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(c: Customer) {
    setEditCustomer(c);
    setForm({
      name: c.name, phone: c.phone ?? "", address: c.address ?? "", email: c.email ?? "", rut: c.rut ?? "", province: c.province ?? "",
      customerType: c.customerType, creditLimit: c.creditLimit != null ? String(c.creditLimit) : "",
    });
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este cliente?")) return;
    await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Clientes</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Gestión de clientes</h1>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setFormError(""); setEditCustomer(null); setForm({ name: "", phone: "", address: "", email: "", rut: "", province: "", customerType: segmentType, creditLimit: "" }); setRutStatus(null); setAddressSuggestions([]); } }}>
            <DialogTrigger render={<Button className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-[#4B98CF] hover:bg-[#346384] text-white"><UserPlus className="h-3.5 w-3.5" />Nuevo cliente</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>{editCustomer ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center gap-2 rounded border border-[#DCE0E2] bg-[#F8FAFB] px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Tipo de cliente</span>
                  <span className="rounded-full bg-[#4B98CF]/10 px-2 py-0.5 text-xs font-bold text-[#4B98CF]">
                    {CUSTOMER_TYPE_LABELS[segmentType]}
                  </span>
                  <span className="text-[10px] text-[#6B7280]">(según modo {mode.toUpperCase()} activo)</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nombre *</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bar El Rincon" className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">RUT{form.customerType === "company" ? " *" : " (opcional)"}</label>
                    <Input value={form.rut} onChange={(e) => setForm({ ...form, rut: formatRut(e.target.value) })} placeholder="12.345.678-9" className="h-9 text-sm" maxLength={12} />
                    {rutStatus && (
                      <p className={cn("flex items-center gap-1 text-[10px] font-semibold", rutStatus.valid ? "text-[#4EB4A5]" : "text-red-500")}>
                        {rutStatus.valid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {rutStatus.valid ? `RUT válido (${rutStatus.formatted})` : (rutStatus.error ?? "RUT inválido")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Teléfono</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56912345678" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Email</label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contacto@email.cl" className="h-9 text-sm" />
                  </div>
                  <div className="relative space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Dirección</label>
                    <Input
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      onFocus={() => setAddressFocused(true)}
                      onBlur={() => setTimeout(() => setAddressFocused(false), 150)}
                      placeholder="Av. Libertador 1234"
                      className="h-9 text-sm"
                      autoComplete="off"
                    />
                    {addressFocused && (addressLoading || addressSuggestions.length > 0) && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded border border-[#DCE0E2] bg-white shadow-lg">
                        {addressLoading && (
                          <p className="px-3 py-2 text-xs text-[#6B7280]">Buscando direcciones...</p>
                        )}
                        {!addressLoading && addressSuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); setForm({ ...form, address: s.displayName }); setAddressSuggestions([]); }}
                            className="flex w-full items-start gap-1.5 border-b border-[#F5F7F9] px-3 py-2 text-left text-xs text-[#112b4a] last:border-b-0 hover:bg-[#F5F7F9]"
                          >
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#4B98CF]" />
                            <span className="line-clamp-2">{s.displayName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Provincia / Región</label>
                    <Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Región Metropolitana" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Límite de crédito (fiado)</label>
                    <Input type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="Sin límite" className="h-9 text-sm" />
                  </div>
                </div>
                {formError && <p className="text-xs text-red-500">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditCustomer(null); }}>Cancelar</Button>
                  <Button type="submit" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={creating}>{creating ? "Guardando..." : "Guardar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
          <span className="text-xs text-[#6B7280]">{filtered.length} clientes</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, telefono, direccion..."
            className="h-10 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold",
            segmentType === "individual" ? "border-[#4EB4A5]/30 bg-[#4EB4A5]/10 text-[#4EB4A5]" : "border-[#4B98CF]/30 bg-[#4B98CF]/10 text-[#4B98CF]"
          )}
          title="Los clientes B2B y B2C no se comparten: cambia el modo desde la barra superior para ver el otro segmento."
        >
          {CUSTOMER_TYPE_LABELS[segmentType]}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((customer) => (
          <div key={customer.id} className="rounded border border-[#DCE0E2] bg-white p-4 hover:border-[#4B98CF]/40 transition-colors cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4B98CF]/10">
                <User className="h-5 w-5 text-[#4B98CF]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#112b4a]">{customer.name}</p>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    customer.customerType === "individual" ? "bg-[#4EB4A5]/10 text-[#4EB4A5]" : "bg-[#4B98CF]/10 text-[#4B98CF]"
                  )}>
                    {CUSTOMER_TYPE_LABELS[customer.customerType]}
                  </span>
                  {!!customer.creditBalance && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                      Debe ${customer.creditBalance.toLocaleString("es-CL")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#6B7280] mt-0.5">
                  {customer.rut && <span className="font-mono font-semibold text-[#112b4a]">RUT {customer.rut}</span>}
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.email && <span>{customer.email}</span>}
                  {customer.address && <span className="truncate">{customer.address}</span>}
                </div>
              </div>
              {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(customer)} className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] text-[#4B98CF] hover:bg-[#4B98CF]/5 active:scale-[0.95] transition-colors" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(customer.id)} className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] text-red-400 hover:bg-red-50 hover:text-red-600 active:scale-[0.95] transition-colors" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded border border-[#DCE0E2] bg-white py-16">
            <User className="h-10 w-10 text-[#DCE0E2]" />
            <p className="mt-3 text-sm font-medium text-[#6B7280]">Sin clientes</p>
            <p className="mt-1 text-xs text-[#6B7280]/70">Agrega tu primer cliente para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
