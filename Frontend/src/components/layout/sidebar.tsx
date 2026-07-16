import { Link, NavLink } from "react-router-dom";
import { getDefaultPathForRole } from "@/app/access";
import { getVisibleNavItems } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

export function Sidebar({ role }: { role: Role }) {
  const items = getVisibleNavItems(role);
  const homePath = getDefaultPathForRole(role);

  return (
    <aside className="hidden w-64 shrink-0 bg-[#1A3142] text-white lg:flex lg:flex-col">
      <div className="px-5 py-6">
        <Link to={homePath} className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10">
            <span className="text-base font-bold text-white">S</span>
          </div>
          <div>
            <p className="text-base font-bold text-white">Logify</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors",
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

      <div className="border-t border-white/10 px-5 py-4">
        <div className="rounded bg-white/5 px-4 py-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-white/60">
            Almacenamiento
          </p>
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-white/10">
              <div
                className="h-1.5 rounded-full bg-[#4EB4A5]"
                style={{ width: "60%" }}
              />
            </div>
            <p className="mt-1 text-xs text-white/50">
              6.2 GB / 10 GB usado
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
