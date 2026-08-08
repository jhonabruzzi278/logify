import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Box, Check, Edit2, ImageOff, ImagePlus, Package, Printer, QrCode, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAuthImage } from "@/hooks/use-auth-image";
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

const LABEL_GRID_PRESETS = [
  { key: "1x1", cols: 1, rows: 1, label: "1 por hoja (grande)" },
  { key: "2x2", cols: 2, rows: 2, label: "4 por hoja (2x2)" },
  { key: "3x3", cols: 3, rows: 3, label: "9 por hoja (3x3)" },
  { key: "4x4", cols: 4, rows: 4, label: "16 por hoja (4x4)" },
  { key: "4x6", cols: 4, rows: 6, label: "24 por hoja (4x6)" },
  { key: "4x10", cols: 4, rows: 10, label: "40 por hoja (4x10, etiquetas chicas)" },
] as const;

export function InventoryDetailPage() {
  const { productId } = useParams();
  const decodedId = decodeURIComponent(productId ?? "");
  const [qrRequested, setQrRequested] = useState(false);
  const [labelGridKey, setLabelGridKey] = useState<(typeof LABEL_GRID_PRESETS)[number]["key"]>("1x1");
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageQuery, setImageQuery] = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [imageSearching, setImageSearching] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", category: "otros", price: 0, cost: 0, supplierId: "", unitOfMeasure: "unidad", taxRate: 0, active: true });
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

  const qrImage = useAuthImage(qrRequested && resolvedProduct ? `/api/inventory/${encodeURIComponent(resolvedProduct.sku)}/qr` : null);

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
          name: editForm.name, category: editForm.category, price: editForm.price, cost: editForm.cost,
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
        <Box className="h-12 w-12 text-[#DCE0E2]" />
        <p className="mt-4 font-medium text-[#6B7280]">Producto no encontrado</p>
        <Link to="/inventory" className="mt-2 text-sm text-[#4B98CF] hover:underline">Volver a inventario</Link>
      </div>
    );
  }

  const stockPct = Math.min(Math.round((resolvedProduct.stock / 100) * 100), 100);
  const healthColor = resolvedProduct.status === "healthy" ? "#4EB4A5" : resolvedProduct.status === "warning" ? "#E3AA75" : "#CF4B4B";
  const opProduct = resolvedProduct as OperationalProduct;
  const delta = opProduct.stockDelta ?? 0;
  const reason = opProduct.lastAdjustmentReason ?? null;
  const adjustedAt = opProduct.lastAdjustmentAt ?? null;

  return (
    <div className="space-y-5">
      <Link to="/inventory" className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#112b4a]">
        <ArrowLeft className="h-3.5 w-3.5" /> Inventario
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {resolvedProduct.imageUrl ? (
            <img src={resolvedProduct.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover border border-[#DCE0E2]" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#DCE0E2] bg-[#F8FAFB]">
              <ImageOff className="h-5 w-5 text-[#DCE0E2]" />
            </div>
          )}
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Producto</p>
            <h1 className="text-xl font-bold text-[#112b4a]">SKU {resolvedProduct.sku}</h1>
            <p className="text-sm text-[#6B7280]">{resolvedProduct.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "self-start rounded-full px-3 py-1 text-xs font-bold",
            resolvedProduct.status === "healthy" && "bg-[#4EB4A5]/10 text-[#4EB4A5]",
            resolvedProduct.status === "warning" && "bg-[#E3AA75]/10 text-[#E3AA75]",
            resolvedProduct.status === "critical" && "bg-red-50 text-red-500",
          )}>
            {resolvedProduct.status === "healthy" ? "Estable" : resolvedProduct.status === "warning" ? "Bajo" : "Crítico"}
          </span>
          {can("inventory.adjust") && (
            <button type="button"
              onClick={() => (editOpen ? setEditOpen(false) : openEdit())}
              className="flex items-center gap-1.5 rounded border border-[#4B98CF]/30 bg-[#4B98CF]/5 px-3 py-1.5 text-xs font-semibold text-[#4B98CF] hover:bg-[#4B98CF]/10"
            >
              <Edit2 className="h-3.5 w-3.5" /> Editar
            </button>
          )}
        </div>
      </div>

      {editOpen && (
        <form onSubmit={handleSaveEdit} className="rounded border border-[#DCE0E2] bg-white p-5 space-y-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Editar producto</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f201" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nombre</label>
              <Input id="inventory-detail-page-f201" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f205" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Categoría</label>
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
              <label htmlFor="inventory-detail-page-f217" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Precio venta $</label>
              <Input id="inventory-detail-page-f217" type="number" min={0} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f221" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Precio compra $</label>
              <Input id="inventory-detail-page-f221" type="number" min={0} value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: parseInt(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f225" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Proveedor</label>
              <Select value={editForm.supplierId || "none"} onValueChange={(v) => setEditForm({ ...editForm, supplierId: v === "none" ? "" : v })}>
                <SelectTrigger id="inventory-detail-page-f225" size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="inventory-detail-page-f235" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Unidad de medida</label>
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
              <label htmlFor="inventory-detail-page-f248" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">IVA %</label>
              <Input id="inventory-detail-page-f248" type="number" min={0} max={100} value={editForm.taxRate} onChange={(e) => setEditForm({ ...editForm, taxRate: parseFloat(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[#112b4a]">
            <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} className="h-4 w-4 rounded border-[#DCE0E2]" />
            Producto activo
          </label>
          {editError && <p className="text-xs text-red-500">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" disabled={editSaving}>{editSaving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Stock gauge */}
        <div className="rounded border border-[#DCE0E2] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Nivel de stock</p>

          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-bold text-[#112b4a]">{resolvedProduct.stock}</span>
            <span className="text-sm text-[#6B7280] pb-1">unidades</span>
            {delta !== 0 && (
              <span className={cn("flex items-center gap-0.5 text-xs font-bold pb-1", delta > 0 ? "text-[#4EB4A5]" : "text-red-500")}>
                {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {delta > 0 ? "+" : ""}{delta}
              </span>
            )}
          </div>

          {/* Gauge bar */}
          <div className="h-4 rounded-full bg-[#F5F7F9] overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{ width: `${stockPct}%`, backgroundColor: healthColor }}
            />
          </div>

          <div className="flex justify-between mt-2 text-[10px] text-[#6B7280]">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded bg-[#F8FAFB] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Actualizado</p>
              <p className="text-sm font-bold text-[#112b4a]">{new Date(resolvedProduct.updatedAt).toLocaleDateString("es-CL")}</p>
            </div>
          </div>

          {reason && (
            <div className="mt-3 rounded border border-[#4B98CF]/20 bg-[#4B98CF]/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#4B98CF]">Último ajuste</p>
              <p className="mt-1 text-sm text-[#112b4a]">{reason}</p>
              {adjustedAt && <p className="mt-0.5 text-[10px] text-[#6B7280]">{new Date(adjustedAt).toLocaleString("es-CL")}</p>}
            </div>
          )}
        </div>

        {/* Related orders */}
        <div className="rounded border border-[#DCE0E2] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Pedidos con este SKU ({relatedOrders.length})</p>

          {relatedOrders.length > 0 ? (
            <div className="space-y-2">
              {relatedOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded bg-[#F8FAFB] px-4 py-3 hover:bg-[#ECEEF0] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="h-4 w-4 text-[#6B7280]" />
                    <div>
                      <p className="text-sm font-semibold text-[#112b4a]">Pedido #{order.id}</p>
                      <p className="text-xs text-[#6B7280]">Cliente {order.customer} &middot; {order.quantity} unids</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold",
                      order.stage === "entregado" && "bg-green-50 text-green-600",
                      order.stage === "created" && "bg-[#4B98CF]/10 text-[#4B98CF]",
                      order.stage === "en_preparacion" && "bg-[#E3AA75]/10 text-[#E3AA75]",
                      order.stage === "en_reparto" && "bg-purple-50 text-purple-600",
                      order.stage === "cancelado" && "bg-red-50 text-red-500",
                    )}>
                      {order.stage === "created" ? "Pendiente" : order.stage === "en_preparacion" ? "Preparación" : order.stage === "en_reparto" ? "En reparto" : order.stage === "entregado" ? "Entregado" : order.stage === "cancelado" ? "Cancelado" : order.stage}
                    </span>
                    <p className="mt-0.5 text-[10px] text-[#6B7280]">{new Date(order.createdAt).toLocaleDateString("es-CL")}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Package className="h-8 w-8 text-[#ECEEF0]" />
              <p className="mt-2 text-xs text-[#6B7280]">Sin pedidos asociados</p>
            </div>
          )}
        </div>
      </div>

      {/* Product image picker */}
      <div className="rounded border border-[#DCE0E2] bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-[#4B98CF]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Imagen del producto</p>
          </div>
          {!imagePickerOpen && (
            <button type="button"
              onClick={() => { setImagePickerOpen(true); setImageQuery(resolvedProduct.name); }}
              className="flex items-center gap-1.5 rounded border border-[#4B98CF]/30 bg-[#4B98CF]/5 px-3 py-1.5 text-xs font-semibold text-[#4B98CF] hover:bg-[#4B98CF]/10"
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
                <div className="flex h-16 w-16 items-center justify-center rounded border border-[#DCE0E2]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4B98CF] border-t-transparent" />
                </div>
              )}
              {!imageSearching && imageResults.map((img) => (
                <button type="button"
                  key={img.id}
                  disabled={imageSaving}
                  onClick={() => handleSelectImage(img.url)}
                  className={cn(
                    "relative h-16 w-16 overflow-hidden rounded border-2 transition-colors disabled:opacity-50",
                    resolvedProduct.imageUrl === img.url ? "border-[#4B98CF]" : "border-transparent hover:border-[#DCE0E2]"
                  )}
                >
                  <img src={img.thumbnail} alt={img.title} className="h-full w-full object-cover" />
                  {resolvedProduct.imageUrl === img.url && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#4B98CF]"><Check className="h-3 w-3 text-white" /></span>
                  )}
                </button>
              ))}
              {!imageSearching && imageQuery.trim().length >= 3 && imageResults.length === 0 && (
                <p className="text-xs text-[#6B7280]">Sin resultados para "{imageQuery}"</p>
              )}
            </div>
            <button type="button" onClick={() => setImagePickerOpen(false)} className="text-xs text-[#6B7280] hover:text-[#112b4a]">Cancelar</button>
          </div>
        )}
      </div>

      {/* QR code */}
      <div className="rounded border border-[#DCE0E2] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-[#4B98CF]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Código QR del producto</p>
          </div>
          {qrRequested && qrImage.url && (
            <div className="flex items-center gap-2">
              <Select value={labelGridKey} onValueChange={(v) => setLabelGridKey(v as typeof labelGridKey)}>
                <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LABEL_GRID_PRESETS.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded border border-[#4B98CF]/30 bg-[#4B98CF]/5 px-3 py-1.5 text-xs font-semibold text-[#4B98CF] hover:bg-[#4B98CF]/10"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir QR
              </button>
            </div>
          )}
        </div>

        {!qrRequested && (
          <button type="button"
            onClick={() => setQrRequested(true)}
            className="flex items-center gap-1.5 rounded border border-[#4B98CF]/30 bg-[#4B98CF]/5 px-3 py-2 text-xs font-semibold text-[#4B98CF] hover:bg-[#4B98CF]/10"
          >
            <QrCode className="h-3.5 w-3.5" /> Generar QR para {resolvedProduct.sku}
          </button>
        )}

        {qrRequested && qrImage.loading && (
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4B98CF] border-t-transparent" />
            Generando código QR...
          </div>
        )}

        {qrRequested && qrImage.error && (
          <p className="text-xs text-red-500">{qrImage.error}</p>
        )}

        {qrRequested && qrImage.url && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[#4B98CF] p-4">
              <img src={qrImage.url} alt={`QR de ${resolvedProduct.sku}`} className="h-40 w-40" />
              <div className="w-full max-w-[220px] space-y-0.5 border-t border-[#ECEEF0] pt-2 text-center">
                <p className="text-sm font-bold text-[#112b4a]">{resolvedProduct.name}</p>
                <p className="font-mono text-xs text-[#6B7280]">SKU {resolvedProduct.sku}</p>
                <p className="text-sm font-bold text-[#4B98CF]">{formatCurrency(resolvedProduct.price)}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#6B7280]">{resolvedProduct.category} · Stock {resolvedProduct.stock}</p>
              </div>
            </div>
            <p className="text-xs text-[#6B7280]">
              El QR identifica el SKU del producto — se puede escanear con la cámara de cualquier celular o, a futuro, con un lector dedicado.
            </p>
          </div>
        )}
      </div>

      {/* Nodo aislado solo visible al imprimir (ver @media print en styles/index.css).
          Repite la etiqueta cols*rows veces segun la grilla elegida arriba. */}
      {qrRequested && qrImage.url && (() => {
        const grid = LABEL_GRID_PRESETS.find((p) => p.key === labelGridKey) ?? LABEL_GRID_PRESETS[0];
        return (
          <div
            id="product-label-print"
            className="hidden"
            style={{ "--print-cols": grid.cols, "--print-rows": grid.rows } as React.CSSProperties}
          >
            {Array.from({ length: grid.cols * grid.rows }).map((_, i) => (
              <div key={i} className="print-label flex-col items-center justify-center gap-2 p-3 text-center">
                <img src={qrImage.url} alt={`QR de ${resolvedProduct.sku}`} className="h-32 w-32" />
                <p className="text-sm font-bold text-black">{resolvedProduct.name}</p>
                <p className="font-mono text-xs text-black">SKU {resolvedProduct.sku}</p>
                <p className="text-base font-bold text-black">{formatCurrency(resolvedProduct.price)}</p>
                <p className="text-[10px] uppercase tracking-wide text-black">{resolvedProduct.category} · Stock {resolvedProduct.stock}</p>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
