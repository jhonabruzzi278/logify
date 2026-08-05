import { NavLink, useMatch } from "react-router-dom";
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
        {items.map((item) => (
          <MobileNavItem key={item.path} path={item.path} label={item.mobileTitle ?? item.title} icon={item.icon} />
        ))}
      </div>
    </nav>
  );
}

function MobileNavItem({ path, label, icon: Icon }: { path: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const isActive = Boolean(useMatch({ path, end: true }));

  return (
    <NavLink
      to={path}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors flex-1",
        isActive ? "text-[#4B98CF]" : "text-muted-foreground"
      )}
    >
      <div
        className={cn(
          "flex h-[26px] w-[26px] items-center justify-center rounded-md transition-colors",
          isActive ? "bg-[#4B98CF]/10" : ""
        )}
      >
        <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-[#4B98CF]" : "")} />
      </div>
      <span className="text-center leading-tight">{label}</span>
    </NavLink>
  );
}
