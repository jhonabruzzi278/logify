import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Box, Check, Clock, Download, History, Package, Trash2, Truck, X, AlertTriangle } from "lucide-react";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useCouriers } from "@/hooks/use-couriers";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { downloadFile } from "@/lib/api-blob";
import { buildOrderTimeline } from "@/lib/operational-insights";
import { getOrderHistory } from "@/lib/order-history";
import { useCustomerScope } from "@/hooks/use-customer-scope";
import { cn, onEscapeKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ApiNotificationRecord, ApiOrder, ApiShipment } from "@/types/api";
import type { Order, Shipment } from "@/types/domain";

const STAGES = ["created", "en_preparacion", "en_reparto", "entregado"];
const STAGE_LABELS = ["Recibido", "Preparación", "En reparto", "Entregado"];

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const customerScope = useCustomerScope();
  const { can } = usePermissions();
  const canDelete = can("orders.delete");

  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });
  const { data: shipment } = useApiQuery<ApiShipment, Shipment | null>({
    path: `/api/shipments/${orderId}`, transform: adaptShipment, enabled: Boolean(orderId)
  });
  const { data: notificationRecords } = useApiQuery<ApiNotificationRecord[], ApiNotificationRecord[]>({
    path: `/api/notifications/order/${orderId}`, transform: (r) => r, enabled: Boolean(orderId)
  });

  const { operationalOrders, operationalShipments, deleteOrder } = useOperationalWorkspace({ orders, shipments: shipment ? [shipment] : [] });
  const order = useMemo(() => operationalOrders.find((item) => item.id === orderId) ?? null, [operationalOrders, orderId]);
  const operationalShipment = useMemo(() => operationalShipments.find((item) => item.orderId === orderId) ?? null, [operationalShipments, orderId]);
  const historyEntries = useMemo(() => getOrderHistory(orderId ?? ""), [orderId]);

  const { couriers } = useCouriers();
  const transporterName = useMemo(() => {
    if (!order?.assignedTo) return null;
    const t = couriers.find((u) => u.username === order.assignedTo);
    return t?.name ?? order.assignedTo;
  }, [order?.assignedTo, couriers]);

  const timeline = useMemo(() => buildOrderTimeline({ order, shipment: operationalShipment, notifications: notificationRecords }), [notificationRecords, operationalShipment, order]);

  async function handleDelete() {
    if (!order) return;
    await deleteOrder(order.id);
    navigate("/orders");
  }

  async function handleDownloadPdf() {
    if (!order) return;
    setPdfLoading(true);
    try {
      await downloadFile(`/api/orders/${order.id}/pdf`, `orden-${order.id}.pdf`);
    } catch {
      alert("No se pudo generar el comprobante del pedido");
    } finally {
      setPdfLoading(false);
    }
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Package className="h-12 w-12 text-[#E2E8F0]" />
        <p className="mt-4 font-medium text-[#64748B]">Pedido no encontrado</p>
        <Link to="/orders" className="mt-2 text-sm text-[#2563EB] hover:underline">Volver a pedidos</Link>
      </div>
    );
  }

  if (customerScope.isCustomer && customerScope.linkedCustomerId && order.customerId !== customerScope.linkedCustomerId) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Package className="h-12 w-12 text-[#E2E8F0]" />
        <p className="mt-4 font-medium text-[#64748B]">Acceso denegado</p>
        <p className="text-xs text-[#64748B]">Este pedido no pertenece a tu cuenta.</p>
        <Link to="/orders" className="mt-2 text-sm text-[#2563EB] hover:underline">Volver a mis pedidos</Link>
      </div>
    );
  }

  const isCancelled = order.stage === "cancelado";
  const stageIdx = STAGES.findIndex((s) => s === order.stage);
  const currentStage = stageIdx >= 0 ? stageIdx : 0;

  const stageColor = (idx: number) =>
    idx < currentStage ? "bg-[#0D9488]" :
    idx === currentStage ? "bg-[#2563EB]" :
    "bg-[#E2E8F0]";

  const badgeClass = () =>
    order.stage === "entregado" ? "bg-green-50 text-green-600" :
    order.stage === "created" ? "bg-[#2563EB]/10 text-[#2563EB]" :
    order.stage === "en_preparacion" ? "bg-[#D97706]/10 text-[#D97706]" :
    order.stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
    order.stage === "cancelado" ? "bg-red-50 text-red-500" :
    "bg-muted text-muted-foreground";

  const badgeLabel = () =>
    order.stage === "created" ? "Pendiente" :
    order.stage === "en_preparacion" ? "Preparación" :
    order.stage === "en_reparto" ? "En reparto" :
    order.stage === "entregado" ? "Entregado" :
    order.stage === "cancelado" ? "Cancelado" : order.stage;

  return (
    <div className="space-y-5 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <Link to="/orders" className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#172554]">
        <ArrowLeft className="h-3.5 w-3.5" /> Pedidos
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Detalle</p>
          <h1 className="text-xl font-bold text-[#172554]">Pedido #{order.id}</h1>
          <p className="text-sm text-[#64748B]">Cliente {order.customer} &middot; {new Date(order.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
          {transporterName && (
            <p className="text-sm text-[#0D9488] flex items-center gap-1 mt-0.5">
              <Truck className="h-3.5 w-3.5" />
              Asignado a: {transporterName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", badgeClass())}>
            {badgeLabel()}
          </span>
          <button type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            title="Descargar comprobante PDF"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border min-h-[36px] px-3 text-xs font-semibold text-[#64748B] hover:text-[#172554] hover:bg-[#F8FAFC] active:scale-[0.98] transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {pdfLoading ? "Generando..." : "Comprobante"}
          </button>
          {isCancelled && canDelete && (
            <button type="button"
              onClick={() => setShowDeleteModal(true)}
              title="Eliminar pedido"
              className="inline-flex items-center justify-center rounded-lg border border-red-200 min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] text-red-500 hover:bg-red-50 active:scale-[0.95] transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Pipeline */}
      {!isCancelled ? (
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Progreso del pedido</p>
          <div className="flex items-center">
            {STAGE_LABELS.map((label, i) => (
              <div key={label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center flex-1">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-white text-xs", stageColor(i))}>
                    {i < currentStage ? <Check className="h-4 w-4" /> : i === currentStage ? <Clock className="h-4 w-4" /> : <span>{i + 1}</span>}
                  </div>
                  <p className={cn("mt-1.5 text-[10px] font-semibold text-center", i <= currentStage ? "text-[#172554]" : "text-[#64748B]")}>{label}</p>
                </div>
                {i < 3 && <div className={cn("h-0.5 flex-1 -mt-5", i < currentStage ? "bg-[#0D9488]" : "bg-[#E2E8F0]")} />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-bold text-red-600">Pedido cancelado</p>
              {order.cancelReason && <p className="text-xs text-red-500 mt-1">Motivo: {order.cancelReason}</p>}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && order && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteModal(false)}
          onKeyDown={onEscapeKey(() => setShowDeleteModal(false))}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-bold text-sm text-[#172554]">Eliminar pedido #{order.id}</h3>
              </div>
              <button type="button" onClick={() => setShowDeleteModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[#64748B]">
              Esta accion es irreversible. Se eliminara permanentemente el pedido de <strong>{order.customer}</strong> ({order.sku} x{order.quantity}).
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(false)}>Volver</Button>
              <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={handleDelete}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Producto</p>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#F8FAFC]">
              <Box className="h-7 w-7 text-[#64748B]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#172554]">{order.sku}</p>
              <p className="text-xs text-[#64748B]">SKU &middot; {order.quantity} unidad(es)</p>
            </div>
          </div>
        </div>

        {operationalShipment && (
          <div className="rounded border border-[#E2E8F0] bg-white p-5">
            <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Envío</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Tracking</span>
                <span className="text-xs font-mono font-bold text-[#2563EB]">{operationalShipment.tracking}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Estado</span>
                <span className={cn("text-xs font-bold", badgeClass())}>{badgeLabel()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded border border-[#E2E8F0] bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-[#64748B]" />
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Línea de tiempo</p>
        </div>
        <div className="space-y-0">
          {timeline.map((event) => (
            <div key={event.id} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0 mt-1",
                  event.state === "done" ? "bg-[#0D9488]" :
                  event.state === "warning" ? "bg-[#D97706]" :
                  event.state === "critical" ? "bg-red-500" : "bg-[#2563EB]"
                )} />
                <div className="w-px flex-1 bg-[#E2E8F0] mt-1" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#172554]">{event.title}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{event.detail}</p>
                <p className="text-[10px] text-[#64748B]/60 mt-0.5">
                  {new Date(event.timestamp).toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          {timeline.length === 0 && (
            <p className="text-xs text-[#64748B] text-center py-4">Sin eventos registrados</p>
          )}
        </div>
      </div>

      {/* History */}
      {(() => {
        const notificationHistory = (notificationRecords ?? []).map((r) => {
          const record = r as unknown as Record<string, unknown>;
          return {
            id: `notif-${record.id ?? 0}`,
            actor: (record.source_service ?? record.sourceService ?? "Sistema") as string,
            action: (record.stage ?? "") as string,
            detail: (record.message ?? "") as string,
            timestamp: (record.occurred_at ?? record.occurredAt ?? new Date().toISOString()) as string,
            source: "notification" as const,
          };
        });
        const combined = [...(notificationHistory as Array<{
          id: string; actor: string; action: string; detail: string; timestamp: string; source: "notification" | "local";
        }>), ...historyEntries.map((e) => ({
          id: e.id, actor: `${e.actor} (${e.actorRole})`, action: e.action, detail: e.detail ?? "",
          timestamp: e.timestamp, source: "local" as const,
        }))];
        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (combined.length === 0) return null;
        return (
          <div className="rounded border border-[#E2E8F0] bg-white p-5">
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Historial de acciones</p>
            <div className="space-y-2">
              {combined.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded bg-[#F8FAFC] px-4 py-2.5">
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0 mt-1.5",
                    entry.action === "created" && "bg-[#2563EB]",
                    entry.action.includes("CREATED") && "bg-[#2563EB]",
                    entry.action === "confirmed" && "bg-[#0D9488]",
                    entry.action.includes("CONFIRM") && "bg-[#0D9488]",
                    entry.action === "cancelled" && "bg-red-500",
                    entry.action.includes("CANCEL") && "bg-red-500",
                    entry.action.includes("ENTREGADO") && "bg-green-500",
                    entry.action.includes("DELIVERED") && "bg-green-500",
                    entry.action.includes("REPARTO") && "bg-purple-500",
                    entry.action.includes("TRANSIT") && "bg-purple-500",
                    entry.source === "notification" && !entry.action.includes("ENTREGADO") &&
                      !entry.action.includes("DELIVERED") && !entry.action.includes("REPARTO") &&
                      !entry.action.includes("TRANSIT") && !entry.action.includes("CANCEL") &&
                      !entry.action.includes("CREATED") && !entry.action.includes("CONFIRM") &&
                      "bg-[#D97706]",
                  )} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#172554]">{entry.actor} - {entry.action}</p>
                    {entry.detail && <p className="text-[11px] text-[#64748B]">{entry.detail}</p>}
                    <p className="text-[10px] text-[#64748B]/60">{new Date(entry.timestamp).toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
