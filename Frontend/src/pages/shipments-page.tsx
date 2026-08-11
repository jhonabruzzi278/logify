import { useMemo, useState } from "react";
import { Check, Clock, Download, Package, Search, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { exportShipmentsCSV } from "@/lib/export-csv";
import { useCustomerScope } from "@/hooks/use-customer-scope";
import { cn } from "@/lib/utils";
import type { ApiOrder, ApiShipment } from "@/types/api";
import type { Order, Shipment } from "@/types/domain";

const STEP_LABELS = ["Preparación", "En reparto", "Entregado"];

export function ShipmentsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "cancelado" | "entregado">("all");
  const { can, role } = usePermissions();
  const { session } = useAuth();
  const canUpdate = can("shipments.update");
  const customerScope = useCustomerScope();

  const { data: shipments, loading: sLoading, refresh: refreshShipments } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });

  useAutoRefresh(() => { if (!sLoading) refreshShipments(); }, 10000);
  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });

  const { operationalShipments } = useOperationalWorkspace({ orders, shipments });

  // Customer: no linkedCustomerId means unmatched → show empty (not all)
  const customerOrderIds = useMemo(() => {
    if (!customerScope.isCustomer) return null;
    if (!customerScope.linkedCustomerId) return new Set<string>();
    return new Set(
      (orders ?? []).filter((o) => o.customerId === customerScope.linkedCustomerId).map((o) => o.id)
    );
  }, [customerScope.isCustomer, customerScope.linkedCustomerId, orders]);

  // Shipper: orders assigned to this user OR not yet assigned to anyone
  const shipperOrderIds = useMemo(() => {
    if (role !== "shipper" || !session?.username) return null;
    const me = session.username;
    return new Set(
      (orders ?? []).filter((o) => o.assignedTo === me || !o.assignedTo).map((o) => o.id)
    );
  }, [role, session?.username, orders]);

  const visibleOrderIds = customerOrderIds ?? shipperOrderIds;

  const filtered = useMemo(() => {
    let list = operationalShipments;
    if (visibleOrderIds !== null) {
      list = list.filter((s) => visibleOrderIds.has(s.orderId));
    }
    if (filter === "active") list = list.filter((s) => s.stage !== "entregado" && s.stage !== "cancelado");
    if (filter === "cancelado") list = list.filter((s) => s.stage === "cancelado");
    if (filter === "entregado") list = list.filter((s) => s.stage === "entregado");
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) => `${s.tracking} ${s.orderId} ${s.carrier}`.toLowerCase().includes(q));
    }
    return list;
  }, [operationalShipments, visibleOrderIds, filter, query]);

  const counts = useMemo(() => {
    const base = visibleOrderIds !== null
      ? operationalShipments.filter((s) => visibleOrderIds.has(s.orderId))
      : operationalShipments;
    return {
      total: base.length,
      active: base.filter((s) => s.stage !== "entregado" && s.stage !== "cancelado").length,
      cancelado: base.filter((s) => s.stage === "cancelado").length,
      entregado: base.filter((s) => s.stage === "entregado").length,
    };
  }, [operationalShipments, visibleOrderIds]);

  function getStepIndex(stage: string) {
    const s = stage.toLowerCase();
    if (s === "entregado" || s === "ENTREGADO") return 2;
    if (s === "en_reparto" || s === "EN_REPARTO") return 1;
    return 0;
  }

  const stageColor = (stage: string) =>
    stage === "entregado" ? "bg-[#0D9488]/10 text-[#0D9488]" :
    stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
    stage === "en_preparacion" ? "bg-[#D97706]/10 text-[#D97706]" :
    stage === "cancelado" ? "bg-red-50 text-red-500" :
    "bg-[#2563EB]/10 text-[#2563EB]";

  const stageLabel = (stage: string) =>
    stage === "en_preparacion" ? "Preparación" :
    stage === "en_reparto" ? "En reparto" :
    stage === "entregado" ? "Entregado" :
    stage === "cancelado" ? "Cancelado" : stage;

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Envíos</p>
          <h1 className="text-xl font-bold text-[#172554]">
            {role === "shipper" ? "Mis entregas" :
             customerScope.isCustomer ? "Mis envios" :
             "Seguimiento de despachos"}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#64748B]">
          <span>{counts.total} total</span>
          <span className="text-[#2563EB] font-bold">{counts.active} activos</span>
          {!customerScope.isCustomer && (
            <>
              <span className="text-red-500 font-bold">{counts.cancelado} cancelados</span>
              <button type="button" onClick={() => exportShipmentsCSV(operationalShipments.map(s => ({ id: s.id, tracking: s.tracking, orderId: s.orderId, sku: s.sku, stage: String(s.stage), carrier: s.carrier, createdAt: s.createdAt })))} className="flex items-center gap-1 rounded border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#172554]">
                <Download className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tracking, pedido, transportista..." className="h-9 w-full rounded border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#64748B]" />
        </div>
        <div className="flex gap-1 rounded border border-[#E2E8F0] bg-white p-0.5">
          {(["all", "active", "cancelado", "entregado"] as const).map((f) => (
            <button type="button" key={f} onClick={() => setFilter(f)} className={cn("rounded px-3 py-1 text-[11px] font-semibold transition-colors", filter === f ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]")}>
              {f === "all" ? "Todos" : f === "active" ? "Activos" : f === "cancelado" ? "Cancelados" : "Entregados"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((shipment) => {
          const step = getStepIndex(shipment.stage);
          const isCancelled = shipment.stage === "cancelado";
          return (
            <Link key={shipment.id} to={`/shipments/${shipment.id}`} className="block rounded border border-[#E2E8F0] bg-white p-4 hover:border-[#2563EB]/40 transition-colors">
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
                    <p className="text-xs text-[#64748B]">Pedido #{shipment.orderId} · SKU {shipment.sku}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto">
                  {/* Timeline steps */}
                  {!isCancelled && (
                    <div className="hidden sm:flex items-center gap-1">
                      {STEP_LABELS.map((label, i) => (
                        <div key={label} className="flex items-center gap-1">
                          <div className={cn(
                            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                            i < step ? "bg-[#0D9488] text-white" :
                            i === step ? "bg-[#2563EB] text-white" :
                            "bg-[#F8FAFC] text-[#64748B]"
                          )}>
                            {i < step ? <Check className="h-3 w-3" /> : i === step ? <Clock className="h-3 w-3" /> : <span>{i + 1}</span>}
                            {label}
                          </div>
                          {i < 2 && <div className={cn("h-0.5 w-4", i < step ? "bg-[#0D9488]" : "bg-[#E2E8F0]")} />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mobile status badge */}
                  <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold sm:hidden", stageColor(shipment.stage))}>
                    {stageLabel(shipment.stage)}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded border border-[#E2E8F0] bg-white py-16">
            <Package className="h-10 w-10 text-[#E2E8F0]" />
            <p className="mt-3 text-sm font-medium text-[#64748B]">Sin envíos</p>
            <p className="mt-1 text-xs text-[#64748B]/70">Crea pedidos y confirma para generar envíos automáticamente.</p>
          </div>
        )}
      </div>
    </div>
  );
}
