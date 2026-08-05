import { Link, NavLink } from "react-router-dom";
import { getDefaultPathForRole } from "@/app/access";
import { getVisibleNavItems } from "@/components/layout/navigation";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

export function Sidebar({ role }: { role: Role }) {
  const { mode } = useBusinessMode();
  const items = getVisibleNavItems(role, mode);
  const homePath = getDefaultPathForRole(role);

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-hidden bg-[#1A3142] text-white lg:flex">
      <div className="shrink-0 px-5 py-6">
        <Link to={homePath} className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10">
            <span className="text-base font-bold text-white">S</span>
          </div>
          <p className="text-base font-bold text-white">Logify</p>
        </Link>
      </div>

      <nav aria-label="Navegación principal" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                isActive
                  ? "bg-[#4B98CF] text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
