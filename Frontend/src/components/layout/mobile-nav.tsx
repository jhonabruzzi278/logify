import { ScanLine } from "lucide-react";
import { NavLink, useMatch } from "react-router-dom";
import { hasPermission } from "@/app/access";
import { getVisibleNavItems } from "@/components/layout/navigation";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

export function MobileNav({ role }: { role: Role }) {
  const { mode } = useBusinessMode();
  const items = getVisibleNavItems(role, mode).filter((item) => item.mobile);

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-2px_12px_rgba(0,0,0,0.06)] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {items.map((item, index) => (
          <span key={item.path} className="contents">
            {index === 1 && hasPermission(role, "inventory.view") && <MobileNavItem path="/scan" label="Escanear" icon={ScanLine} featured />}
            <MobileNavItem path={item.path} label={item.mobileTitle ?? item.title} icon={item.icon} />
          </span>
        ))}
      </div>
    </nav>
  );
}

function MobileNavItem({ path, label, icon: Icon, featured = false }: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; featured?: boolean }) {
  const isActive = Boolean(useMatch({ path, end: true }));

  return (
    <NavLink
      to={path}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors flex-1",
        isActive ? "text-[#2563EB]" : "text-muted-foreground"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-md transition-all",
          featured ? "h-9 w-9 -mt-3 rounded-xl bg-[#2563EB] text-white shadow-[0_6px_14px_rgba(37,99,235,.28)]" : "h-[26px] w-[26px]",
          isActive && !featured ? "bg-[#2563EB]/10" : "",
          isActive && featured ? "ring-4 ring-[#DBEAFE]" : ""
        )}
      >
        <Icon className={cn("h-[18px] w-[18px] shrink-0", featured ? "text-white" : isActive ? "text-[#2563EB]" : "")} />
      </div>
      <span className="text-center leading-tight">{label}</span>
    </NavLink>
  );
}
