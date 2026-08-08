import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Plus, Search, ShoppingBag } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDebounce } from "@/hooks/use-debounce";
import { adaptInventory, adaptPurchase, adaptSupplier } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiInventory, ApiPurchase, ApiSupplier } from "@/types/api";
import type { Product, Purchase, Supplier } from "@/types/domain";

const emptyForm = {
  sku: "", productSearch: "", supplierId: "", unitCost: "", quantity: "1",
  purchasedAt: new Date().toISOString().slice(0, 10), updatePrices: false,
};

export function PurchasesPage() {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  const { data: purchases, loading, refresh } = useApiQuery<ApiPurchase[], Purchase[]>({
    path: `/api/purchases${debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : ""}`,
    transform: (r) => r.map(adaptPurchase),
  });

  const { data: products } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory", transform: (r) => r.map(adaptInventory)
  });

  const { data: suppliers } = useApiQuery<ApiSupplier[], Supplier[]>({
    path: "/api/suppliers", transform: (r) => r.map(adaptSupplier)
  });

  useAutoRefresh(() => { if (!loading) refresh(); }, 15000);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!form.productSearch) return products.slice(0, 8);
    const q = form.productSearch.toLowerCase();
    return products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 8);
  }, [products, form.productSearch]);

  const subtotal = useMemo(() => {
    const cost = Number(form.unitCost) || 0;
    const qty = Number(form.quantity) || 0;
    return cost * qty;
  }, [form.unitCost, form.quantity]);

  function closeDialog(open: boolean) {
    setDialogOpen(open);
    if (!open) { setForm(emptyForm); setSelectedProduct(null); setFormError(""); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!selectedProduct) { setFormError("Selecciona un producto"); return; }
    if (!form.unitCost || Number(form.unitCost) <= 0) { setFormError("El costo unitario debe ser mayor a 0"); return; }
    if (!form.quantity || Number(form.quantity) < 1) { setFormError("La cantidad debe ser mayor o igual a 1"); return; }

    setSaving(true);
    try {
      await apiFetch("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          sku: selectedProduct.sku,
          supplierId: form.supplierId ? Number(form.supplierId) : null,
          unitCost: Number(form.unitCost),
          quantity: Number(form.quantity),
          purchasedAt: form.purchasedAt,
          updatePrices: form.updatePrices,
        }),
      });
      closeDialog(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Error al registrar la compra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Compras</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Compras a proveedor</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={closeDialog}>
            <DialogTrigger render={<Button className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-[#4B98CF] hover:bg-[#346384] text-white"><Plus className="h-3.5 w-3.5" />Nueva compra</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Registrar compra</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative space-y-1" ref={productDropdownRef}>
                  <label htmlFor="purchases-page-f121" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Producto *</label>
                  <div className="relative">
                    <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input id="purchases-page-f121"
                      value={selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : form.productSearch}
                      onChange={(e) => { setForm({ ...form, productSearch: e.target.value }); setSelectedProduct(null); }}
                      onFocus={() => setShowProductDropdown(true)}
                      placeholder="Buscar producto por nombre o código..."
                      className="h-9 pl-8 text-sm"
                    />
                  </div>
                  {showProductDropdown && !selectedProduct && (
                    <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-[#DCE0E2] bg-white shadow-lg">
                      {filteredProducts.length === 0 && <p className="px-3 py-2 text-xs text-[#6B7280]">Sin resultados</p>}
                      {filteredProducts.map((p) => (
                        <button
                          key={p.sku}
                          type="button"
                          onClick={() => { setSelectedProduct(p); setForm({ ...form, productSearch: p.name }); setShowProductDropdown(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F5F7F9]"
                        >
                          <Package className="h-3.5 w-3.5 shrink-0 text-[#4B98CF]" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="text-[10px] text-[#6B7280]">{p.sku} · stock {p.stock}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="purchases-page-f154" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Proveedor</label>
                  <Select value={form.supplierId || "none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}>
                    <SelectTrigger id="purchases-page-f154" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proveedor</SelectItem>
                      {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="purchases-page-f166" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Costo unitario *</label>
                    <Input id="purchases-page-f166" type="number" min="0" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="1500" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="purchases-page-f170" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Cantidad *</label>
                    <Input id="purchases-page-f170" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="10" className="h-9 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="purchases-page-f176" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Fecha</label>
                  <Input id="purchases-page-f176" type="date" value={form.purchasedAt} onChange={(e) => setForm({ ...form, purchasedAt: e.target.value })} className="h-9 text-sm" />
                </div>

                <label className="flex items-center gap-2 rounded border border-[#DCE0E2] bg-[#F8FBFD] px-3 py-2.5">
                  <input type="checkbox" checked={form.updatePrices} onChange={(e) => setForm({ ...form, updatePrices: e.target.checked })} className="h-4 w-4" />
                  <span className="text-xs text-[#112b4a]">
                    <span className="font-semibold">Actualizar precios de venta</span> — usa el costo de esta compra como nuevo costo del producto.
                  </span>
                </label>

                <div className="flex items-center justify-between rounded bg-[#4B98CF]/10 px-3 py-2.5">
                  <span className="text-sm font-bold text-[#112b4a]">Subtotal</span>
                  <span className="text-lg font-bold text-[#4B98CF]">{formatCurrency(subtotal)}</span>
                </div>

                {formError && <p className="text-xs text-red-500">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => closeDialog(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={saving}>{saving ? "Registrando..." : "Registrar compra"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <span className="text-xs text-[#6B7280]">{purchases?.length ?? 0} compras</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por producto, unidad o usuario..."
          className="h-10 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded border border-[#DCE0E2] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Fecha</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Unidad</th>
                <th className="px-4 py-2.5">Costo unitario</th>
                <th className="px-4 py-2.5">Cantidad</th>
                <th className="px-4 py-2.5">Subtotal</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {(purchases ?? []).map((p) => (
                <tr key={p.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-[#112b4a]">{p.productName}</p>
                    <p className="text-[10px] text-[#6B7280]">{p.sku} · {p.supplierName || "Sin proveedor asignado"}</p>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-[#6B7280] sm:table-cell">{new Date(p.purchasedAt).toLocaleDateString("es-CL")}</td>
                  <td className="hidden px-4 py-2.5 text-xs text-[#6B7280] sm:table-cell">{p.unitOfMeasure}</td>
                  <td className="px-4 py-2.5">{formatCurrency(p.unitCost)}</td>
                  <td className="px-4 py-2.5">{p.quantity}</td>
                  <td className="px-4 py-2.5 font-bold">{formatCurrency(p.subtotal)}</td>
                  <td className="hidden px-4 py-2.5 text-xs text-[#6B7280] sm:table-cell">{p.createdBy ?? "-"}</td>
                </tr>
              ))}
              {(purchases ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <ShoppingBag className="mx-auto h-10 w-10 text-[#DCE0E2]" />
                    <p className="mt-3 text-sm font-medium text-[#6B7280]">Sin compras registradas</p>
                    <p className="mt-1 text-xs text-[#6B7280]/70">Registra tu primera compra para reponer stock.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
