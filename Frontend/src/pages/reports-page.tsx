import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Boxes, CalendarDays, Clock, Download, Package, PiggyBank, Search, ShoppingBag, ShoppingCart, Table2, Truck } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { adaptCashSession, adaptInventory, adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { cn, formatCurrency } from "@/lib/utils";
import { exportInventoryCSV, exportOrdersCSV, exportSalesCSV, exportShipmentsCSV } from "@/lib/export-csv";
import type { ApiCashSession, ApiInventory, ApiOrder, ApiShipment } from "@/types/api";
import type { CashSession, Order, Product, Sale, Shipment } from "@/types/domain";

type Period = "7d" | "30d" | "90d" | "all";
type ViewMode = "charts" | "table";
type ActiveTab = "orders" | "shipments" | "stock" | "sales" | "cash";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "all", label: "Todo" },
];

const TABS: { value: ActiveTab; label: string; icon: typeof BarChart3 }[] = [
  { value: "orders", label: "Pedidos", icon: ShoppingBag },
  { value: "shipments", label: "Envíos", icon: Truck },
  { value: "stock", label: "Stock", icon: Boxes },
  { value: "sales", label: "Ventas", icon: ShoppingCart },
  { value: "cash", label: "Historial de Caja", icon: PiggyBank },
];

const BAR_COLORS = ["#4B98CF", "#4EB4A5", "#E3AA75", "#5163C5", "#CF4B4B", "#16BA71", "#E3AA75"];

interface TooltipInfo {
  x: number;
  y: number;
  label: string;
  value: number;
  detail?: string;
}

function InteractiveBarChart({
  data,
  title,
  height = 160,
  onBarClick,
  series2,
  series2Label,
  series2Color = "#4EB4A5",
}: {
  data: { label: string; value: number; color: string; detail?: string }[];
  title: string;
  height?: number;
  onBarClick?: (item: { label: string; value: number }) => void;
  /** Segunda serie superpuesta (ej. ganancia sobre ingresos), misma escala que `data`. */
  series2?: { label: string; value: number }[];
  series2Label?: string;
  series2Color?: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 44;
  const gap = 16;
  const totalW = data.length * (barW + gap) + 16;
  const linePoints = series2?.map((d, i) => {
    const x = i * (barW + gap) + 8 + barW / 2;
    const y = height - 28 - Math.max((d.value / max) * (height - 48), 0);
    return { x, y, value: d.value };
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">{title}</p>
        {series2 && (
          <div className="flex items-center gap-3 text-[10px] font-semibold text-[#6B7280]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: data[0]?.color ?? "#4B98CF" }} />Ingresos</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: series2Color }} />{series2Label ?? "Ganancia"}</span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Math.max(totalW, 200)} ${height}`}
          className="w-full"
          style={{ minWidth: data.length * 60, height }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = height - 28 - (height - 48) * pct;
            return (
              <g key={pct}>
                <line x1={0} y1={y} x2={totalW} y2={y} stroke="#ECEEF0" strokeDasharray={pct === 0 ? "" : "3 3"} />
                {pct > 0 && (
                  <text x={4} y={y - 4} className="text-[8px]" fill="#6B7280">
                    {Math.round(max * pct)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const x = i * (barW + gap) + 8;
            const barH = Math.max(((d.value / max) * (height - 48)), 2);
            const y = height - 28 - barH;
            const isHovered = tooltip?.label === d.label;

            return (
              <g
                key={d.label}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget.closest("svg") as SVGSVGElement).getBoundingClientRect();
                  setTooltip({ x: rect.left + x + barW / 2, y: rect.top + y, label: d.label, value: d.value, detail: d.detail });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onBarClick?.(d)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={isHovered ? barH + 4 : barH}
                  rx="5"
                  fill={d.color}
                  opacity={isHovered ? 1 : 0.82}
                  className="transition-all duration-150"
                  style={{ transform: isHovered ? `translateY(-4px)` : "", filter: isHovered ? "brightness(1.1)" : "" }}
                />
                <text x={x + barW / 2} y={y - 8} textAnchor="middle" className={cn("text-[11px] font-bold transition-opacity", isHovered ? "opacity-100" : "opacity-0")} fill="#112b4a">
                  {d.value}
                </text>
                <text x={x + barW / 2} y={height - 14} textAnchor="middle" className="text-[9px]" fill="#6B7280">
                  {d.label.length > 5 ? d.label.slice(0, 5) : d.label}
                </text>
              </g>
            );
          })}

          {/* Segunda serie (ganancia) superpuesta como línea */}
          {linePoints && linePoints.length > 0 && (
            <g>
              <polyline
                points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={series2Color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {linePoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={series2Color} />
              ))}
            </g>
          )}
        </svg>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 rounded border border-[#DCE0E2] bg-white px-3 py-2 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y - 10, transform: "translate(-50%, -100%)" }}
        >
          <p className="text-xs font-bold text-[#112b4a]">{tooltip.label}</p>
          <p className="text-lg font-bold text-[#4B98CF]">{tooltip.value}</p>
          {tooltip.detail && <p className="text-[10px] text-[#6B7280]">{tooltip.detail}</p>}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, value, max, color, detail }: { label: string; value: number; max: number; color: string; detail?: string }) {
  const pct = Math.min(Math.round((value / (max || 1)) * 100), 100);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-[#112b4a]">{label}</span>
        <span className={cn("text-xs font-bold transition-all", hovered ? "text-base" : "text-[#112b4a]")} style={{ color: hovered ? color : undefined }}>
          {value}
          {detail && hovered && <span className="ml-1 text-[10px] font-normal text-[#6B7280]">{detail}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F5F7F9]">
        <div
          className={cn("h-2.5 rounded-full transition-all duration-500 ease-out", hovered && "h-3 -mt-0.5")}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [viewMode, setViewMode] = useState<ViewMode>("charts");
  const [activeTab, setActiveTab] = useState<ActiveTab>("orders");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedBar, setSelectedBar] = useState<{ label: string; value: number } | null>(null);

  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });
  const { data: inventory } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory", transform: (r) => r.map(adaptInventory)
  });
  const { data: shipments } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments", transform: (r) => r.map(adaptShipment)
  });

  const { operationalInventory, getAllSales } = useOperationalWorkspace({ orders, inventory, shipments });

  const now = new Date();
  const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    if (period !== "all") {
      const cutoff = new Date(now.getTime() - periodDays * 86400000);
      list = list.filter((o) => new Date(o.createdAt) >= cutoff);
    }
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter((o) => `${o.id} ${o.customer} ${o.sku} ${o.stage}`.toLowerCase().includes(q));
    }
    if (selectedBar) {
      list = list.filter((o) => o.stage.toLowerCase().includes(selectedBar.label.toLowerCase()));
    }
    return list;
  }, [orders, period, periodDays, filterQuery, selectedBar, now]);

  const filteredShipments = useMemo(() => {
    let list = shipments ?? [];
    if (period !== "all") {
      const cutoff = new Date(now.getTime() - periodDays * 86400000);
      list = list.filter((s) => new Date(s.createdAt ?? s.shippedAt ?? "") >= cutoff);
    }
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter((s) => `${s.tracking} ${s.orderId} ${s.sku} ${s.stage}`.toLowerCase().includes(q));
    }
    if (selectedBar) {
      list = list.filter((s) => s.stage.toLowerCase().includes(selectedBar.label.toLowerCase()));
    }
    return list;
  }, [shipments, period, periodDays, filterQuery, selectedBar, now]);

  const reportData = useMemo(() => {
    const stageMap = new Map<string, number>();
    filteredOrders.forEach((o) => stageMap.set(o.stage, (stageMap.get(o.stage) ?? 0) + 1));
    const ordersByStage = Array.from(stageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => ({
        label: stage.replace(/_/g, " "),
        value: count,
        color: stage.includes("deliver") ? "#4EB4A5" : stage.includes("confirm") ? "#4B98CF" : stage.includes("incident") || stage.includes("reject") ? "#CF4B4B" : "#E3AA75",
        detail: `${Math.round((count / (filteredOrders.length || 1)) * 100)}% del total`,
      }));

    const shpMap = new Map<string, number>();
    filteredShipments.forEach((s) => shpMap.set(s.stage, (shpMap.get(s.stage) ?? 0) + 1));
    const shipmentsByStage = Array.from(shpMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => ({
        label: stage.replace(/_/g, " "),
        value: count,
        color: stage.includes("deliver") ? "#4EB4A5" : stage.includes("delay") ? "#CF4B4B" : stage.includes("out") ? "#4B98CF" : "#E3AA75",
        detail: `${Math.round((count / (filteredShipments.length || 1)) * 100)}% del total`,
      }));

    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const dayMap = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const day = dayNames[new Date(o.createdAt).getDay()] ?? "Dom";
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    });
    const ordersByDay = dayNames.map((day) => ({
      label: day,
      value: dayMap.get(day) ?? 0,
      color: "#4B98CF",
    }));

    const stockBars = (inventory ?? []).map((p) => ({
      label: `SKU ${p.sku}`,
      value: p.stock,
      color: p.stock <= 5 ? "#CF4B4B" : p.stock <= 20 ? "#E3AA75" : "#4EB4A5",
      detail: p.stock <= 5 ? "Crítico" : p.stock <= 20 ? "Bajo" : "OK",
    }));

    const deliveryRate = filteredShipments.length > 0
      ? Math.round((filteredShipments.filter((s) => s.stage === "entregado").length / filteredShipments.length) * 100)
      : 0;
    const lowStock = operationalInventory.filter((p) => p.stock <= 5).length;

    return {
      ordersByStage,
      shipmentsByStage,
      ordersByDay,
      stockBars,
      totalOrders: filteredOrders.length,
      totalShipments: filteredShipments.length,
      deliveryRate,
      lowStock,
      totalProducts: inventory?.length ?? 0,
    };
  }, [filteredOrders, filteredShipments, inventory, operationalInventory]);

  const { data: cashSessions } = useApiQuery<ApiCashSession[], CashSession[]>({
    path: "/api/cash-sessions", transform: (r) => r.map(adaptCashSession), enabled: activeTab === "cash",
  });

  const [allSales, setAllSales] = useState<Sale[]>([]);

  useEffect(() => {
    getAllSales().then(setAllSales).catch(() => setAllSales([]));
  }, [getAllSales]);

  const salesReport = useMemo(() => {
    let sales = allSales ?? [];
    if (period !== "all") {
      const cutoff = new Date(now.getTime() - periodDays * 86400000);
      sales = sales.filter((s) => new Date(s.createdAt) >= cutoff);
    }
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      sales = sales.filter((s) => s.id.toLowerCase().includes(q) || s.vendorName.toLowerCase().includes(q) || s.paymentMethod.toLowerCase().includes(q));
    }

    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const dayRevMap = new Map<string, number>();
    const dayProfitMap = new Map<string, number>();
    let totalProfit = 0;
    const profitBySku = new Map<string, { name: string; profit: number }>();
    sales.forEach((s) => {
      const day = dayNames[new Date(s.createdAt).getDay()] ?? "Dom";
      dayRevMap.set(day, (dayRevMap.get(day) ?? 0) + s.total);
      s.items.forEach((item) => {
        if (item.unitCost == null) return;
        const profit = (item.unitPrice - item.unitCost) * item.quantity;
        totalProfit += profit;
        dayProfitMap.set(day, (dayProfitMap.get(day) ?? 0) + profit);
        const entry = profitBySku.get(item.sku) ?? { name: item.name, profit: 0 };
        entry.profit += profit;
        profitBySku.set(item.sku, entry);
      });
    });
    const revenueByDay = dayNames.map((day) => ({
      label: day,
      value: Math.round(dayRevMap.get(day) ?? 0),
      color: "#4B98CF",
    }));
    const profitByDay = dayNames.map((day) => ({
      label: day,
      value: Math.round(dayProfitMap.get(day) ?? 0),
    }));
    const topProductsByProfit = Array.from(profitBySku.entries())
      .map(([sku, v]) => ({ sku, name: v.name, profit: Math.round(v.profit) }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const vendorMap = new Map<string, number>();
    const vendorCountMap = new Map<string, number>();
    sales.forEach((s) => {
      vendorMap.set(s.vendorName, (vendorMap.get(s.vendorName) ?? 0) + s.total);
      vendorCountMap.set(s.vendorName, (vendorCountMap.get(s.vendorName) ?? 0) + 1);
    });
    const revenueByVendor = Array.from(vendorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([vendor, total], i) => ({
        label: vendor,
        value: Math.round(total),
        color: BAR_COLORS[i % BAR_COLORS.length] ?? "#6B7280",
        detail: `${vendorCountMap.get(vendor) ?? 0} ventas`,
      }));

    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalSalesCount = sales.length;
    const avgTicket = totalSalesCount > 0 ? Math.round(totalRevenue / totalSalesCount) : 0;
    const topVendorEntry = Array.from(vendorMap.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      revenueByDay,
      profitByDay,
      revenueByVendor,
      topProductsByProfit,
      totalRevenue,
      totalProfit: Math.round(totalProfit),
      totalSalesCount,
      avgTicket,
      topVendor: topVendorEntry ? { name: topVendorEntry[0], value: Math.round(topVendorEntry[1]) } : null,
      filteredSales: sales,
    };
  }, [allSales, period, periodDays, filterQuery, now]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#6B7280]">Reportes</p>
          <h1 className="text-xl font-bold text-[#112b4a]">Analytics operacional</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded border border-[#DCE0E2] bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setPeriod(p.value); setSelectedBar(null); }}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  period === p.value ? "bg-[#4B98CF] text-white" : "text-[#6B7280] hover:text-[#112b4a]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded border border-[#DCE0E2] bg-white p-0.5">
            <button onClick={() => setViewMode("charts")} className={cn("rounded p-1.5", viewMode === "charts" && "bg-[#F5F7F9]")}>
              <BarChart3 className={cn("h-4 w-4", viewMode === "charts" ? "text-[#4B98CF]" : "text-[#6B7280]")} />
            </button>
            <button onClick={() => setViewMode("table")} className={cn("rounded p-1.5", viewMode === "table" && "bg-[#F5F7F9]")}>
              <Table2 className={cn("h-4 w-4", viewMode === "table" ? "text-[#4B98CF]" : "text-[#6B7280]")} />
            </button>
          </div>

          <button
            onClick={() => {
              if (activeTab === "sales") {
                exportSalesCSV(salesReport.filteredSales.map((s) => ({ id: s.id, items: s.items.map((i) => `${i.quantity}x ${i.name}`).join("; "), vendorName: s.vendorName, total: s.total, paymentMethod: s.paymentMethod, createdAt: s.createdAt })));
              } else if (activeTab === "orders") {
                exportOrdersCSV(filteredOrders.map((o) => ({ id: o.id, customer: o.customer, sku: o.sku, quantity: o.quantity, stage: o.stage.replace(/_/g, " "), createdAt: o.createdAt })));
              } else if (activeTab === "shipments") {
                exportShipmentsCSV(filteredShipments.map((s) => ({ id: s.id, tracking: s.tracking, orderId: s.orderId, sku: s.sku, stage: s.stage.replace(/_/g, " "), carrier: s.carrier, createdAt: s.createdAt ?? "" })));
              } else {
                exportInventoryCSV((inventory ?? []).map((p) => ({ sku: p.sku, stock: p.stock, status: p.status, updatedAt: p.updatedAt })));
              }
            }}
            className="flex items-center gap-1.5 rounded border border-[#DCE0E2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#6B7280] hover:bg-[#F5F7F9] hover:text-[#112b4a]"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(activeTab === "sales"
          ? [
              { label: "Ingresos totales", value: formatCurrency(salesReport.totalRevenue), icon: ShoppingCart, color: "#4B98CF", trend: `${salesReport.totalSalesCount} transacciones`, trendUp: true },
              { label: "Ticket promedio", value: formatCurrency(salesReport.avgTicket), icon: ShoppingBag, color: "#4EB4A5", trend: "por venta", trendUp: true },
              { label: "Ganancia estimada", value: formatCurrency(salesReport.totalProfit), icon: BarChart3, color: "#5163C5", trend: "margen real por costo", trendUp: true },
              { label: "Top vendedor", value: salesReport.topVendor?.name ?? "N/A", icon: Package, color: "#E3AA75", trend: salesReport.topVendor ? formatCurrency(salesReport.topVendor.value) : "", trendUp: true },
            ]
          : [
              { label: "Pedidos totales", value: reportData.totalOrders, icon: ShoppingBag, color: "#4B98CF", trend: "+12%", trendUp: true },
              { label: "Tasa de entrega", value: `${reportData.deliveryRate}%`, icon: Truck, color: "#4EB4A5", trend: "+5%", trendUp: true },
              { label: "Stock bajo", value: `${reportData.lowStock}/${reportData.totalProducts}`, icon: Package, color: "#E3AA75", trend: "Crítico", trendUp: false },
              { label: "Envíos activos", value: reportData.totalShipments, icon: Clock, color: "#5163C5", trend: "En curso", trendUp: true },
            ]
        ).map((kpi) => (
          <div key={kpi.label} className="group rounded border border-[#DCE0E2] bg-white p-4 transition hover:border-[#4B98CF] hover:shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${kpi.color}15` }}>
                <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              </div>
              <p className="text-xs font-medium text-[#6B7280]">{kpi.label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#112b4a]">{kpi.value}</p>
            <p className={cn("mt-1 flex items-center gap-1 text-[10px]", kpi.trendUp ? "text-green-600" : "text-red-500")}>
              {kpi.trendUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {kpi.trend}
            </p>
          </div>
        ))}
      </div>

      {/* Active filter badge */}
      {selectedBar && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7280]">Filtrado por:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#4B98CF]/10 px-3 py-1 text-xs font-bold text-[#4B98CF]">
            {selectedBar.label} ({selectedBar.value})
            <button onClick={() => setSelectedBar(null)} className="ml-1 hover:text-[#346384]">&times;</button>
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded border border-[#DCE0E2] bg-white p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setSelectedBar(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              activeTab === tab.value ? "bg-[#4B98CF] text-white" : "text-[#6B7280] hover:text-[#112b4a]"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "cash" ? (
        <div className="overflow-hidden rounded border border-[#DCE0E2] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                  <th className="px-4 py-2.5">Apertura</th>
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="px-4 py-2.5">Cierre</th>
                  <th className="px-4 py-2.5">Monto inicial</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Monto final</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Diferencia</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(cashSessions ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[#112b4a]">{new Date(s.openedAt).toLocaleDateString("es-CL")}</p>
                      <p className="text-[10px] text-[#6B7280]">{new Date(s.openedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</p>
                    </td>
                    <td className="px-4 py-2.5">{s.vendorName}</td>
                    <td className="px-4 py-2.5 text-xs text-[#6B7280]">{s.closedAt ? new Date(s.closedAt).toLocaleString("es-CL") : "No cerrada"}</td>
                    <td className="px-4 py-2.5">{formatCurrency(s.openingAmount)}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">{s.countedAmount != null ? formatCurrency(s.countedAmount) : "-"}</td>
                    <td className={cn("hidden px-4 py-2.5 font-semibold sm:table-cell", s.difference == null ? "" : s.difference === 0 ? "text-[#4EB4A5]" : "text-amber-600")}>
                      {s.difference != null ? `${s.difference > 0 ? "+" : ""}${formatCurrency(s.difference)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", s.status === "open" ? "bg-[#4B98CF]/10 text-[#4B98CF]" : "bg-[#F5F7F9] text-[#6B7280]")}>
                        {s.status === "open" ? "Abierta" : "Cerrada"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(cashSessions ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-xs text-[#6B7280]">Sin sesiones de caja registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === "charts" ? (
        <>
          {/* Charts */}
          <div className="grid gap-5 lg:grid-cols-2">
            {activeTab === "orders" && (
              <>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <InteractiveBarChart data={reportData.ordersByDay} title="Pedidos por dia de la semana" onBarClick={(item) => setSelectedBar(item)} />
                </div>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Pedidos por estado</p>
                  <div className="space-y-3">
                    {reportData.ordersByStage.map((s) => (
                      <div key={s.label} onClick={() => setSelectedBar({ label: s.label, value: s.value })} className="cursor-pointer">
                        <ProgressBar label={s.label} value={s.value} max={reportData.totalOrders} color={s.color} detail={s.detail} />
                      </div>
                    ))}
                    {reportData.ordersByStage.length === 0 && (
                      <p className="py-8 text-center text-xs text-[#6B7280]">Sin datos para el periodo seleccionado</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === "shipments" && (
              <>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Envíos por estado</p>
                  <div className="space-y-3">
                    {reportData.shipmentsByStage.map((s) => (
                      <div key={s.label} onClick={() => setSelectedBar({ label: s.label, value: s.value })} className="cursor-pointer">
                        <ProgressBar label={s.label} value={s.value} max={reportData.totalShipments} color={s.color} detail={s.detail} />
                      </div>
                    ))}
                    {reportData.shipmentsByStage.length === 0 && (
                      <p className="py-8 text-center text-xs text-[#6B7280]">Sin datos para el periodo seleccionado</p>
                    )}
                  </div>
                </div>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Resumen de envíos</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded bg-[#F5F7F9] p-4 text-center">
                      <p className="text-2xl font-bold text-[#4EB4A5]">{filteredShipments.filter((s) => s.stage === "entregado").length}</p>
                      <p className="text-[10px] font-medium text-[#6B7280]">Entregados</p>
                    </div>
                    <div className="rounded bg-[#F5F7F9] p-4 text-center">
                      <p className="text-2xl font-bold text-[#CF4B4B]">{filteredShipments.filter((s) => s.stage === "cancelado").length}</p>
                      <p className="text-[10px] font-medium text-[#6B7280]">Cancelados</p>
                    </div>
                    <div className="rounded bg-[#F5F7F9] p-4 text-center">
                      <p className="text-2xl font-bold text-[#E3AA75]">{filteredShipments.filter((s) => s.stage === "en_preparacion" || s.stage === "en_reparto").length}</p>
                      <p className="text-[10px] font-medium text-[#6B7280]">En preparacion</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "stock" && (
              <div className="rounded border border-[#DCE0E2] bg-white p-5 lg:col-span-2">
                <InteractiveBarChart data={reportData.stockBars} title="Stock por SKU" height={200} />
              </div>
            )}

            {activeTab === "sales" && (
              <>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <InteractiveBarChart
                    data={salesReport.revenueByDay}
                    title="Ingresos y ganancia por dia"
                    series2={salesReport.profitByDay}
                    series2Label="Ganancia"
                  />
                </div>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Ventas por vendedor</p>
                  <div className="space-y-3">
                    {salesReport.revenueByVendor.length > 0
                      ? salesReport.revenueByVendor.map((v) => (
                          <ProgressBar key={v.label} label={v.label} value={v.value} max={salesReport.totalRevenue} color={v.color} detail={v.detail ?? ""} />
                        ))
                      : <p className="py-8 text-center text-xs text-[#6B7280]">Sin datos para el periodo seleccionado</p>}
                  </div>
                </div>
                <div className="rounded border border-[#DCE0E2] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">Top productos por ganancia</p>
                  <div className="space-y-3">
                    {salesReport.topProductsByProfit.length > 0
                      ? salesReport.topProductsByProfit.map((p, i) => (
                          <ProgressBar
                            key={p.sku}
                            label={p.name}
                            value={p.profit}
                            max={salesReport.topProductsByProfit[0]?.profit ?? 1}
                            color={BAR_COLORS[i % BAR_COLORS.length] ?? "#6B7280"}
                            detail={formatCurrency(p.profit)}
                          />
                        ))
                      : <p className="py-8 text-center text-xs text-[#6B7280]">Sin ventas con costo registrado en el periodo</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Table view */
        <div className="overflow-hidden rounded border border-[#DCE0E2] bg-white">
          <div className="flex items-center gap-2 border-b border-[#ECEEF0] px-4 py-3">
            <Search className="h-4 w-4 text-[#6B7280]" />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar resultados..."
              className="flex-1 bg-transparent text-sm text-[#112b4a] outline-none placeholder:text-[#6B7280]"
            />
            <span className="text-xs text-[#6B7280]">
              {activeTab === "sales" ? salesReport.filteredSales.length : activeTab === "orders" ? filteredOrders.length : activeTab === "shipments" ? filteredShipments.length : inventory?.length ?? 0} resultados
            </span>
          </div>
          <div className="overflow-x-auto">
            {activeTab === "sales" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Items</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Vendedor</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Pago</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.filteredSales.map((s) => (
                    <tr key={s.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                      <td className="px-4 py-2.5 font-bold text-[#4B98CF]">{s.id}</td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-[#6B7280]">{s.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">{s.vendorName}</td>
                      <td className="px-4 py-2.5 font-bold">{formatCurrency(s.total)}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <span className="rounded bg-[#F5F7F9] px-2 py-0.5 text-[10px] font-bold">{s.paymentMethod === "cash" ? "Efectivo" : s.paymentMethod === "transfer" ? "Transferencia" : s.paymentMethod}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-[#6B7280] sm:table-cell">{new Date(s.createdAt).toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                  {salesReport.filteredSales.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-xs text-[#6B7280]">Sin ventas para el periodo seleccionado</td></tr>}
                </tbody>
              </table>
            ) : activeTab === "orders" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Cliente</th>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Cant.</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                      <td className="px-4 py-2.5 font-bold text-[#4B98CF]">{o.id}</td>
                      <td className="px-4 py-2.5">{o.customer}</td>
                      <td className="px-4 py-2.5 text-[#6B7280]">{o.sku}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">{o.quantity}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-[#F5F7F9]">{o.stage}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#6B7280] hidden sm:table-cell">{new Date(o.createdAt).toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeTab === "shipments" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                    <th className="px-4 py-2.5">Tracking</th>
                    <th className="px-4 py-2.5">Pedido</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Transportista</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((s) => (
                    <tr key={s.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#4B98CF]">{s.tracking}</td>
                      <td className="px-4 py-2.5">#{s.orderId}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-[#F5F7F9]">{s.stage.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#6B7280] hidden sm:table-cell">{s.carrier}</td>
                      <td className="px-4 py-2.5 text-xs text-[#6B7280] hidden sm:table-cell">{new Date(s.createdAt ?? "").toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#ECEEF0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#6B7280]">
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Stock</th>
                    <th className="px-4 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventory ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-[#F5F7F9] hover:bg-[#F5F7F9]">
                      <td className="px-4 py-2.5 font-bold text-[#4B98CF]">{p.sku}</td>
                      <td className="px-4 py-2.5">{p.stock}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", p.stock <= 5 ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600")}>
                          {p.stock <= 5 ? "Crítico" : "OK"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
