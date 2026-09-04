import { useEffect, useState, useMemo } from "react";
import { Clock, Cloud, CloudRain, Download, Inbox, Package, Search, Trash2, Truck, User, X } from "lucide-react";
import { Link } from "react-router-dom";
import { managedUsers } from "@/app/user-directory";
import { Input } from "@/components/ui/input";
import { useApiQuery } from "@/hooks/use-api-query";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptOrder, adaptShipment } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { downloadFile } from "@/lib/api-blob";
import { clearHistory } from "@/lib/order-history";
import { cn } from "@/lib/utils";
import type { ApiNotificationRecord, ApiOrder, ApiShipment } from "@/types/api";
import type { Order, Shipment } from "@/types/domain";

interface WeatherAlertResult {
  alert: boolean;
  condition: string;
  message: string;
  weather: { temperature: number; windSpeed: number; precipitation: number };
}

type NotifType = "all" | "order" | "shipment" | "inventory" | "system";

interface NotificationItem {
  id: string;
  type: NotifType;
  icon: typeof Package;
  iconBg: string;
  title: string;
  detail: string;
  link: string;
  time: string;
  read: boolean;
}

const typeFilters: { value: NotifType; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "order", label: "Pedidos" },
  { value: "shipment", label: "Envíos" },
  { value: "inventory", label: "Inventario" },
  { value: "system", label: "Sistema" },
];

export function NotificationsPage() {
  const [filter, setFilter] = useState<NotifType>("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [weatherAlert, setWeatherAlert] = useState<WeatherAlertResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { can } = usePermissions();
  const canViewAlerts = can("alerts.view");
  const canManageNotifications = can("notifications.manage");

  async function checkWeatherAlert() {
    setWeatherLoading(true);
    try {
      const result = await apiFetch<WeatherAlertResult>("/api/notifications/weather-alert");
      setWeatherAlert(result);
    } catch {
      setWeatherAlert(null);
    } finally {
      setWeatherLoading(false);
    }
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      await downloadFile("/api/notifications/report/pdf", `notificaciones-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : "No se pudo generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders",
    transform: (response) => response.map((o) => adaptOrder(o))
  });

  const { data: shipments } = useApiQuery<ApiShipment[], Shipment[]>({
    path: "/api/shipments",
    transform: (response) => response.map(adaptShipment)
  });

  const { data: systemRecords } = useApiQuery<ApiNotificationRecord[], ApiNotificationRecord[]>({
    path: "/api/notifications/audience/OPERATOR",
    transform: (response) => response
  });

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    (orders ?? []).forEach((o) => {
      items.push({
        id: `ord-${o.id}`,
        type: "order",
        icon: Package,
        iconBg: "bg-[#2563EB]",
        title: `Pedido #${o.id} creado`,
        detail: `SKU ${o.sku} - ${o.quantity} unids - Estado: ${o.stage}`,
        link: `/orders/${o.id}`,
        time: o.createdAt,
        read: false
      });
    });

    (shipments ?? []).forEach((s) => {
      items.push({
        id: `shp-${s.id}`,
        type: "shipment",
        icon: Truck,
        iconBg: "bg-[#0D9488]",
        title: `Envío ${s.tracking}`,
        detail: `Pedido #${s.orderId} - SKU ${s.sku} - ${s.stage}`,
        link: "/shipments",
        time: s.createdAt,
        read: false
      });
    });

    // System notifications (registros reales de notification-service)
    (systemRecords ?? []).forEach((r) => {
      const isStockAlert = r.stage === "STOCK_ALERT";
      items.push({
        id: `sys-${r.id}`,
        type: isStockAlert ? "inventory" : "system",
        icon: isStockAlert ? Package : Clock,
        iconBg: isStockAlert ? "bg-red-500" : "bg-purple-500",
        title: r.stage.replace(/_/g, " "),
        detail: r.message,
        link: r.orderId ? `/orders/${r.orderId}` : "/dashboard",
        time: r.occurredAt,
        read: false
      });
    });

    // Transporter assignment notifications
    (orders ?? []).filter((o) => o.assignedTo).forEach((order) => {
      const t = managedUsers.find((u) => u.username === order.assignedTo);
      items.push({
        id: `asgn-${order.id}`,
        type: "order",
        icon: Truck,
        iconBg: "bg-[#0D9488]",
        title: `Pedido #${order.id} asignado`,
        detail: `Transportista ${t?.name ?? order.assignedTo} asignado al pedido.`,
        link: `/orders/${order.id}`,
        time: new Date(Date.now() - 120000).toISOString(),
        read: true
      });
    });

    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [orders, shipments, systemRecords]);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (clearedIds.has(n.id)) return false;
      if (filter !== "all" && n.type !== filter) return false;
      if (criticalOnly && n.type !== "inventory") return false;
      if (search && !`${n.title} ${n.detail}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [notifications, filter, search, clearedIds, criticalOnly]);

  const unreadCount = filtered.filter((n) => !readIds.has(n.id) && !n.read).length;

  function markAsRead(id: string) {
    setReadIds((prev) => new Set([...prev, id]));
  }

  function markAllRead() {
    setReadIds(new Set(filtered.map((n) => n.id)));
  }

  function clearOne(id: string) {
    setClearedIds((prev) => new Set([...prev, id]));
  }

  function clearAll() {
    setClearedIds(new Set(filtered.map((n) => n.id)));
  }

  async function clearDatabase() {
    if (!confirm("Esto eliminara todo el historial de notificaciones de la base de datos. Continuar?")) return;
    try {
      await apiFetch("/api/notifications", { method: "DELETE" });
      clearHistory();
      localStorage.removeItem("logify-pos-cart:v1");
      setClearedIds(new Set(notifications.map((n) => n.id)));
      alert("Base de datos de notificaciones vaciada correctamente.");
    } catch {
      alert("Error al vaciar la base de datos.");
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Ahora";
    if (mins < 60) return `Hace ${mins} min`;
    if (hrs < 24) return `Hace ${hrs}h`;
    if (days === 1) return "Ayer";
    return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172554]">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-[#64748B]">
            {unreadCount} sin leer de {filtered.length} notificaciones
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canViewAlerts && (
            <>
              <button type="button"
                onClick={checkWeatherAlert}
                disabled={weatherLoading}
                className="rounded border border-[#2563EB]/30 bg-[#2563EB]/5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10 flex items-center gap-1 disabled:opacity-50"
              >
                <Cloud className="h-3 w-3" /> {weatherLoading ? "Consultando..." : "Verificar clima"}
              </button>
              <button type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#172554] flex items-center gap-1 disabled:opacity-50"
              >
                <Download className="h-3 w-3" /> {pdfLoading ? "Generando..." : "PDF"}
              </button>
            </>
          )}
          {canManageNotifications && (
          <button type="button"
            onClick={clearDatabase}
            className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Vaciar BD
          </button>
          )}
          <button type="button"
            onClick={markAllRead}
            className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#F8FAFC]"
          >
            Marcar todas leídas
          </button>
          <button type="button"
            onClick={clearAll}
            className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
          >
            Limpiar todas
          </button>
        </div>
      </div>

      {weatherAlert && (
        <div className={cn(
          "flex items-start gap-3 rounded border px-4 py-3",
          weatherAlert.alert ? "border-red-200 bg-red-50" : "border-[#0D9488]/30 bg-[#0D9488]/5"
        )}>
          {weatherAlert.alert
            ? <CloudRain className="h-5 w-5 text-red-500 shrink-0" />
            : <Cloud className="h-5 w-5 text-[#0D9488] shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-bold", weatherAlert.alert ? "text-red-600" : "text-[#0D9488]")}>
              {weatherAlert.alert ? "Alerta climática activa" : "Sin alertas climáticas"}
            </p>
            <p className="text-xs text-[#64748B] mt-0.5">{weatherAlert.message}</p>
            <p className="text-[10px] text-[#64748B]/70 mt-1">
              {weatherAlert.weather.temperature}°C · viento {weatherAlert.weather.windSpeed} km/h · precipitación {weatherAlert.weather.precipitation} mm
            </p>
          </div>
          <button type="button" onClick={() => setWeatherAlert(null)} className="shrink-0 rounded p-1 text-[#64748B] hover:bg-black/5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded border border-[#E2E8F0] bg-white p-0.5 overflow-x-auto scroll-x">
            {typeFilters.map((f) => (
              <button type="button"
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                  filter === f.value
                    ? "bg-[#2563EB] text-white"
                    : "text-[#64748B] hover:text-[#172554]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button type="button"
            onClick={() => setCriticalOnly(!criticalOnly)}
            className={cn(
              "rounded border px-3 py-1.5 text-xs font-semibold transition-colors",
              criticalOnly
                ? "border-red-300 bg-red-50 text-red-600"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:text-red-500"
            )}
          >
            Solo criticas
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar notificaciones..."
            className="h-9 border-[#E2E8F0] bg-[#F8FAFC] pl-9 text-sm"
          />
        </div>
      </div>

      {/* Notifications list */}
      <div className="space-y-1">
        {filtered.length > 0 ? (
          filtered.map((n) => (
            <Link
              key={n.id}
              to={n.link}
              onClick={() => markAsRead(n.id)}
              className={cn(
                "flex items-start gap-3 rounded border border-[#E2E8F0] bg-white px-4 py-3 transition hover:bg-[#F8FAFC]",
                !readIds.has(n.id) && !n.read ? "border-l-2 border-l-[#2563EB]" : ""
              )}
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.iconBg)}>
                <n.icon className="h-4 w-4 text-white" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-sm", !readIds.has(n.id) && !n.read ? "font-bold text-[#172554]" : "text-[#172554]")}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-[#64748B]">{formatTime(n.time)}</span>
                </div>
                <p className="mt-0.5 text-xs text-[#64748B]">{n.detail}</p>
              </div>

              <button type="button"
                onClick={(e) => { e.preventDefault(); clearOne(n.id); }}
                className="shrink-0 self-center rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Link>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded border border-[#E2E8F0] bg-white py-16">
            <Inbox className="h-10 w-10 text-[#E2E8F0]" />
            <p className="mt-3 text-sm font-medium text-[#64748B]">Sin notificaciones</p>
            <p className="mt-1 text-xs text-[#64748B]/70">No hay notificaciones que coincidan con el filtro actual.</p>
          </div>
        )}
      </div>
    </div>
  );
}
