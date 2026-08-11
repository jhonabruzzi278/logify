import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Cloud, CloudRain, Clock, Navigation, Package, Truck, User, QrCode } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAuthImage } from "@/hooks/use-auth-image";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ApiOrder, ApiShipment } from "@/types/api";
import type { Order, Shipment } from "@/types/domain";

interface WeatherResult {
  weather: { temperature: number; humidity?: number; precipitation: number; windSpeed: number; condition: string };
  deliveryRisk: "ALTO" | "BAJO";
  recommendation: string;
}

interface RouteResult {
  distanceKm: number;
  durationMin: number;
}

const STEP_LABELS = ["Preparación", "En reparto", "Entregado"];

function getStepIndex(stage: string) {
  const s = stage.toLowerCase();
  if (s === "entregado" || s === "ENTREGADO") return 2;
  if (s === "en_reparto" || s === "EN_REPARTO") return 1;
  if (s === "cancelado" || s === "CANCELADO") return -1;
  return 0;
}

export function ShipmentDetailPage() {
  const { shipmentId } = useParams();
  const id = Number(shipmentId);
  const { role } = usePermissions();
  const [conditions, setConditions] = useState<{ weather: WeatherResult; route: RouteResult | null } | null>(null);
  const [conditionsLoading, setConditionsLoading] = useState(false);
  const [conditionsError, setConditionsError] = useState<string | null>(null);

  const { data: shipments, loading } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });
  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });

  const { operationalShipments } = useOperationalWorkspace({ orders, shipments });

  const shipment = useMemo(() => operationalShipments.find((s) => Number(s.id) === id) ?? null, [operationalShipments, id]);

  const customerNames = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o) => map.set(String(o.id), o.customer));
    return map;
  }, [orders]);

  const clientCodes = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o) => { if (o.clientCode) map.set(String(o.id), o.clientCode); });
    return map;
  }, [orders]);

  const customerName = shipment ? (customerNames.get(shipment.orderId) ?? "Cliente") : "";
  const orderClientCode = shipment ? (clientCodes.get(shipment.orderId) ?? null) : null;
  const step = shipment ? getStepIndex(shipment.stage) : 0;
  const isCancelled = shipment?.stage === "cancelado";
  const qrImage = useAuthImage(shipment && shipment.stage === "en_preparacion" ? `/api/shipments/${shipment.id}/qr-image` : null);

  async function handleCheckConditions() {
    if (!shipment) return;
    setConditionsLoading(true);
    setConditionsError(null);
    try {
      const [weather, route] = await Promise.all([
        apiFetch<WeatherResult>(`/api/shipments/${shipment.id}/weather`),
        apiFetch<RouteResult>(`/api/shipments/${shipment.id}/route`).catch(() => null)
      ]);
      setConditions({ weather, route });
    } catch (err) {
      setConditionsError(err instanceof ApiRequestError ? err.message : "No se pudo consultar el clima");
    } finally {
      setConditionsLoading(false);
    }
  }

  if (!shipment) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Package className="h-12 w-12 text-[#E2E8F0]" />
        <p className="mt-4 font-medium text-[#64748B]">Envío no encontrado</p>
        <Link to="/deliveries" className="mt-2 text-sm text-[#2563EB] hover:underline">Volver a envíos</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <Link to="/deliveries" className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#172554]">
        <ArrowLeft className="h-3.5 w-3.5" /> Envíos
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Detalle de envío</p>
          <h1 className="text-xl font-bold text-[#172554] font-mono">{shipment.tracking}</h1>
          <p className="text-sm text-[#64748B]">Pedido #{shipment.orderId} · {customerName}</p>
        </div>
        <span className={cn(
          "self-start rounded-full px-3 py-1 text-xs font-bold",
          shipment.stage === "entregado" ? "bg-green-50 text-green-600" :
          shipment.stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
          shipment.stage === "cancelado" ? "bg-red-50 text-red-500" :
          "bg-[#D97706]/10 text-[#D97706]"
        )}>
          {shipment.stage === "en_preparacion" ? "Preparación" :
           shipment.stage === "en_reparto" ? "En reparto" :
           shipment.stage === "entregado" ? "Entregado" :
           shipment.stage === "cancelado" ? "Cancelado" : shipment.stage}
        </span>
      </div>

      {/* Progress steps */}
      {!isCancelled && (
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Progreso</p>
          <div className="flex items-center">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center flex-1">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-white text-xs",
                    i < step ? "bg-[#0D9488]" : i === step ? "bg-[#2563EB]" : "bg-[#E2E8F0]"
                  )}>
                    {i < step ? <Check className="h-4 w-4" /> : i === step ? <Clock className="h-4 w-4" /> : <span>{i + 1}</span>}
                  </div>
                  <p className={cn("mt-1.5 text-[10px] font-semibold text-center", i <= step ? "text-[#172554]" : "text-[#64748B]")}>{label}</p>
                </div>
                {i < 2 && <div className={cn("h-0.5 flex-1 -mt-5", i < step ? "bg-[#0D9488]" : "bg-[#E2E8F0]")} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="rounded border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-600">Envío cancelado</p>
          <p className="text-xs text-red-500 mt-1">Este envío fue cancelado y no tiene progreso activo.</p>
        </div>
      )}

      {/* QR code for pickup - show when EN_PREPARACION */}
      {shipment.stage === "en_preparacion" && (
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="h-4 w-4 text-[#2563EB]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">QR de retiro</p>
          </div>
          <div className="bg-white border-2 border-dashed border-[#2563EB] rounded-xl p-4 mx-auto w-fit">
            <div className="w-40 h-40 bg-[#F8FAFC] flex items-center justify-center">
              {qrImage.loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />}
              {qrImage.error && <p className="text-[10px] text-red-500 text-center px-2">{qrImage.error}</p>}
              {qrImage.url && <img src={qrImage.url} alt={`QR de ${shipment.tracking}`} className="h-40 w-40" />}
            </div>
          </div>
          <p className="text-xs text-[#64748B] text-center mt-3">Escanea para confirmar retiro de la tienda</p>
        </div>
      )}

      {/* Weather + route conditions */}
      <div className="rounded border border-[#E2E8F0] bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-[#2563EB]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Condiciones de entrega</p>
          </div>
          <button type="button"
            onClick={handleCheckConditions}
            disabled={conditionsLoading}
            className="flex items-center gap-1.5 rounded border border-[#2563EB]/30 bg-[#2563EB]/5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10 disabled:opacity-50"
          >
            {conditionsLoading ? "Consultando..." : "Consultar clima y ruta"}
          </button>
        </div>

        {conditionsError && <p className="text-xs text-red-500">{conditionsError}</p>}

        {conditions && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={cn(
              "rounded px-4 py-3 flex items-center gap-3",
              conditions.weather.deliveryRisk === "ALTO" ? "bg-red-50" : "bg-[#F8FAFC]"
            )}>
              {conditions.weather.deliveryRisk === "ALTO"
                ? <CloudRain className="h-5 w-5 text-red-500 shrink-0" />
                : <Cloud className="h-5 w-5 text-[#0D9488] shrink-0" />}
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Clima</p>
                <p className="text-sm font-semibold text-[#172554]">{conditions.weather.weather.condition} · {conditions.weather.weather.temperature}°C</p>
              </div>
            </div>
            <div className="rounded bg-[#F8FAFC] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Riesgo de entrega</p>
              <span className={cn(
                "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold",
                conditions.weather.deliveryRisk === "ALTO" ? "bg-red-100 text-red-600" : "bg-[#0D9488]/10 text-[#0D9488]"
              )}>
                {conditions.weather.deliveryRisk}
              </span>
            </div>
            {conditions.route && (
              <div className="rounded bg-[#F8FAFC] px-4 py-3 flex items-center gap-3">
                <Navigation className="h-5 w-5 text-[#2563EB] shrink-0" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Ruta a destino</p>
                  <p className="text-sm font-semibold text-[#172554]">{conditions.route.distanceKm} km · {conditions.route.durationMin} min</p>
                </div>
              </div>
            )}
          </div>
        )}

        {conditions && (
          <p className="mt-3 text-xs text-[#64748B]">{conditions.weather.recommendation}</p>
        )}

        {!conditions && !conditionsError && (
          <p className="text-xs text-[#64748B]">Consulta el clima en destino y la distancia estimada de entrega en tiempo real.</p>
        )}
      </div>

      {/* Código del cliente — never shown to shipper (also stripped server-side) */}
      {role !== "shipper" && orderClientCode && (
        <div className="rounded border border-[#2563EB]/40 bg-[#2563EB]/5 p-5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#2563EB] mb-2">Código del cliente</p>
          <p className="text-xs text-[#64748B] mb-3">Entrega este código al cliente para que pueda rastrear su pedido en <span className="font-mono text-[#2563EB]">/tracking</span></p>
          <div className="flex items-center justify-between rounded-lg bg-white border border-[#2563EB]/30 px-4 py-3">
            <span className="text-2xl font-bold font-mono tracking-widest text-[#172554]">{orderClientCode}</span>
            <button type="button"
              onClick={() => navigator.clipboard.writeText(orderClientCode)}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] border border-[#2563EB]/30 rounded px-3 py-1.5 hover:bg-[#2563EB]/5 transition-colors"
            >
              Copiar
            </button>
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Información</p>
          <div className="space-y-3">
            {[
              { label: "Pedido", value: `#${shipment.orderId}` },
              { label: "SKU", value: shipment.sku },
              { label: "Cantidad", value: `${shipment.quantity} unidad(es)` },
              { label: "Creado", value: new Date(shipment.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between rounded bg-[#F8FAFC] px-4 py-2.5">
                <span className="text-xs text-[#64748B]">{label}</span>
                <span className="text-sm font-semibold text-[#172554]">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Despacho</p>
          <div className="space-y-3">
            {[
              { label: "Tracking", value: shipment.tracking, color: "text-[#2563EB] font-mono" },
              { label: "Transportista", value: shipment.carrier },
              { label: "Salida", value: shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Pendiente" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between rounded bg-[#F8FAFC] px-4 py-2.5">
                <span className="text-xs text-[#64748B]">{label}</span>
                <span className={cn("text-sm font-semibold text-[#172554]", color)}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proof of delivery */}
      {shipment.stage === "entregado" && (
        <div className="rounded border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="h-4 w-4 text-[#0D9488]" />
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Prueba de entrega</p>
          </div>

          {shipment.proofOfDeliveryImage && (
            <div className="mb-4">
              <img src={shipment.proofOfDeliveryImage} alt="Prueba de entrega" className="w-full max-h-64 object-contain rounded border border-border bg-[#F8FAFC]" />
            </div>
          )}

          {shipment.recipientRut && (
            <div className="flex items-center gap-3 rounded bg-[#F8FAFC] px-4 py-3 mb-2">
              <User className="h-4 w-4 text-[#64748B]" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">RUT de quien recibio</p>
                <p className="text-sm font-semibold text-[#172554]">{shipment.recipientRut}</p>
              </div>
            </div>
          )}

          {shipment.customerCode && (
            <div className="flex items-center gap-3 rounded bg-[#F8FAFC] px-4 py-3">
              <User className="h-4 w-4 text-[#64748B]" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Código del cliente</p>
                <p className="text-sm font-semibold text-[#172554]">{shipment.customerCode}</p>
              </div>
            </div>
          )}

          {!shipment.proofOfDeliveryImage && !shipment.recipientRut && (
            <p className="text-xs text-[#64748B] text-center py-4">Sin prueba de entrega registrada</p>
          )}
        </div>
      )}
    </div>
  );
}
