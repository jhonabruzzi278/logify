import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Box, Check, Edit2, ImageOff, ImagePlus, Package, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebounce } from "@/hooks/use-debounce";
import { usePermissions } from "@/hooks/use-permissions";
import { useOperationalWorkspace, type OperationalProduct } from "@/hooks/use-operational-workspace";
import { adaptInventory, adaptOrder, adaptSupplier } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import type { ApiInventory, ApiOrder, ApiSupplier } from "@/types/api";
import type { Order, Product, Supplier } from "@/types/domain";

interface ImageResult {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
}

export function InventoryDetailPage() {
  const { productId } = useParams();
  const decodedId = decodeURIComponent(productId ?? "");
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageQuery, setImageQuery] = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [imageSearching, setImageSearching] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", barcode: "", category: "otros", price: 0, cost: 0, supplierId: "", unitOfMeasure: "unidad", taxRate: 0, active: true });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const { can } = usePermissions();

  const { data: product, refresh: refreshProduct } = useApiQuery<ApiInventory, Product | null>({
    path: `/api/inventory/${encodeURIComponent(decodedId)}`, transform: adaptInventory, enabled: Boolean(decodedId)
  });
  const { data: suppliers } = useApiQuery<ApiSupplier[], Supplier[]>({
    path: "/api/suppliers", transform: (r) => r.map(adaptSupplier)
  });
  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });

  const { operationalInventory, operationalOrders } = useOperationalWorkspace({ inventory: product ? [product] : [], orders });
  const resolvedProduct = useMemo(() => operationalInventory[0] ?? product, [operationalInventory, product]);
  const relatedOrders = useMemo(() => resolvedProduct ? operationalOrders.filter((o) => o.sku === resolvedProduct.sku) : [], [operationalOrders, resolvedProduct]);

  const debouncedImageQuery = useDebounce(imageQuery, 500);

  useEffect(() => {
    const q = debouncedImageQuery.trim();
    if (!imagePickerOpen || q.length < 3) { setImageResults([]); return; }
    let cancelled = false;
    setImageSearching(true);
    apiFetch<ImageResult[]>(`/api/inventory/image-search?q=${encodeURIComponent(q)}`)
      .then((r) => { if (!cancelled) setImageResults(r); })
      .catch(() => { if (!cancelled) setImageResults([]); })
      .finally(() => { if (!cancelled) setImageSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedImageQuery, imagePickerOpen]);

  function openEdit() {
    if (!resolvedProduct) return;
    setEditForm({
      name: resolvedProduct.name,
      barcode: resolvedProduct.barcode ?? "",
      category: resolvedProduct.category,
      price: resolvedProduct.price,
      cost: resolvedProduct.cost,
      supplierId: resolvedProduct.supplierId ? String(resolvedProduct.supplierId) : "",
      unitOfMeasure: resolvedProduct.unitOfMeasure ?? "unidad",
      taxRate: resolvedProduct.taxRate ?? 0,
      active: resolvedProduct.active ?? true,
    });
    setEditError("");
    setEditOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedProduct) return;
    setEditError("");
    if (!editForm.name.trim()) { setEditError("El nombre es obligatorio"); return; }
    setEditSaving(true);
    try {
      await apiFetch(`/api/inventory/${encodeURIComponent(resolvedProduct.sku)}/details`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name, barcode: editForm.barcode || null, category: editForm.category, price: editForm.price, cost: editForm.cost,
          supplierId: editForm.supplierId ? Number(editForm.supplierId) : null,
          unitOfMeasure: editForm.unitOfMeasure, taxRate: editForm.taxRate, active: editForm.active,
        }),
      });
      setEditOpen(false);
      refreshProduct();
    } catch (err) {
      setEditError(err instanceof ApiRequestError ? err.message : "No se pudo guardar el producto");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSelectImage(url: string) {
    if (!resolvedProduct) return;
    setImageSaving(true);
    try {
      await apiFetch(`/api/inventory/${encodeURIComponent(resolvedProduct.sku)}/image`, {
        method: "PUT",
        body: JSON.stringify({ imageUrl: url })
      });
      setImagePickerOpen(false);
      refreshProduct();
    } catch {
      alert("No se pudo actualizar la imagen");
    } finally {
      setImageSaving(false);
    }
  }

  if (!resolvedProduct) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Box className="h-12 w-12 text-[#E2E8F0]" />
        <p className="mt-4 font-medium text-[#64748B]">Producto no encontrado</p>
        <Link to="/inventory" className="mt-2 text-sm text-[#2563EB] hover:underline">Volver a inventario</Link>
      </div>
    );
  }

  const stockPct = Math.min(Math.round((resolvedProduct.stock / 100) * 100), 100);
  const healthColor = resolvedProduct.status === "healthy" ? "#0D9488" : resolvedProduct.status === "warning" ? "#D97706" : "#DC2626";
  const opProduct = resolvedProduct as OperationalProduct;
  const delta = opProduct.stockDelta ?? 0;
  const reason = opProduct.lastAdjustmentReason ?? null;
  const adjustedAt = opProduct.lastAdjustmentAt ?? null;

  return (
    <div className="space-y-5">
      <Link to="/inventory" className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#172554]">
        <ArrowLeft className="h-3.5 w-3.5" /> Inventario
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {resolvedProduct.imageUrl ? (
            <img src={resolvedProduct.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover border border-[#E2E8F0]" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC]">
              <ImageOff className="h-5 w-5 text-[#E2E8F0]" />
            </div>
          )}
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Producto</p>
            <h1 className="text-xl font-bold text-[#172554]">SKU {resolvedProduct.sku}</h1>
            <p className="text-sm text-[#64748B]">{resolvedProduct.name}</p>
            {resolvedProduct.barcode && <p className="text-xs font-mono text-[#64748B]">Código {resolvedProduct.barcode}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "self-start rounded-full px-3 py-1 text-xs font-bold",
            resolvedProduct.status === "healthy" && "bg-[#0D9488]/10 text-[#0D9488]",
            resolvedProduct.status === "warning" && "bg-[#D97706]/10 text-[#D97706]",
            resolvedProduct.status === "critical" && "bg-red-50 text-red-500",
          )}>
            {resolvedProduct.status === "healthy" ? "Estable" : resolvedProduct.status === "warning" ? "Bajo" : "Crítico"}
          </span>
          {can("inventory.adjust") && (
            <button type="button"
              onClick={() => (editOpen ? setEditOpen(false) : openEdit())}
              className="flex items-center gap-1.5 rounded border border-[#2563EB]/30 bg-[#2563EB]/5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10"
            >
              <Edit2 className="h-3.5 w-3.5" /> Editar
            </button>
          )}
        </div>
      </div>

      {editOpen && (
        <form onSubmit={handleSaveEdit} className="rounded border border-[#E2E8F0] bg-white p-5 space-y-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Editar producto</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f201" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Nombre</label>
              <Input id="inventory-detail-page-f201" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-barcode" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Código de barras</label>
              <Input id="inventory-detail-barcode" inputMode="numeric" value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} placeholder="Opcional" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f205" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Categoría</label>
              <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                <SelectTrigger id="inventory-detail-page-f205" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bebidas">Bebidas</SelectItem>
                  <SelectItem value="galletas">Galletas</SelectItem>
                  <SelectItem value="dulces">Dulces</SelectItem>
                  <SelectItem value="otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f217" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Precio venta $</label>
              <Input id="inventory-detail-page-f217" type="number" min={0} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f221" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Precio compra $</label>
              <Input id="inventory-detail-page-f221" type="number" min={0} value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f225" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Proveedor</label>
              <Select value={editForm.supplierId || "sin-proveedor"} onValueChange={(v) => setEditForm({ ...editForm, supplierId: v === "sin-proveedor" ? "" : v })}>
                <SelectTrigger id="inventory-detail-page-f225" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin-proveedor">Sin proveedor</SelectItem>
                  {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f235" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Unidad de medida</label>
              <Select value={editForm.unitOfMeasure} onValueChange={(v) => setEditForm({ ...editForm, unitOfMeasure: v })}>
                <SelectTrigger id="inventory-detail-page-f235" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
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
              <label htmlFor="inventory-detail-page-f248" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">IVA %</label>
              <Input id="inventory-detail-page-f248" type="number" min={0} max={100} value={editForm.taxRate} onChange={(e) => setEditForm({ ...editForm, taxRate: parseFloat(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[#172554]">
            <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} className="h-4 w-4 rounded border-[#E2E8F0]" />
            Producto activo
          </label>
          {editError && <p className="text-xs text-red-500">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white" disabled={editSaving}>{editSaving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Stock gauge */}
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Nivel de stock</p>

          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-bold text-[#172554]">{resolvedProduct.stock}</span>
            <span className="text-sm text-[#64748B] pb-1">unidades</span>
            {delta !== 0 && (
              <span className={cn("flex items-center gap-0.5 text-xs font-bold pb-1", delta > 0 ? "text-[#0D9488]" : "text-red-500")}>
                {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {delta > 0 ? "+" : ""}{delta}
              </span>
            )}
          </div>

          {/* Gauge bar */}
          <div className="h-4 rounded-full bg-[#F8FAFC] overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{ width: `${stockPct}%`, backgroundColor: healthColor }}
            />
          </div>

          <div className="flex justify-between mt-2 text-[10px] text-[#64748B]">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded bg-[#F8FAFC] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Actualizado</p>
              <p className="text-sm font-bold text-[#172554]">{new Date(resolvedProduct.updatedAt).toLocaleDateString("es-CL")}</p>
            </div>
          </div>

          {reason && (
            <div className="mt-3 rounded border border-[#2563EB]/20 bg-[#2563EB]/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#2563EB]">Último ajuste</p>
              <p className="mt-1 text-sm text-[#172554]">{reason}</p>
              {adjustedAt && <p className="mt-0.5 text-[10px] text-[#64748B]">{new Date(adjustedAt).toLocaleString("es-CL")}</p>}
            </div>
          )}
        </div>

        {/* Related orders */}
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Pedidos con este SKU ({relatedOrders.length})</p>

          {relatedOrders.length > 0 ? (
            <div className="space-y-2">
              {relatedOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded bg-[#F8FAFC] px-4 py-3 hover:bg-[#E2E8F0] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="h-4 w-4 text-[#64748B]" />
                    <div>
                      <p className="text-sm font-semibold text-[#172554]">Pedido #{order.id}</p>
                      <p className="text-xs text-[#64748B]">Cliente {order.customer} &middot; {order.quantity} unids</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold",
                      order.stage === "entregado" && "bg-green-50 text-green-600",
                      order.stage === "created" && "bg-[#2563EB]/10 text-[#2563EB]",
                      order.stage === "en_preparacion" && "bg-[#D97706]/10 text-[#D97706]",
                      order.stage === "en_reparto" && "bg-purple-50 text-purple-600",
                      order.stage === "cancelado" && "bg-red-50 text-red-500",
                    )}>
                      {order.stage === "created" ? "Pendiente" : order.stage === "en_preparacion" ? "Preparación" : order.stage === "en_reparto" ? "En reparto" : order.stage === "entregado" ? "Entregado" : order.stage === "cancelado" ? "Cancelado" : order.stage}
                    </span>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">{new Date(order.createdAt).toLocaleDateString("es-CL")}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Package className="h-8 w-8 text-[#E2E8F0]" />
              <p className="mt-2 text-xs text-[#64748B]">Sin pedidos asociados</p>
            </div>
          )}
        </div>
      </div>

      {/* Product image picker */}
      <div className="rounded border border-[#E2E8F0] bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-[#2563EB]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Imagen del producto</p>
          </div>
          {!imagePickerOpen && (
            <button type="button"
              onClick={() => { setImagePickerOpen(true); setImageQuery(resolvedProduct.name); }}
              className="flex items-center gap-1.5 rounded border border-[#2563EB]/30 bg-[#2563EB]/5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10"
            >
              <ImagePlus className="h-3.5 w-3.5" /> {resolvedProduct.imageUrl ? "Cambiar imagen" : "Buscar imagen"}
            </button>
          )}
        </div>

        {imagePickerOpen && (
          <div className="space-y-3">
            <input
              value={imageQuery}
              onChange={(e) => setImageQuery(e.target.value)}
              placeholder="Buscar imagen por nombre..."
              className="h-9 w-full rounded border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {imageSearching && (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-[#E2E8F0]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
                </div>
              )}
              {!imageSearching && imageResults.map((img) => (
                <button type="button"
                  key={img.id}
                  disabled={imageSaving}
                  onClick={() => handleSelectImage(img.url)}
                  className={cn(
                    "relative h-16 w-16 overflow-hidden rounded border-2 transition-colors disabled:opacity-50",
                    resolvedProduct.imageUrl === img.url ? "border-[#2563EB]" : "border-transparent hover:border-[#E2E8F0]"
                  )}
                >
                  <img src={img.thumbnail} alt={img.title} className="h-full w-full object-cover" />
                  {resolvedProduct.imageUrl === img.url && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB]"><Check className="h-3 w-3 text-white" /></span>
                  )}
                </button>
              ))}
              {!imageSearching && imageQuery.trim().length >= 3 && imageResults.length === 0 && (
                <p className="text-xs text-[#64748B]">Sin resultados para "{imageQuery}"</p>
              )}
            </div>
            <button type="button" onClick={() => setImagePickerOpen(false)} className="text-xs text-[#64748B] hover:text-[#172554]">Cancelar</button>
          </div>
        )}
      </div>

    </div>
  );
}
