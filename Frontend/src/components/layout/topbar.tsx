import { useEffect, useRef, useState } from "react";
import { Bell, CreditCard, LogOut, Menu, Package, Truck, User } from "lucide-react";
import { Link } from "react-router-dom";
import { getDefaultPathForRole } from "@/app/access";
import { useApiQuery } from "@/hooks/use-api-query";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { cn } from "@/lib/utils";
import type { ApiNotificationRecord } from "@/types/api";
import type { Role } from "@/types/domain";

const NOTIF_SEEN_KEY = "logify-topbar-notifications-seen-at";

interface TopbarProps {
  title: string;
  onMenu: () => void;
  onLogout: () => void;
  role: Role;
  sessionName: string;
  sessionUsername: string;
}

const roleLabel: Record<Role, string> = {
  owner: "Administrador",
  ops: "Operaciones",
  warehouse: "Bodega",
  support: "Soporte",
  customer: "Cliente",
  shipper: "Transportista",
  vendor: "Vendedor"
};

const roleInitial: Record<Role, string> = {
  owner: "AD",
  ops: "OP",
  warehouse: "BO",
  support: "SO",
  customer: "CL",
  shipper: "TR",
  vendor: "VE"
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export function Topbar({ title, onMenu, onLogout, role, sessionName, sessionUsername }: TopbarProps) {
  const { mode, toggleMode } = useBusinessMode();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => localStorage.getItem(NOTIF_SEEN_KEY) ?? "");
  const notifyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useApiQuery<ApiNotificationRecord[], ApiNotificationRecord[]>({
    path: "/api/notifications/audience/OPERATOR",
    transform: (response) => response
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 5)
  });

  const hasUnread = (notifications ?? []).some((n) => !lastSeenAt || new Date(n.occurredAt).getTime() > new Date(lastSeenAt).getTime());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifyRef.current && !notifyRef.current.contains(event.target as Node)) {
        setNotifyOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleNotifications() {
    const next = !notifyOpen;
    setNotifyOpen(next);
    setProfileOpen(false);
    if (next) {
      const now = new Date().toISOString();
      localStorage.setItem(NOTIF_SEEN_KEY, now);
      setLastSeenAt(now);
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-[#172554] px-4 text-white sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-base font-bold text-white lg:text-lg">{title}</h2>
      </div>

      <div className="flex items-center gap-1">
        {/* Toggle modo de negocio */}
        <button
          type="button"
          onClick={toggleMode}
          title={mode === "b2b" ? "Cambiar a modo B2C (venta al público)" : "Cambiar a modo B2B (pedidos empresariales)"}
          className="mr-0.5 flex items-center gap-0.5 rounded-full bg-white/10 p-0.5 text-[10px] font-bold sm:mr-1 sm:text-[11px]"
        >
          <span className={cn("rounded-full px-1.5 py-1 transition-colors sm:px-2.5", mode === "b2b" ? "bg-[#2563EB] text-white" : "text-white/60")}>B2B</span>
          <span className={cn("rounded-full px-1.5 py-1 transition-colors sm:px-2.5", mode === "b2c" ? "bg-[#0D9488] text-white" : "text-white/60")}>B2C</span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifyRef}>
          <button
            type="button"
            onClick={toggleNotifications}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-6 w-6" />
            {hasUnread && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#DC2626]" />}
          </button>

          {notifyOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded border border-[#E2E8F0] bg-white shadow-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold text-[#172554]">Notificaciones</span>
              </div>

              <div className="max-h-[280px] overflow-y-auto">
                {(notifications ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-[#64748B]">Sin notificaciones nuevas</p>
                ) : (
                  (notifications ?? []).map((n) => {
                    const isStockAlert = n.stage === "STOCK_ALERT";
                    return (
                      <div key={n.id} className="flex gap-3 border-b border-[#E2E8F0] px-4 py-3 last:border-0">
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white", isStockAlert ? "bg-red-500" : "bg-[#2563EB]")}>
                          {isStockAlert ? <Package className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#172554]">{n.message}</p>
                          <p className="mt-0.5 text-[11px] text-[#64748B]">{formatRelativeTime(n.occurredAt)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-[#E2E8F0] px-4 py-2.5 text-center">
                <Link to="/notifications" onClick={() => setNotifyOpen(false)} className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8]">Ver todas</Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative ml-1" ref={profileRef}>
          <button
            type="button"
            onClick={() => { setProfileOpen(!profileOpen); setNotifyOpen(false); }}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D97706] text-xs font-bold text-white">
              {roleInitial[role]}
            </div>
            <span className="hidden text-sm font-medium sm:inline">{sessionName.split(" ")[0]}</span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-[#E2E8F0] bg-white shadow-lg">
              <div className="px-4 py-3">
                <p className="text-sm font-bold text-[#172554]">{sessionName}</p>
                <p className="text-xs text-[#64748B]">{sessionUsername}</p>
              </div>

              <div className="border-t border-[#E2E8F0]" />

              <Link
                to={getDefaultPathForRole(role)}
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#172554] hover:bg-[#F8FAFC]"
              >
                <User className="h-4 w-4 text-[#64748B]" />
                Dashboard
              </Link>

              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#172554] hover:bg-[#F8FAFC]"
              >
                <User className="h-4 w-4 text-[#64748B]" />
                Mi perfil
              </Link>

              <Link
                to="/billing"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#172554] hover:bg-[#F8FAFC]"
              >
                <CreditCard className="h-4 w-4 text-[#64748B]" />
                Plan y facturación
              </Link>

              <div className="border-t border-[#E2E8F0]" />

              <button
                type="button"
                onClick={() => { setProfileOpen(false); onLogout(); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-[#F8FAFC]"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
