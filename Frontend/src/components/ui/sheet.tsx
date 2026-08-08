import type { PropsWithChildren, ReactNode } from "react";
import { X } from "lucide-react";
import { cn, onEscapeKey } from "@/lib/utils";

interface SheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, description, side = "left", footer, children }: SheetProps) {
  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        aria-label="Cerrar"
        className={cn(
          "fixed inset-0 z-40 bg-foreground/30 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        onKeyDown={onEscapeKey(onClose)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 z-50 w-[88vw] max-w-sm border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-soft transition-transform lg:hidden",
          side === "left" ? "left-0" : "right-0",
          open ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full"
        )}
      >
        <div className="flex items-start justify-between border-b border-sidebar-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-sidebar-foreground/72">{description}</p> : null}
          </div>
          <button className="touch-target rounded-full bg-sidebar-accent text-sidebar-accent-foreground" onClick={onClose} type="button" aria-label="Cerrar">
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <div className="flex h-[calc(100%-89px)] flex-col justify-between overflow-y-auto">
          <div className="p-5">{children}</div>
          {footer ? <div className="border-t border-sidebar-border p-5">{footer}</div> : null}
        </div>
      </aside>
    </>
  );
}
