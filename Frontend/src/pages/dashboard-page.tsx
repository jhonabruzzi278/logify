import { useMemo, useEffect, useRef, useState } from "react";
import { ArrowRight, Banknote, Bell, CreditCard, ShoppingBag, ShoppingCart, TrendingUp, Truck, Users, Boxes, AlertTriangle, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { getRoleProfile } from "@/app/access";
import { useApiQuery } from "@/hooks/use-api-query";
import { type BusinessMode, useBusinessMode, CUSTOMER_TYPE_BY_MODE } from "@/hooks/use-business-mode";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { useStaggerReveal } from "@/hooks/use-stagger-reveal";
import { useCountUp } from "@/hooks/use-count-up";
import { useToast } from "@/components/common/toast-provider";
import { adaptCustomer, adaptInventory, adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { buildOperationalAlerts } from "@/lib/operational-insights";
import { CardSkeleton, ListSkeleton, Skeleton } from "@/components/common/skeleton";
import { ApiErrorBanner } from "@/components/common/api-error-banner";
import { cn, formatCurrency, onActivateKey } from "@/lib/utils";
import type { ApiCustomer, ApiInventory, ApiNotificationRecord, ApiOrder, ApiShipment } from "@/types/api";
import type { AlertItem, Customer, Order, Product, Sale, Shipment } from "@/types/domain";

const quickActions: { label: string; href: string; icon: LucideIcon; color: string; modes: BusinessMode[] }[] = [
  { label: "Nuevo pedido", href: "/orders", icon: ShoppingBag, color: "bg-[#2563EB]", modes: ["b2b"] },
  { label: "Vender", href: "/pos", icon: ShoppingCart, color: "bg-[#2563EB]", modes: ["b2c"] },
  { label: "Ver inventario", href: "/inventory", icon: Boxes, color: "bg-[#0D9488]", modes: ["b2b", "b2c"] },
  { label: "Gestionar envios", href: "/shipments", icon: Truck, color: "bg-[#D97706]", modes: ["b2b"] },
  { label: "Clientes", href: "/customers", icon: Users, color: "bg-[#8B5CF6]", modes: ["b2c"] },
  { label: "Notificaciones", href: "/notifications", icon: Bell, color: "bg-purple-500", modes: ["b2b", "b2c"] },
];

export function DashboardPage() {
  const { canInstall, promptInstall } = usePwaInstall();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { mode } = useBusinessMode();
  const profile = session ? getRoleProfile(session.role) : null;

  const { data: orders, loading: oLoad, error: oErr, refresh: oRef } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });
  const { data: inventory, loading: iLoad, error: iErr, refresh: iRef } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory", transform: (r) => r.map(adaptInventory)
  });
  const { data: shipments, loading: sLoad, error: sErr, refresh: sRef } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });
  const { data: customers } = useApiQuery<ApiCustomer[], Customer[]>({
    path: "/api/customers", transform: (r) => r.map(adaptCustomer)
  });

  const loading = oLoad || iLoad || sLoad;
  const firstError = oErr || iErr || sErr;

  const workspaceInput = useMemo(() => ({
    orders: orders ?? [],
    inventory: inventory ?? [],
    shipments: shipments ?? []
  }), [orders, inventory, shipments]);

  const { operationalOrders, operationalInventory, operationalShipments, getAllSales } = useOperationalWorkspace(workspaceInput);

  const alerts = useMemo<AlertItem[]>(() => {
    return buildOperationalAlerts({ orders: operationalOrders, inventory: operationalInventory, shipments: operationalShipments, notifications: [] });
  }, [operationalInventory, operationalOrders, operationalShipments]);

  const [allSales, setAllSales] = useState<Sale[]>([]);
  const getAllSalesRef = useRef(getAllSales);
  getAllSalesRef.current = getAllSales;

  useEffect(() => {
    getAllSalesRef.current().then(setAllSales).catch(() => setAllSales([]));
  }, []);

  const todaySales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const s = (allSales ?? []).filter((x) => new Date(x.createdAt) >= today);
    const profit = s.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + (item.unitCost != null ? (item.unitPrice - item.unitCost) * item.quantity : 0), 0), 0);
    const total = s.reduce((sum, x) => sum + x.total, 0);
    return { count: s.length, total, profit, avgTicket: s.length > 0 ? total / s.length : 0 };
  }, [allSales]);

  const recentSales = useMemo(() => {
    return [...(allSales ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  }, [allSales]);

  const receivables = useMemo(() => {
    const segmentType = CUSTOMER_TYPE_BY_MODE[mode];
    return (customers ?? [])
      .filter((c) => c.customerType === segmentType)
      .reduce((sum, c) => sum + (c.creditBalance ?? 0), 0);
  }, [customers, mode]);

  /** Ganancia/ingresos de pedidos B2B por precio de catálogo (los pedidos no guardan precio propio). */
  const orderEconomics = useMemo(() => {
    if (mode !== "b2b") return { revenueDelivered: 0, profitDelivered: 0, pipelineValue: 0, pipelineCount: 0 };
    const priceMap = new Map((inventory ?? []).map((p) => [p.sku, p]));
    let revenueDelivered = 0, profitDelivered = 0, pipelineValue = 0, pipelineCount = 0;
    operationalOrders.forEach((o) => {
      const product = priceMap.get(o.sku);
      const value = (product?.price ?? 0) * o.quantity;
      if (o.stage === "entregado") {
        revenueDelivered += value;
        profitDelivered += ((product?.price ?? 0) - (product?.cost ?? 0)) * o.quantity;
      } else if (o.stage !== "cancelado") {
        pipelineValue += value;
        pipelineCount += 1;
      }
    });
    return { revenueDelivered, profitDelivered, pipelineValue, pipelineCount };
  }, [mode, operationalOrders, inventory]);

  const visibleQuickActions = useMemo(() => quickActions.filter((a) => a.modes.includes(mode)), [mode]);

  const metricsRef = useStaggerReveal<HTMLDivElement>(!loading);
  const panelsRef = useStaggerReveal<HTMLDivElement>(!loading);

  useEffect(() => {
    const critical = alerts.filter((a) => a.severity === "critical");
    if (critical.length > 0 && !loading) {
      addToast({ type: "error", message: `${critical.length} alerta(s) critica(s): ${critical[0].title}`, action: { label: "Ver", href: "/alerts" } });
    }
  }, [alerts.length]);

  if (!session) return null;

  if (loading && !orders && !inventory && !shipments) {
    return (
      <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-32 mb-4" />
            <ListSkeleton count={3} />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-20 mb-4" />
            <ListSkeleton count={3} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-3 w-28 mb-3" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full max-w-sm w-full mx-auto flex-col gap-4 sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      {firstError && <ApiErrorBanner error={firstError} onRetry={() => { oRef(); iRef(); sRef(); }} />}

      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-muted-foreground">Dashboard</p>
          <h1 className="text-xl font-bold text-foreground">
            {session ? `Hola, ${session.name.split(" ")[0]}` : "Centro operativo"}
          </h1>
        </div>
        {canInstall && (
          <button type="button" onClick={promptInstall} className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8]">
            Instalar app
          </button>
        )}
      </div>

      {/* Metric cards — solo valor economico, segmentado por modo B2B/B2C */}
      <div ref={metricsRef} className="shrink-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mode === "b2b" ? (
          <>
            <MetricCard label="Ingresos por pedidos" value={orderEconomics.revenueDelivered} sub="Pedidos entregados" icon={Banknote} color="bg-[#2563EB]/10" iconColor="text-[#2563EB]" />
            <MetricCard label="Ganancia estimada" value={orderEconomics.profitDelivered} sub="Margen sobre entregados" icon={TrendingUp} color="bg-[#0D9488]/10" iconColor="text-[#0D9488]" />
            <MetricCard label="Valor en pipeline" value={orderEconomics.pipelineValue} sub={`${orderEconomics.pipelineCount} pedidos en curso`} icon={ShoppingBag} color="bg-[#D97706]/10" iconColor="text-[#D97706]" />
            <MetricCard label="Cuentas por cobrar" value={receivables} sub="Fiado a clientes empresa" icon={CreditCard} color="bg-purple-50" iconColor="text-purple-500" />
          </>
        ) : (
          <>
            <MetricCard label="Ventas hoy" value={todaySales.total} sub={`${todaySales.count} transacciones`} icon={Banknote} color="bg-[#2563EB]/10" iconColor="text-[#2563EB]" />
            <MetricCard label="Ganancia estimada hoy" value={todaySales.profit} sub="Margen sobre ventas" icon={TrendingUp} color="bg-[#0D9488]/10" iconColor="text-[#0D9488]" />
            <MetricCard label="Ticket promedio" value={todaySales.avgTicket} sub="por venta hoy" icon={ShoppingBag} color="bg-[#D97706]/10" iconColor="text-[#D97706]" />
            <MetricCard label="Cuentas por cobrar" value={receivables} sub="Fiado a clientes" icon={CreditCard} color="bg-purple-50" iconColor="text-purple-500" />
          </>
        )}
      </div>

      <div ref={panelsRef} className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {mode === "b2b" ? (
          /* Recent orders */
          <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
            <div className="shrink-0 flex items-center justify-between mb-4">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-muted-foreground">Pedidos recientes</p>
              <Link to="/orders" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Todos <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {operationalOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center justify-between rounded bg-[#F8FAFC] px-3 py-2 cursor-pointer hover:bg-muted"
                  onClick={() => navigate(`/orders/${order.id}`)}
                  onKeyDown={onActivateKey(() => navigate(`/orders/${order.id}`))}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">#{order.id} {order.customer}</p>
                    <p className="text-xs text-muted-foreground">{order.sku} x{order.quantity}</p>
                  </div>
                  <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold shrink-0",
                    order.stage === "entregado" ? "bg-green-50 text-green-600" :
                    order.stage === "cancelado" ? "bg-red-50 text-red-500" :
                    order.stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
                    order.stage === "en_preparacion" ? "bg-[#D97706]/10 text-[#D97706]" :
                    "bg-[#2563EB]/10 text-[#2563EB]"
                  )}>
                    {order.stage === "created" ? "Pendiente" : order.stage === "en_preparacion" ? "Preparacion" : order.stage === "en_reparto" ? "En reparto" : order.stage === "entregado" ? "Entregado" : order.stage === "cancelado" ? "Cancelado" : order.stage}
                  </span>
                </div>
              ))}
              {operationalOrders.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin pedidos registrados</p>}
            </div>
          </div>
        ) : (
          /* Recent sales */
          <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
            <div className="shrink-0 flex items-center justify-between mb-4">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-muted-foreground">Ventas recientes</p>
              <Link to="/reports" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Todas <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between rounded bg-[#F8FAFC] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{sale.customerName ?? "Consumidor final"}</p>
                    <p className="text-xs text-muted-foreground truncate">{sale.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[#2563EB]">{formatCurrency(sale.total)}</span>
                </div>
              ))}
              {recentSales.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin ventas registradas</p>}
            </div>
          </div>
        )}

        {/* Critical alerts */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
          <div className="shrink-0 flex items-center justify-between mb-4">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-muted-foreground">Alertas</p>
            <Link to="/alerts" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Todas <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {alerts.slice(0, 5).map((alert) => (
              <Link key={alert.id} to={alert.actionLabel === "Ver pedido" ? `/orders/${alert.id.replace("order-", "")}` : alert.actionLabel === "Revisar inventario" ? "/inventory" : "/alerts"} className="flex items-start gap-2 rounded bg-[#F8FAFC] px-3 py-2 hover:bg-muted">
                <AlertTriangle className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", alert.severity === "critical" ? "text-red-500" : alert.severity === "high" ? "text-[#D97706]" : "text-[#2563EB]")} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground">{alert.description}</p>
                </div>
              </Link>
            ))}
            {alerts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin alertas activas</p>}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="shrink-0 rounded-xl border border-border bg-card p-5">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-3">Acciones rapidas</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {visibleQuickActions.map((action) => (
            <Link key={action.label} to={action.href} className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-transparent hover:bg-muted hover:shadow-md">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110", action.color)}>
                <action.icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs font-medium text-foreground">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color, iconColor }: {
  label: string;
  value: number;
  sub: string;
  icon: typeof ShoppingBag;
  color: string;
  iconColor: string;
}) {
  const animatedValue = useCountUp(value);
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", color)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(animatedValue)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
