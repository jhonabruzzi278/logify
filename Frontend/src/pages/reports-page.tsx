import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Banknote, Boxes, CalendarDays, Clock, Download, Package, PiggyBank, Search, ShoppingBag, ShoppingCart, Table2, Truck } from "lucide-react";
import { gsap } from "gsap";
import { useApiQuery } from "@/hooks/use-api-query";
import { type BusinessMode, useBusinessMode } from "@/hooks/use-business-mode";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { adaptCashSession, adaptInventory, adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { cn, formatCurrency, onActivateKey } from "@/lib/utils";
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

/** Pedidos/Envíos son datos B2B, Ventas/Caja son B2C — nunca se mezclan. Stock es lo único que cruza ambos modos. */
const TABS: { value: ActiveTab; label: string; icon: typeof BarChart3; modes: BusinessMode[] }[] = [
  { value: "orders", label: "Pedidos", icon: ShoppingBag, modes: ["b2b"] },
  { value: "shipments", label: "Envíos", icon: Truck, modes: ["b2b"] },
  { value: "stock", label: "Stock", icon: Boxes, modes: ["b2b", "b2c"] },
  { value: "sales", label: "Ventas", icon: ShoppingCart, modes: ["b2c"] },
  { value: "cash", label: "Historial de Caja", icon: PiggyBank, modes: ["b2c"] },
];

const BAR_COLORS = ["#2563EB", "#0D9488", "#D97706", "#8B5CF6", "#DC2626", "#059669", "#D97706"];

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
  series2Color = "#0D9488",
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
  const svgRef = useRef<SVGSVGElement>(null);
  const hasAnimatedRef = useRef(false);
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 44;
  const gap = 16;
  const totalW = data.length * (barW + gap) + 16;
  const linePoints = series2?.map((d, i) => {
    const x = i * (barW + gap) + 8 + barW / 2;
    const y = height - 28 - Math.max((d.value / max) * (height - 48), 0);
    return { x, y, value: d.value };
  });

  // Firma estable de los valores: `data` es un array nuevo en cada render del
  // padre (por el polling), así que depender del array directamente dispararía
  // el efecto en cada refresco aunque los valores no cambien.
  const dataSignature = data.map((d) => `${d.label}:${d.value}`).join("|") + (series2?.map((d) => d.value).join(",") ?? "");

  useLayoutEffect(() => {
    if (!svgRef.current) return;
    // Solo anima la primera vez que llegan datos reales: el polling de refresco
    // vacia los arrays brevemente en cada refetch, y animar en cada cambio haria
    // que las barras "parpadearan" cada vez que el dashboard se refresca solo.
    if (hasAnimatedRef.current || data.every((d) => d.value === 0)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    hasAnimatedRef.current = true;

    const ctx = gsap.context(() => {
      const bars = gsap.utils.toArray<SVGRectElement>(".chart-bar");
      bars.forEach((bar, i) => {
        // Se calcula el objetivo desde `data`, no desde el DOM: leer el atributo ya
        // renderizado puede devolver un valor dejado por una animacion anterior
        // (GSAP muta el atributo directamente y React no siempre lo revierte si
        // el valor "virtual" no cambio entre renders).
        const d = data[i];
        if (!d) return;
        const targetH = Math.max((d.value / max) * (height - 48), 2);
        const targetY = height - 28 - targetH;
        gsap.fromTo(
          bar,
          { attr: { height: 0, y: targetY + targetH } },
          { attr: { height: targetH, y: targetY }, duration: 0.5, delay: i * 0.04, ease: "power2.out" }
        );
      });

      const dots = gsap.utils.toArray<SVGCircleElement>(".chart-dot");
      if (dots.length > 0) {
        gsap.set(dots, { transformOrigin: "center", scale: 0, opacity: 0 });
        gsap.to(dots, { scale: 1, opacity: 1, duration: 0.35, delay: 0.35, stagger: 0.05, ease: "back.out(2)" });
      }

      const line = svgRef.current!.querySelector<SVGPolylineElement>(".chart-line");
      if (line) {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(line, { strokeDashoffset: 0, duration: 0.6, delay: 0.15, ease: "power2.inOut" });
      }
    }, svgRef);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se ancla a `dataSignature` (valor estable) en vez de `data`/`max`/`height` para no recrear el contexto GSAP en cada render del padre
  }, [dataSignature]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">{title}</p>
        {series2 && (
          <div className="flex items-center gap-3 text-[10px] font-semibold text-[#64748B]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: data[0]?.color ?? "#2563EB" }} />Ingresos</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: series2Color }} />{series2Label ?? "Ganancia"}</span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${Math.max(totalW, 200)} ${height}`}
          className="w-full"
          style={{ minWidth: data.length * 60, height }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = height - 28 - (height - 48) * pct;
            return (
              <g key={pct}>
                <line x1={0} y1={y} x2={totalW} y2={y} stroke="#E2E8F0" strokeDasharray={pct === 0 ? "" : "3 3"} />
                {pct > 0 && (
                  <text x={4} y={y - 4} className="text-[8px]" fill="#64748B">
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
                  className="chart-bar transition-[filter,opacity,transform] duration-150"
                  x={x}
                  y={y}
                  width={barW}
                  height={isHovered ? barH + 4 : barH}
                  rx="5"
                  fill={d.color}
                  opacity={isHovered ? 1 : 0.82}
                  style={{ transform: isHovered ? `translateY(-4px)` : "", filter: isHovered ? "brightness(1.1)" : "" }}
                />
                <text x={x + barW / 2} y={y - 8} textAnchor="middle" className={cn("text-[11px] font-bold transition-opacity", isHovered ? "opacity-100" : "opacity-0")} fill="#172554">
                  {d.value}
                </text>
                <text x={x + barW / 2} y={height - 14} textAnchor="middle" className="text-[9px]" fill="#64748B">
                  {d.label.length > 5 ? d.label.slice(0, 5) : d.label}
                </text>
              </g>
            );
          })}

          {/* Segunda serie (ganancia) superpuesta como línea */}
          {linePoints && linePoints.length > 0 && (
            <g>
              <polyline
                className="chart-line"
                points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={series2Color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {linePoints.map((p, i) => (
                <circle key={i} className="chart-dot" cx={p.x} cy={p.y} r={3} fill={series2Color} />
              ))}
            </g>
          )}
        </svg>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 rounded border border-[#E2E8F0] bg-white px-3 py-2 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y - 10, transform: "translate(-50%, -100%)" }}
        >
          <p className="text-xs font-bold text-[#172554]">{tooltip.label}</p>
          <p className="text-lg font-bold text-[#2563EB]">{tooltip.value}</p>
          {tooltip.detail && <p className="text-[10px] text-[#64748B]">{tooltip.detail}</p>}
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
        <span className="text-xs font-medium text-[#172554]">{label}</span>
        <span className={cn("text-xs font-bold transition-all", hovered ? "text-base" : "text-[#172554]")} style={{ color: hovered ? color : undefined }}>
          {value}
          {detail && hovered && <span className="ml-1 text-[10px] font-normal text-[#64748B]">{detail}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F8FAFC]">
        <div
          className={cn("h-2.5 rounded-full transition-all duration-500 ease-out", hovered && "h-3 -mt-0.5")}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { mode } = useBusinessMode();
  const visibleTabs = useMemo(() => TABS.filter((t) => t.modes.includes(mode)), [mode]);

  const [period, setPeriod] = useState<Period>("30d");
  const [viewMode, setViewMode] = useState<ViewMode>("charts");
  const [activeTab, setActiveTab] = useState<ActiveTab>(mode === "b2b" ? "orders" : "sales");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedBar, setSelectedBar] = useState<{ label: string; value: number } | null>(null);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === activeTab)) {
      setActiveTab(visibleTabs[0]?.value ?? "stock");
      setSelectedBar(null);
    }
  }, [visibleTabs, activeTab]);

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
        color: stage.includes("deliver") ? "#0D9488" : stage.includes("confirm") ? "#2563EB" : stage.includes("incident") || stage.includes("reject") ? "#DC2626" : "#D97706",
        detail: `${Math.round((count / (filteredOrders.length || 1)) * 100)}% del total`,
      }));

    const shpMap = new Map<string, number>();
    filteredShipments.forEach((s) => shpMap.set(s.stage, (shpMap.get(s.stage) ?? 0) + 1));
    const shipmentsByStage = Array.from(shpMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => ({
        label: stage.replace(/_/g, " "),
        value: count,
        color: stage.includes("deliver") ? "#0D9488" : stage.includes("delay") ? "#DC2626" : stage.includes("out") ? "#2563EB" : "#D97706",
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
      color: "#2563EB",
    }));

    const stockBars = (inventory ?? []).map((p) => ({
      label: `SKU ${p.sku}`,
      value: p.stock,
      color: p.stock <= 5 ? "#DC2626" : p.stock <= 20 ? "#D97706" : "#0D9488",
      detail: p.stock <= 5 ? "Crítico" : p.stock <= 20 ? "Bajo" : "OK",
    }));

    const deliveryRate = filteredShipments.length > 0
      ? Math.round((filteredShipments.filter((s) => s.stage === "entregado").length / filteredShipments.length) * 100)
      : 0;
    const lowStock = operationalInventory.filter((p) => p.stock <= 5).length;
    const inventoryValue = (inventory ?? []).reduce((sum, p) => sum + p.stock * p.price, 0);
    const inventoryCost = (inventory ?? []).reduce((sum, p) => sum + p.stock * p.cost, 0);

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
      inventoryValue,
      inventoryCost,
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
      color: "#2563EB",
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
        color: BAR_COLORS[i % BAR_COLORS.length] ?? "#64748B",
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
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Reportes</p>
          <h1 className="text-xl font-bold text-[#172554]">Analytics operacional</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded border border-[#E2E8F0] bg-white p-0.5">
            {PERIODS.map((p) => (
              <button type="button"
                key={p.value}
                onClick={() => { setPeriod(p.value); setSelectedBar(null); }}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  period === p.value ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded border border-[#E2E8F0] bg-white p-0.5">
            <button type="button" onClick={() => setViewMode("charts")} className={cn("rounded p-1.5", viewMode === "charts" && "bg-[#F8FAFC]")}>
              <BarChart3 className={cn("h-4 w-4", viewMode === "charts" ? "text-[#2563EB]" : "text-[#64748B]")} />
            </button>
            <button type="button" onClick={() => setViewMode("table")} className={cn("rounded p-1.5", viewMode === "table" && "bg-[#F8FAFC]")}>
              <Table2 className={cn("h-4 w-4", viewMode === "table" ? "text-[#2563EB]" : "text-[#64748B]")} />
            </button>
          </div>

          <button type="button"
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
            className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#172554]"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs — dependen de la pestaña activa, nunca mezclan datos B2B con B2C */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(activeTab === "sales" || activeTab === "cash"
          ? [
              { label: "Ingresos totales", value: formatCurrency(salesReport.totalRevenue), icon: ShoppingCart, color: "#2563EB", trend: `${salesReport.totalSalesCount} transacciones`, trendUp: true },
              { label: "Ticket promedio", value: formatCurrency(salesReport.avgTicket), icon: ShoppingBag, color: "#0D9488", trend: "por venta", trendUp: true },
              { label: "Ganancia estimada", value: formatCurrency(salesReport.totalProfit), icon: BarChart3, color: "#8B5CF6", trend: "margen real por costo", trendUp: true },
              { label: "Top vendedor", value: salesReport.topVendor?.name ?? "N/A", icon: Package, color: "#D97706", trend: salesReport.topVendor ? formatCurrency(salesReport.topVendor.value) : "", trendUp: true },
            ]
          : activeTab === "stock"
          ? [
              { label: "Valor de inventario", value: formatCurrency(reportData.inventoryValue), icon: Banknote, color: "#2563EB", trend: "a precio de venta", trendUp: true },
              { label: "Costo de inventario", value: formatCurrency(reportData.inventoryCost), icon: PiggyBank, color: "#8B5CF6", trend: "capital inmovilizado", trendUp: true },
              { label: "Stock bajo", value: `${reportData.lowStock}/${reportData.totalProducts}`, icon: Package, color: "#D97706", trend: "Crítico", trendUp: false },
              { label: "Margen potencial", value: formatCurrency(reportData.inventoryValue - reportData.inventoryCost), icon: BarChart3, color: "#0D9488", trend: "si se vende todo el stock", trendUp: true },
            ]
          : [
              { label: "Pedidos totales", value: reportData.totalOrders, icon: ShoppingBag, color: "#2563EB", trend: "+12%", trendUp: true },
              { label: "Tasa de entrega", value: `${reportData.deliveryRate}%`, icon: Truck, color: "#0D9488", trend: "+5%", trendUp: true },
              { label: "Stock bajo", value: `${reportData.lowStock}/${reportData.totalProducts}`, icon: Package, color: "#D97706", trend: "Crítico", trendUp: false },
              { label: "Envíos activos", value: reportData.totalShipments, icon: Clock, color: "#8B5CF6", trend: "En curso", trendUp: true },
            ]
        ).map((kpi) => (
          <div key={kpi.label} className="group rounded border border-[#E2E8F0] bg-white p-4 transition hover:border-[#2563EB] hover:shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${kpi.color}15` }}>
                <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              </div>
              <p className="text-xs font-medium text-[#64748B]">{kpi.label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#172554]">{kpi.value}</p>
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
          <span className="text-xs text-[#64748B]">Filtrado por:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2563EB]/10 px-3 py-1 text-xs font-bold text-[#2563EB]">
            {selectedBar.label} ({selectedBar.value})
            <button type="button" onClick={() => setSelectedBar(null)} className="ml-1 hover:text-[#1D4ED8]">&times;</button>
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded border border-[#E2E8F0] bg-white p-1 w-fit">
        {visibleTabs.map((tab) => (
          <button type="button"
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setSelectedBar(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              activeTab === tab.value ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "cash" ? (
        <div className="overflow-hidden rounded border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
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
                  <tr key={s.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[#172554]">{new Date(s.openedAt).toLocaleDateString("es-CL")}</p>
                      <p className="text-[10px] text-[#64748B]">{new Date(s.openedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</p>
                    </td>
                    <td className="px-4 py-2.5">{s.vendorName}</td>
                    <td className="px-4 py-2.5 text-xs text-[#64748B]">{s.closedAt ? new Date(s.closedAt).toLocaleString("es-CL") : "No cerrada"}</td>
                    <td className="px-4 py-2.5">{formatCurrency(s.openingAmount)}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">{s.countedAmount != null ? formatCurrency(s.countedAmount) : "-"}</td>
                    <td className={cn("hidden px-4 py-2.5 font-semibold sm:table-cell", s.difference == null ? "" : s.difference === 0 ? "text-[#0D9488]" : "text-amber-600")}>
                      {s.difference != null ? `${s.difference > 0 ? "+" : ""}${formatCurrency(s.difference)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", s.status === "open" ? "bg-[#2563EB]/10 text-[#2563EB]" : "bg-[#F8FAFC] text-[#64748B]")}>
                        {s.status === "open" ? "Abierta" : "Cerrada"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(cashSessions ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-xs text-[#64748B]">Sin sesiones de caja registradas</td></tr>
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
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <InteractiveBarChart data={reportData.ordersByDay} title="Pedidos por dia de la semana" onBarClick={(item) => setSelectedBar(item)} />
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Pedidos por estado</p>
                  <div className="space-y-3">
                    {reportData.ordersByStage.map((s) => (
                      <div
                        key={s.label}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedBar({ label: s.label, value: s.value })}
                        onKeyDown={onActivateKey(() => setSelectedBar({ label: s.label, value: s.value }))}
                        className="cursor-pointer"
                      >
                        <ProgressBar label={s.label} value={s.value} max={reportData.totalOrders} color={s.color} detail={s.detail} />
                      </div>
                    ))}
                    {reportData.ordersByStage.length === 0 && (
                      <p className="py-8 text-center text-xs text-[#64748B]">Sin datos para el periodo seleccionado</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === "shipments" && (
              <>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Envíos por estado</p>
                  <div className="space-y-3">
                    {reportData.shipmentsByStage.map((s) => (
                      <div
                        key={s.label}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedBar({ label: s.label, value: s.value })}
                        onKeyDown={onActivateKey(() => setSelectedBar({ label: s.label, value: s.value }))}
                        className="cursor-pointer"
                      >
                        <ProgressBar label={s.label} value={s.value} max={reportData.totalShipments} color={s.color} detail={s.detail} />
                      </div>
                    ))}
                    {reportData.shipmentsByStage.length === 0 && (
                      <p className="py-8 text-center text-xs text-[#64748B]">Sin datos para el periodo seleccionado</p>
                    )}
                  </div>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Resumen de envíos</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded bg-[#F8FAFC] p-4 text-center">
                      <p className="text-2xl font-bold text-[#0D9488]">{filteredShipments.filter((s) => s.stage === "entregado").length}</p>
                      <p className="text-[10px] font-medium text-[#64748B]">Entregados</p>
                    </div>
                    <div className="rounded bg-[#F8FAFC] p-4 text-center">
                      <p className="text-2xl font-bold text-[#DC2626]">{filteredShipments.filter((s) => s.stage === "cancelado").length}</p>
                      <p className="text-[10px] font-medium text-[#64748B]">Cancelados</p>
                    </div>
                    <div className="rounded bg-[#F8FAFC] p-4 text-center">
                      <p className="text-2xl font-bold text-[#D97706]">{filteredShipments.filter((s) => s.stage === "en_preparacion" || s.stage === "en_reparto").length}</p>
                      <p className="text-[10px] font-medium text-[#64748B]">En preparacion</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "stock" && (
              <div className="rounded border border-[#E2E8F0] bg-white p-5 lg:col-span-2">
                <InteractiveBarChart data={reportData.stockBars} title="Stock por SKU" height={200} />
              </div>
            )}

            {activeTab === "sales" && (
              <>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <InteractiveBarChart
                    data={salesReport.revenueByDay}
                    title="Ingresos y ganancia por dia"
                    series2={salesReport.profitByDay}
                    series2Label="Ganancia"
                  />
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Ventas por vendedor</p>
                  <div className="space-y-3">
                    {salesReport.revenueByVendor.length > 0
                      ? salesReport.revenueByVendor.map((v) => (
                          <ProgressBar key={v.label} label={v.label} value={v.value} max={salesReport.totalRevenue} color={v.color} detail={v.detail ?? ""} />
                        ))
                      : <p className="py-8 text-center text-xs text-[#64748B]">Sin datos para el periodo seleccionado</p>}
                  </div>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-5">
                  <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">Top productos por ganancia</p>
                  <div className="space-y-3">
                    {salesReport.topProductsByProfit.length > 0
                      ? salesReport.topProductsByProfit.map((p, i) => (
                          <ProgressBar
                            key={p.sku}
                            label={p.name}
                            value={p.profit}
                            max={salesReport.topProductsByProfit[0]?.profit ?? 1}
                            color={BAR_COLORS[i % BAR_COLORS.length] ?? "#64748B"}
                            detail={formatCurrency(p.profit)}
                          />
                        ))
                      : <p className="py-8 text-center text-xs text-[#64748B]">Sin ventas con costo registrado en el periodo</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Table view */
        <div className="overflow-hidden rounded border border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-4 py-3">
            <Search className="h-4 w-4 text-[#64748B]" />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar resultados..."
              className="flex-1 bg-transparent text-sm text-[#172554] outline-none placeholder:text-[#64748B]"
            />
            <span className="text-xs text-[#64748B]">
              {activeTab === "sales" ? salesReport.filteredSales.length : activeTab === "orders" ? filteredOrders.length : activeTab === "shipments" ? filteredShipments.length : inventory?.length ?? 0} resultados
            </span>
          </div>
          <div className="overflow-x-auto">
            {activeTab === "sales" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
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
                    <tr key={s.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-bold text-[#2563EB]">{s.id}</td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-[#64748B]">{s.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">{s.vendorName}</td>
                      <td className="px-4 py-2.5 font-bold">{formatCurrency(s.total)}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <span className="rounded bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-bold">{s.paymentMethod === "cash" ? "Efectivo" : s.paymentMethod === "transfer" ? "Transferencia" : s.paymentMethod}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-[#64748B] sm:table-cell">{new Date(s.createdAt).toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                  {salesReport.filteredSales.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">Sin ventas para el periodo seleccionado</td></tr>}
                </tbody>
              </table>
            ) : activeTab === "orders" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
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
                    <tr key={o.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-bold text-[#2563EB]">{o.id}</td>
                      <td className="px-4 py-2.5">{o.customer}</td>
                      <td className="px-4 py-2.5 text-[#64748B]">{o.sku}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">{o.quantity}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-[#F8FAFC]">{o.stage}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#64748B] hidden sm:table-cell">{new Date(o.createdAt).toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeTab === "shipments" ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
                    <th className="px-4 py-2.5">Tracking</th>
                    <th className="px-4 py-2.5">Pedido</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Transportista</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((s) => (
                    <tr key={s.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#2563EB]">{s.tracking}</td>
                      <td className="px-4 py-2.5">#{s.orderId}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-[#F8FAFC]">{s.stage.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#64748B] hidden sm:table-cell">{s.carrier}</td>
                      <td className="px-4 py-2.5 text-xs text-[#64748B] hidden sm:table-cell">{new Date(s.createdAt ?? "").toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Stock</th>
                    <th className="px-4 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventory ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 font-bold text-[#2563EB]">{p.sku}</td>
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
