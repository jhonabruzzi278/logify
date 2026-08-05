import { useEffect, useRef, useState } from "react";
import { Bell, CreditCard, LogOut, Menu, MoreVertical, Truck, User } from "lucide-react";
import { Link } from "react-router-dom";
import { getDefaultPathForRole } from "@/app/access";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

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

interface Notification {
  id: string;
  avatar: "order" | "shipment" | "inventory" | "user";
  avatarInitials?: string;
  avatarClass?: string;
  message: string;
  time: string;
}

export function Topbar({ title, onMenu, onLogout, role, sessionName, sessionUsername }: TopbarProps) {
  const { mode, toggleMode } = useBusinessMode();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const notifications: Notification[] = [
    {
      id: "1",
      avatar: "order",
      message: "Nuevo pedido #5 creado y confirmado",
      time: "Hace 1 min",
    },
    {
      id: "2",
      avatar: "shipment",
      avatarInitials: "EN",
      avatarClass: "bg-[#4B98CF]",
      message: "Envío TRACK-C9F68B15 en transito",
      time: "Hace 5 min",
    },
    {
      id: "3",
      avatar: "inventory",
      avatarClass: "bg-[#4EB4A5]",
      message: "Stock crítico: SKU 100004 solo 5 unids",
      time: "Hace 10 min",
    },
    {
      id: "4",
      avatar: "user",
      avatarInitials: "OP",
      avatarClass: "bg-purple-500",
      message: "Operaciones aprobo 3 pedidos",
      time: "Hace 30 min",
    },
  ];

  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-[#1A3142] px-4 text-white sm:px-6">
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
          <span className={cn("rounded-full px-1.5 py-1 transition-colors sm:px-2.5", mode === "b2b" ? "bg-[#4B98CF] text-white" : "text-white/60")}>B2B</span>
          <span className={cn("rounded-full px-1.5 py-1 transition-colors sm:px-2.5", mode === "b2c" ? "bg-[#4EB4A5] text-white" : "text-white/60")}>B2C</span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifyRef}>
          <button
            type="button"
            onClick={() => { setNotifyOpen(!notifyOpen); setProfileOpen(false); }}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-6 w-6" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#CF4B4B]" />
          </button>

          {notifyOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded border border-[#DCE0E2] bg-white shadow-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold text-[#112b4a]">Notifications</span>
                <button className="text-xs text-[#6B7280] hover:text-[#112b4a]">Clear all</button>
              </div>

              <div className="max-h-[280px] overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="flex gap-3 border-b border-[#ECEEF0] px-4 py-3 last:border-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5F7F9]">
                      {n.avatar === "order" && <MoreVertical className="h-4 w-4 text-[#4B98CF]" />}
                      {n.avatar === "shipment" && <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white", n.avatarClass)}>{n.avatarInitials}</span>}
                      {n.avatar === "inventory" && <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white", n.avatarClass)}>!</span>}
                      {n.avatar === "user" && <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white", n.avatarClass)}>{n.avatarInitials}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#112b4a]">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#ECEEF0] px-4 py-2.5 text-center">
                <Link to="/notifications" onClick={() => setNotifyOpen(false)} className="text-xs font-semibold text-[#4B98CF] hover:text-[#346384]">View All</Link>
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E3AA75] text-xs font-bold text-white">
              {roleInitial[role]}
            </div>
            <span className="hidden text-sm font-medium sm:inline">{sessionName.split(" ")[0]}</span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-[#DCE0E2] bg-white shadow-lg">
              <div className="px-4 py-3">
                <p className="text-sm font-bold text-[#112b4a]">{sessionName}</p>
                <p className="text-xs text-[#6B7280]">{sessionUsername}</p>
              </div>

              <div className="border-t border-[#ECEEF0]" />

              <Link
                to={getDefaultPathForRole(role)}
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#112b4a] hover:bg-[#F5F7F9]"
              >
                <User className="h-4 w-4 text-[#6B7280]" />
                Dashboard
              </Link>

              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#112b4a] hover:bg-[#F5F7F9]"
              >
                <User className="h-4 w-4 text-[#6B7280]" />
                Mi perfil
              </Link>

              <Link
                to="/billing"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#112b4a] hover:bg-[#F5F7F9]"
              >
                <CreditCard className="h-4 w-4 text-[#6B7280]" />
                Plan y facturación
              </Link>

              <div className="border-t border-[#ECEEF0]" />

              <button
                type="button"
                onClick={() => { setProfileOpen(false); onLogout(); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-[#F5F7F9]"
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
