import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageOff, Minus, PackagePlus, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { formatUF, formatUSD, useIndicadores } from "@/hooks/use-indicadores";
import { adaptInventory, adaptSupplier } from "@/lib/api-adapters";
import { apiFetch } from "@/lib/api-client";
import { downloadFile } from "@/lib/api-blob";
import { exportInventoryCSV } from "@/lib/export-csv";
import type { ApiSupplier } from "@/types/api";
import type { Supplier } from "@/types/domain";

import { cn, onEscapeKey } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiInventory } from "@/types/api";
import type { Product, ProductCategory } from "@/types/domain";

export function InventoryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    sku: "", name: "", category: "bebidas" as ProductCategory, stock: 0, price: 0, cost: 0,
    supplierId: "", unitOfMeasure: "unidad", taxRate: 19, active: true,
  });
  const [formError, setFormError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ sku: string; name: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ rows: Array<{ sku: string; name: string }>; errors: string[] } | null>(null);
  const [importCsvText, setImportCsvText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: suppliers } = useApiQuery<ApiSupplier[], Supplier[]>({
    path: "/api/suppliers", transform: (r) => r.map(adaptSupplier)
  });
  const { can, role } = usePermissions();
  const { uf, dolar } = useIndicadores();

  const { session } = useAuth();
  const canAdjust = can("inventory.adjust");
  const isOwner = role === "owner";
  const isVendor = role === "vendor";

  const { data: inventory, loading, error, refresh } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory", transform: (r) => r.map(adaptInventory)
  });

  useAutoRefresh(() => { if (!loading) refresh(); }, 10000);

  const { operationalInventory, adjustInventory, addProduct, deleteProduct } = useOperationalWorkspace({ inventory });

  async function handleAdjust(product: Product, delta: number, reason: string) {
    await adjustInventory(product, delta, reason);
    refresh();
  }

  async function handleAdd(data: {
    sku: string; name: string; stock: number; price: number; cost: number; category: ProductCategory;
    supplierId?: number | null; unitOfMeasure?: string; taxRate?: number; active?: boolean;
  }) {
    await addProduct(data);
    refresh();
  }

  async function handleImportPreview(csv: string) {
    setImportBusy(true);
    setImportResult(null);
    try {
      const preview = await apiFetch<{ rows: Array<{ sku: string; name: string }>; errors: string[] }>("/api/inventory/import", {
        method: "POST",
        body: JSON.stringify({ csv, commit: false }),
      });
      setImportPreview(preview);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "No se pudo leer el CSV");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImportCommit() {
    setImportBusy(true);
    try {
      const result = await apiFetch<{ imported: number; errors: string[] }>("/api/inventory/import", {
        method: "POST",
        body: JSON.stringify({ csv: importCsvText, commit: true }),
      });
      setImportResult(`${result.imported} productos importados correctamente`);
      setImportPreview(null);
      refresh();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "No se pudo importar el CSV");
    } finally {
      setImportBusy(false);
    }
  }

  function handleFileSelected(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportCsvText(text);
      handleImportPreview(text);
    };
    reader.readAsText(file);
  }

  async function handleDelete(sku: string) {
    await deleteProduct(sku);
    setDeleteConfirm(null);
    refresh();
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      await downloadFile("/api/inventory/report/pdf", `inventario-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      alert("No se pudo generar el PDF de inventario");
    } finally {
      setPdfLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = operationalInventory;
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q));
    }
    return list;
  }, [operationalInventory, filter, query]);

  const counts = useMemo(() => ({
    total: operationalInventory.length,
    critical: operationalInventory.filter((p) => p.status === "critical").length,
    warning: operationalInventory.filter((p) => p.status === "warning").length,
    totalUnits: operationalInventory.reduce((s, p) => s + p.stock, 0),
  }), [operationalInventory]);

  if (loading && !inventory) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4B98CF] border-t-transparent" />
      </div>
    );
  }

  if (error && !inventory) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <p className="text-sm font-medium text-red-500">{error}</p>
        <button type="button" onClick={refresh} className="text-xs text-[#4B98CF] hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Inventario</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Control de stock</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => exportInventoryCSV(operationalInventory.map(p => ({ sku: String(p.sku), stock: p.stock, status: String(p.status), updatedAt: p.updatedAt })))}
            className="flex items-center gap-1 rounded border border-border bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#112b4a]"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
          <button type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-1 rounded border border-border bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#112b4a] disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" /> {pdfLoading ? "Generando..." : "PDF"}
          </button>
          {canAdjust && (
          <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportPreview(null); setImportCsvText(""); setImportResult(null); } }}>
            <DialogTrigger render={<Button variant="outline" className="flex items-center gap-1 h-9 px-3 text-xs font-semibold"><Upload className="h-3.5 w-3.5" />Importar CSV</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Importar productos desde CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => downloadFile("/api/inventory/import/template", "plantilla-productos.csv")}
                  className="text-xs text-[#4B98CF] hover:underline"
                >
                  Descargar plantilla de ejemplo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                  className="block w-full text-xs text-[#6B7280] file:mr-3 file:rounded file:border-0 file:bg-[#4B98CF] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                {importBusy && <p className="text-xs text-[#6B7280]">Procesando...</p>}
                {importPreview && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#112b4a]">{importPreview.rows.length} productos listos para importar</p>
                    {importPreview.errors.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-red-500">
                        {importPreview.errors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    )}
                    <div className="max-h-40 overflow-y-auto rounded border border-[#ECEEF0]">
                      {importPreview.rows.map((row, i) => (
                        <div key={i} className="flex justify-between border-b border-[#F5F7F9] px-3 py-1.5 text-xs last:border-b-0">
                          <span className="font-mono text-[#112b4a]">{row.sku}</span>
                          <span className="text-[#6B7280]">{row.name}</span>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={importBusy} onClick={handleImportCommit}>
                      Confirmar importación
                    </Button>
                  </div>
                )}
                {importResult && <p className="text-xs font-semibold text-[#4EB4A5]">{importResult}</p>}
              </div>
            </DialogContent>
          </Dialog>
          )}
          {canAdjust && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFormError(""); }}>
            <DialogTrigger render={<Button className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold bg-[#4B98CF] hover:bg-[#346384] text-white"><PackagePlus className="h-3.5 w-3.5" />Agregar producto</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Nuevo producto</DialogTitle>
              </DialogHeader>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setFormError("");
                if (!form.sku.trim() || !form.name.trim()) { setFormError("SKU y Nombre son obligatorios"); return; }
                if (form.stock < 0 || form.price < 0 || form.cost < 0) { setFormError("Stock, Precio y Costo no pueden ser negativos"); return; }
                await handleAdd({
                  sku: form.sku, name: form.name, category: form.category, stock: form.stock, price: form.price, cost: form.cost,
                  supplierId: form.supplierId ? Number(form.supplierId) : null, unitOfMeasure: form.unitOfMeasure, taxRate: form.taxRate, active: form.active,
                });
                setForm({ sku: "", name: "", category: "bebidas", stock: 0, price: 0, cost: 0, supplierId: "", unitOfMeasure: "unidad", taxRate: 19, active: true });
                setDialogOpen(false);
              }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f287" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">SKU</label>
                    <Input id="inventory-page-f287" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="COCA-COLA-2L" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f291" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Categoría</label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ProductCategory })}>
                      <SelectTrigger id="inventory-page-f291" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bebidas">Bebidas</SelectItem>
                        <SelectItem value="galletas">Galletas</SelectItem>
                        <SelectItem value="dulces">Dulces</SelectItem>
                        <SelectItem value="otros">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="inventory-page-f304" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nombre</label>
                  <Input id="inventory-page-f304" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Coca-Cola 2L" className="h-9 text-sm" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f310" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Proveedor</label>
                    <Select value={form.supplierId || "none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}>
                      <SelectTrigger id="inventory-page-f310" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin proveedor</SelectItem>
                        {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f320" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Unidad</label>
                    <Select value={form.unitOfMeasure} onValueChange={(v) => setForm({ ...form, unitOfMeasure: v })}>
                      <SelectTrigger id="inventory-page-f320" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unidad">Unidad</SelectItem>
                        <SelectItem value="kg">Kilogramo</SelectItem>
                        <SelectItem value="g">Gramo</SelectItem>
                        <SelectItem value="l">Litro</SelectItem>
                        <SelectItem value="ml">Mililitro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f333" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">IVA %</label>
                    <Input id="inventory-page-f333" type="number" min={0} max={100} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })} className="h-9 text-sm" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-[#112b4a]">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-[#DCE0E2]" />
                  Producto activo
                </label>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f407" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Stock</label>
                    <Input id="inventory-page-f407" type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f411" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Precio venta $</label>
                    <Input id="inventory-page-f411"
                      type="text"
                      inputMode="decimal"
                      value={form.price > 0 ? form.price.toLocaleString("es-CL") : ""}
                      placeholder="2.500"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setForm({ ...form, price: parseInt(raw) || 0 });
                      }}
                      className="h-9 text-sm"
                    />
                    {form.price > 0 && (formatUF(form.price, uf) || formatUSD(form.price, dolar)) && (
                      <p className="text-[10px] text-muted-foreground">
                        {[formatUF(form.price, uf), formatUSD(form.price, dolar)].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inventory-page-f430" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Precio compra $</label>
                    <Input id="inventory-page-f430"
                      type="text"
                      inputMode="decimal"
                      value={form.cost > 0 ? form.cost.toLocaleString("es-CL") : ""}
                      placeholder="1.500"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setForm({ ...form, cost: parseInt(raw) || 0 });
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                {(form.price > 0 || form.cost > 0) && (
                  <p className="text-xs font-medium text-[#4EB4A5]">
                    Ganancia por unidad: ${(form.price - form.cost).toLocaleString("es-CL")}
                  </p>
                )}
                {formError && <p className="text-xs text-red-500">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDialogOpen(false); setFormError(""); }}>Cancelar</Button>
                  <Button type="submit" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white">Guardar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
          <span className="text-xs text-[#6B7280]">{counts.total} SKU · {counts.totalUnits} unids totales</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar SKU..."
            className="h-10 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-1 rounded border border-border bg-card p-0.5 overflow-x-auto scroll-x">
          {(["all", "critical", "warning", "healthy"] as const).map((f) => (
            <button type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                filter === f ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Todos" : f === "critical" ? "Crítico" : f === "warning" ? "Bajo" : "Estable"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded border border-border bg-card">
        <div className="overflow-x-auto scroll-x">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#ECEEF0] text-xs font-bold uppercase tracking-[0.92px] text-muted-foreground">
                <th className="px-4 py-3 w-6"></th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 hidden sm:table-cell">Nombre</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3 hidden md:table-cell">Estado</th>
                <th className="px-4 py-3 text-right">{canAdjust ? "Ajuste" : ""}</th>
              </tr>
            </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.sku} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9] cursor-pointer" onClick={() => navigate(`/inventory/${product.sku}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2.5 w-2.5 rounded-full shrink-0",
                      product.status === "healthy" && "bg-[#4EB4A5]",
                      product.status === "warning" && "bg-[#E3AA75]",
                      product.status === "critical" && "bg-red-500",
                    )} />
                    {isOwner && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ sku: product.sku, name: product.name }); }}
                        className="p-0.5 rounded text-red-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar producto"
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-[#4B98CF] hover:underline">
                  <Link to={`/inventory/${product.sku}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#F5F7F9]"><ImageOff className="h-3 w-3 text-[#DCE0E2]" /></span>
                    )}
                    {product.sku}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">{product.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-bold text-sm", product.stock <= 5 && "text-red-500")}>{product.stock}</span>
                    <div className="hidden w-20 h-1.5 rounded-full bg-[#F5F7F9] sm:block">
                      <div
                        className={cn("h-1.5 rounded-full", product.stock <= 5 ? "bg-red-500" : product.stock <= 20 ? "bg-[#E3AA75]" : "bg-[#4EB4A5]")}
                        style={{ width: `${Math.min(Math.round((product.stock / 100) * 100), 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  <span className={cn(
                    "rounded px-2 py-0.5 text-xs font-bold",
                    product.status === "healthy" && "bg-[#4EB4A5]/10 text-[#4EB4A5]",
                    product.status === "warning" && "bg-[#E3AA75]/10 text-[#E3AA75]",
                    product.status === "critical" && "bg-red-50 text-red-500",
                  )}>
                    {product.status === "healthy" ? "Estable" : product.status === "warning" ? "Bajo" : "Crítico"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {canAdjust && (
                    <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                      <button type="button"
                        onClick={() => handleAdjust(product, -10, "Reserva -10")}
                        className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] sm:min-h-[44px] px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-red-500 hover:bg-red-50 active:scale-[0.98]"
                      >-10</button>
                      <button type="button"
                        onClick={() => handleAdjust(product, -1, "Reserva manual")}
                        className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-red-500 hover:bg-red-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      ><Minus className="h-4 w-4" /></button>
                      <button type="button"
                        onClick={() => handleAdjust(product, 1, "Reposición rápida")}
                        className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-green-600 hover:bg-green-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      ><Plus className="h-4 w-4" /></button>
                      <button type="button"
                        onClick={() => handleAdjust(product, 10, "Reposición +10")}
                        className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] sm:min-h-[44px] px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-green-600 hover:bg-green-50 active:scale-[0.98]"
                      >+10</button>
                    </div>
                  )}
                  {isVendor && (product.status === "critical" || product.status === "warning") && (
                    <button type="button"
                      onClick={async () => {
                        await apiFetch("/api/notifications/alert", {
                          method: "POST",
                          body: JSON.stringify({
                            sku: product.sku,
                            name: product.name,
                            stock: product.stock,
                            type: "critical_stock",
                            vendor: session?.name ?? "Vendedor"
                          })
                        }).catch(() => {});
                        alert("Aviso de stock crítico enviado al administrador");
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-[#E3AA75] hover:bg-amber-50 active:scale-[0.98]"
                    >
                      Alertar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-xs text-[#6B7280]">Sin productos que coincidan con el filtro</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {deleteConfirm && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteConfirm(null)}
          onKeyDown={onEscapeKey(() => setDeleteConfirm(null))}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#112b4a]">Eliminar producto</h3>
              <button type="button" onClick={() => setDeleteConfirm(null)} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-[#6B7280]">
              ¿Estás seguro de eliminar <strong>{deleteConfirm.name}</strong> ({deleteConfirm.sku})?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(deleteConfirm.sku)}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
