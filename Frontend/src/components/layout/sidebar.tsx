import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { getDefaultPathForRole } from "@/app/access";
import { getVisibleNavItems } from "@/components/layout/navigation";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

const STORAGE_KEY = "logify-sidebar-collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({ role }: { role: Role }) {
  const { mode } = useBusinessMode();
  const items = getVisibleNavItems(role, mode);
  const homePath = getDefaultPathForRole(role);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage no disponible (modo privado); el estado sigue funcionando en memoria.
      }
      return next;
    });
  }

  return (
    <aside className={cn("hidden shrink-0 bg-[#1A3142] text-white lg:flex lg:flex-col transition-[width] duration-200", collapsed ? "w-[72px]" : "w-64")}>
      <div className="px-5 py-6">
        <Link to={homePath} className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10">
            <span className="text-base font-bold text-white">S</span>
          </div>
          {!collapsed && (
            <div>
              <p className="text-base font-bold text-white">Logify</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.title : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-[#4B98CF] text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          className={cn(
            "flex w-full items-center gap-2 rounded px-3 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronsRight className="h-5 w-5 shrink-0" /> : <ChevronsLeft className="h-5 w-5 shrink-0" />}
          {!collapsed && <span>Contraer menú</span>}
        </button>
      </div>
    </aside>
  );
}
