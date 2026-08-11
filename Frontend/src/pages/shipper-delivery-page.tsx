import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle, Package, QrCode, Search, Truck, User, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAuthImage } from "@/hooks/use-auth-image";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { cn, onEscapeKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ApiOrder, ApiShipment } from "@/types/api";
import type { Order, Shipment } from "@/types/domain";

export function ShipperDeliveryPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "delivered">("all");
  const [stageShipment, setStageShipment] = useState<Shipment | null>(null);
  const [stageAction, setStageAction] = useState<"pickup" | "delivery" | null>(null);
  const [recipientRut, setRecipientRut] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showQrModal, setShowQrModal] = useState<Shipment | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [prevShipmentIds, setPrevShipmentIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { can, role } = usePermissions();
  const canUpdate = can("shipments.update");
  const isShipper = role === "shipper";
  const { session } = useAuth();

  const { data: shipments, loading: sLoading, refresh: refreshShipments } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });

  useAutoRefresh(() => { if (!sLoading) refreshShipments(); }, 10000);
  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });

  const { operationalShipments, updateShipmentStage } = useOperationalWorkspace({ orders, shipments });

  const qrModalImage = useAuthImage(showQrModal ? `/api/shipments/${showQrModal.id}/qr-image` : null);

  const customerNames = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o) => map.set(String(o.id), o.customer));
    return map;
  }, [orders]);

  const assigneeNames = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o) => {
      if (o.assignedTo) map.set(String(o.id), o.assignedTo);
    });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = operationalShipments;
    if (isShipper) {
      const myUsername = session?.username ?? "";
      list = list.filter((s) => {
        const assigned = assigneeNames.get(s.orderId);
        return assigned === myUsername || !assigned;
      });
    }
    if (filter === "pending") list = list.filter((s) => s.stage !== "entregado" && s.stage !== "cancelado");
    if (filter === "delivered") list = list.filter((s) => s.stage === "entregado");
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) => `${s.tracking} ${s.orderId} ${s.sku} ${customerNames.get(s.orderId) ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [operationalShipments, isShipper, filter, query, customerNames, assigneeNames, session]);

  const counts = useMemo(() => ({
    total: operationalShipments.length,
    active: operationalShipments.filter((s) => s.stage !== "entregado" && s.stage !== "cancelado").length,
    delivered: operationalShipments.filter((s) => s.stage === "entregado").length,
  }), [operationalShipments]);

  useEffect(() => {
    if (!operationalShipments.length) return;
    const currentIds = new Set(operationalShipments.map((s) => s.id));
    const newShipments = operationalShipments.filter((s) => !prevShipmentIds.has(s.id));
    if (prevShipmentIds.size > 0 && newShipments.length > 0) {
      const pendingPickup = newShipments.filter((s) => s.stage === "en_preparacion");
      const inTransit = newShipments.filter((s) => s.stage === "en_reparto");
      if (pendingPickup.length > 0) {
        setToastMessage(`Nuevo pedido para retirar: ${pendingPickup.length} envio(s)`);
      } else if (inTransit.length > 0) {
        setToastMessage(`Envios en reparto actualizados: ${inTransit.length}`);
      } else {
        setToastMessage(`${newShipments.length} envio(s) actualizado(s)`);
      }
      setTimeout(() => setToastMessage(null), 5000);
    }
    setPrevShipmentIds(currentIds);
  }, [operationalShipments.length]);

  async function handlePickup(shipment: Shipment) {
    setStageShipment(shipment);
    setStageAction("pickup");
    setFeedback(null);
  }

  async function handleDelivery(shipment: Shipment) {
    setStageShipment(shipment);
    setStageAction("delivery");
    setRecipientRut("");
    setCustomerCode("");
    setProofImage(null);
    setFeedback(null);
  }

  function handleQrScan(shipment: Shipment) {
    setShowQrModal(shipment);
  }

  async function confirmPickup() {
    if (!stageShipment) return;
    setSubmitting(true);
    try {
      await updateShipmentStage(stageShipment, "en_reparto");
      setFeedback({ type: "success", msg: "Retiro confirmado. Envío en reparto." });
      setTimeout(() => { setStageShipment(null); setStageAction(null); refreshShipments(); }, 1200);
    } catch {
      setFeedback({ type: "error", msg: "Error al confirmar retiro" });
    } finally { setSubmitting(false); }
  }

  async function confirmDelivery() {
    if (!stageShipment) return;
    if (!customerCode.trim()) {
      setFeedback({ type: "error", msg: "Ingresa el código del cliente" });
      return;
    }
    if (!recipientRut.trim()) {
      setFeedback({ type: "error", msg: "Ingresa el RUT de quien recibe" });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await updateShipmentStage(stageShipment, "entregado", undefined, {
        proofOfDeliveryImage: proofImage ?? "",
        recipientRut: formatRut(recipientRut),
        customerCode: customerCode.trim()
      });
      setFeedback({ type: "success", msg: "Entrega registrada con éxito" });
      setTimeout(() => { setStageShipment(null); setStageAction(null); refreshShipments(); }, 1200);
    } catch {
      setFeedback({ type: "error", msg: "Error al registrar la entrega" });
    } finally { setSubmitting(false); }
  }

  const handleImageCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setProofImage(reader.result as string); };
    reader.readAsDataURL(file);
  }, []);

  function formatRut(value: string) {
    const clean = value.replace(/[^0-9kK]/g, "");
    if (clean.length <= 1) return clean;
    const dv = clean.slice(-1);
    const body = clean.slice(0, -1);
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formatted}-${dv}`;
  }

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Envíos</p>
          <h1 className="text-xl font-bold text-[#172554]">
            {isShipper ? `Hola, ${session?.name?.split(" ")[0] ?? "Transportista"}` : "Gestion de envios"}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#64748B]">
          <span>{counts.total} total</span>
          <span className="text-[#2563EB] font-bold">{counts.active} activos</span>
          <span className="text-[#0D9488] font-bold">{counts.delivered} entregados</span>
        </div>
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-[#2563EB] text-white px-4 py-3 text-sm animate-pulse">
          <Truck className="h-4 w-4" />
          <span className="flex-1 font-medium">{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tracking, pedido, producto..." className="h-9 w-full rounded border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#64748B]" />
        </div>
        {!isShipper && (
          <div className="flex gap-1 rounded border border-[#E2E8F0] bg-white p-0.5">
            {(["all", "pending", "delivered"] as const).map((f) => (
              <button type="button" key={f} onClick={() => setFilter(f)} className={cn("rounded px-3 py-1 text-[11px] font-semibold transition-colors", filter === f ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]")}>
                {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : "Entregados"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map((shipment) => {
          const customerName = customerNames.get(shipment.orderId) ?? "Cliente";
          return (
            <Link key={shipment.id} to={`/deliveries/${shipment.id}`} className="block rounded border border-[#E2E8F0] bg-white p-4 hover:border-[#2563EB]/40 transition-colors">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    shipment.stage === "entregado" ? "bg-[#0D9488]/10" :
                    shipment.stage === "cancelado" ? "bg-red-50" :
                    shipment.stage === "en_reparto" ? "bg-purple-50" :
                    "bg-[#2563EB]/10"
                  )}>
                    <Truck className={cn(
                      "h-4 w-4",
                      shipment.stage === "entregado" ? "text-[#0D9488]" :
                      shipment.stage === "cancelado" ? "text-red-500" :
                      shipment.stage === "en_reparto" ? "text-purple-500" :
                      "text-[#2563EB]"
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#2563EB] font-mono">{shipment.tracking}</p>
                    <p className="text-xs text-[#64748B]">{customerName} · SKU {shipment.sku} · {shipment.quantity} unids</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
                  <span className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-bold",
                    shipment.stage === "en_preparacion" ? "bg-[#D97706]/10 text-[#D97706]" :
                    shipment.stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
                    shipment.stage === "entregado" ? "bg-green-50 text-green-600" :
                    shipment.stage === "cancelado" ? "bg-red-50 text-red-500" :
                    "bg-[#2563EB]/10 text-[#2563EB]"
                  )}>
                    {shipment.stage === "en_preparacion" ? "Preparación" :
                     shipment.stage === "en_reparto" ? "En reparto" :
                     shipment.stage === "entregado" ? "Entregado" :
                     shipment.stage === "cancelado" ? "Cancelado" : shipment.stage}
                  </span>

                  {canUpdate && shipment.stage !== "entregado" && shipment.stage !== "cancelado" && (
                    <div className="flex items-center gap-1">
                      {shipment.stage === "en_preparacion" && (
                        <>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleQrScan(shipment); }} className="rounded border border-[#E2E8F0] px-2.5 py-1 text-[10px] font-semibold text-[#2563EB] hover:bg-[#2563EB]/5 flex items-center gap-1">
                            <QrCode className="h-3 w-3" /> QR
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePickup(shipment); }} className="rounded border border-[#E2E8F0] px-2.5 py-1 text-[10px] font-semibold text-[#D97706] hover:bg-amber-50/5">Retirar</button>
                        </>
                      )}
                      {shipment.stage === "en_reparto" && (
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelivery(shipment); }} className="rounded border border-[#E2E8F0] px-2.5 py-1 text-[10px] font-semibold text-[#0D9488] hover:bg-[#0D9488]/5">Entregar</button>
                      )}
                    </div>
                  )}

                  {shipment.stage === "entregado" && shipment.recipientRut && (
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
                      <User className="h-3 w-3" />
                      RUT: {shipment.recipientRut}
                    </div>
                  )}
                </div>
              </div>

              {shipment.proofOfDeliveryImage && (
                <div className="mt-2">
                  <img src={shipment.proofOfDeliveryImage} alt="Prueba de entrega" className="h-16 w-16 rounded object-cover border border-border" />
                </div>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded border border-[#E2E8F0] bg-white py-16">
            <Package className="h-10 w-10 text-[#E2E8F0]" />
            <p className="mt-3 text-sm font-medium text-[#64748B]">Sin envíos pendientes</p>
            <p className="mt-1 text-xs text-[#64748B]/70">Los pedidos confirmados aparecerán aquí.</p>
          </div>
        )}
      </div>

      {showQrModal && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowQrModal(null)}
          onKeyDown={onEscapeKey(() => setShowQrModal(null))}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#172554]">QR de retiro</h3>
              <button type="button" onClick={() => setShowQrModal(null)} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-white border-2 border-dashed border-[#2563EB] rounded-xl p-4 mx-auto w-fit">
              <div className="w-40 h-40 bg-[#F8FAFC] flex items-center justify-center">
                {qrModalImage.loading && (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
                )}
                {qrModalImage.error && (
                  <p className="text-xs text-red-500 px-2 text-center">{qrModalImage.error}</p>
                )}
                {qrModalImage.url && (
                  <img src={qrModalImage.url} alt={`QR de retiro ${showQrModal.tracking}`} className="h-36 w-36" />
                )}
              </div>
            </div>
            <p className="text-xs text-[#64748B]">Escanea este código para confirmar el retiro de la tienda</p>
            <p className="text-xs font-mono text-[#2563EB]">{showQrModal.tracking}</p>
            <Button size="sm" className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white" onClick={() => { setShowQrModal(null); handlePickup(showQrModal); }}>
              Confirmar retiro
            </Button>
          </div>
        </div>
      )}

      {stageShipment && stageAction === "pickup" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#172554]">Confirmar retiro</h2>
              <button type="button" onClick={() => { setStageShipment(null); setStageAction(null); }} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4 text-[#64748B]" />
              </button>
            </div>
            <div className="rounded bg-[#F8FAFC] p-3 mb-4">
              <p className="text-xs font-bold text-[#2563EB]">{stageShipment.tracking}</p>
              <p className="text-xs text-[#64748B]">Pedido #{stageShipment.orderId} · SKU {stageShipment.sku} · {stageShipment.quantity} unids</p>
            </div>
            <p className="text-sm text-[#64748B] mb-4">Confirma que retiraste el pedido de la tienda para iniciar el reparto.</p>
            {feedback && (
              <div className={cn("rounded px-3 py-2 text-xs font-medium mb-3", feedback.type === "error" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>
                {feedback.msg}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setStageShipment(null); setStageAction(null); }}>Volver</Button>
              <Button size="sm" className="flex-1 bg-[#D97706] hover:bg-[#D97706] text-white" onClick={confirmPickup} disabled={submitting}>
                {submitting ? "..." : "Confirmar retiro"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {stageShipment && stageAction === "delivery" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#172554]">Confirmar entrega</h2>
              <button type="button" onClick={() => { setStageShipment(null); setStageAction(null); }} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4 text-[#64748B]" />
              </button>
            </div>

            <div className="rounded bg-[#F8FAFC] p-3 mb-4">
              <p className="text-xs font-bold text-[#2563EB]">{stageShipment.tracking}</p>
              <p className="text-xs text-[#64748B]">Pedido #{stageShipment.orderId} · SKU {stageShipment.sku} · {stageShipment.quantity} unids</p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="shipper-delivery-page-f380" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">Código del cliente</label>
                <input id="shipper-delivery-page-f380"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  placeholder="Ingresa el código proporcionado por el cliente"
                  className="h-9 w-full rounded border border-input bg-white px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="shipper-delivery-page-f390" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">RUT de quien recibe</label>
                <input id="shipper-delivery-page-f390"
                  value={recipientRut}
                  onChange={(e) => setRecipientRut(formatRut(e.target.value))}
                  placeholder="12.345.678-9"
                  className="h-9 w-full rounded border border-input bg-white px-3 text-sm"
                  maxLength={12}
                />
              </div>

              <div>
                <label htmlFor="shipper-delivery-proof-photo" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">Foto de entrega</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded border border-input bg-white text-sm font-medium text-[#64748B] hover:text-[#172554]"
                  >
                    <Camera className="h-4 w-4" />
                    {proofImage ? "Cambiar foto" : "Tomar / Subir foto"}
                  </button>
                  <input
                    id="shipper-delivery-proof-photo"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageCapture}
                    className="hidden"
                  />
                </div>
                {proofImage && (
                  <div className="mt-2 relative">
                    <img src={proofImage} alt="Preview" className="w-full h-32 object-cover rounded border border-border" />
                    <button type="button" onClick={() => setProofImage(null)} className="absolute top-1 right-1 rounded-full bg-black/50 p-1">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                )}
              </div>

              {feedback && (
                <div className={cn("rounded px-3 py-2 text-xs font-medium", feedback.type === "error" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>
                  {feedback.msg}
                </div>
              )}

              <button type="button"
                onClick={confirmDelivery}
                disabled={submitting}
                className="w-full h-10 rounded bg-[#2563EB] text-white text-sm font-bold hover:bg-[#2563EB] disabled:opacity-50"
              >
                {submitting ? "Registrando..." : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
