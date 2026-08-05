import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getVisibleNavItems } from "@/components/layout/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useBusinessMode } from "@/hooks/use-business-mode";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function AppShell() {
  const { pathname } = useLocation();
  const { session, logout } = useAuth();
  const { mode } = useBusinessMode();
  const isOnline = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const visibleItems = useMemo(() => (session ? getVisibleNavItems(session.role, mode) : []), [session, mode]);

  const currentTitle = useMemo(() => {
    return visibleItems.find((item) => pathname.startsWith(item.path))?.title ?? "Dashboard";
  }, [pathname, visibleItems]);

  useEffect(() => {
    setOpen(false);
    const node = mainRef.current;
    if (!node) return;
    node.scrollTo({ top: 0 });
    node.focus({ preventScroll: true });
  }, [pathname]);

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar role={session.role} />

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div role="dialog" aria-modal="true" aria-label="Navegación" className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-[#1A3142] p-4 pt-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Navegacion</p>
              <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors ${
                      isActive ? "bg-[#4B98CF] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.title}
                </NavLink>
              ))}
              <button
                onClick={logout}
                className="mt-4 flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cerrar sesión
              </button>
            </nav>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={currentTitle} onMenu={() => setOpen(true)} onLogout={logout} role={session.role} sessionName={session.name} sessionUsername={session.username} />

        {!isOnline && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-700">
            Sin conexion a internet. Mostrando datos locales.
          </div>
        )}

        <main
          ref={mainRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4 pb-28 outline-none sm:px-6 lg:px-8 lg:py-6 lg:pb-6"
        >
          <div className="mx-auto max-w-[1300px] space-y-5">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav role={session.role} />
    </div>
  );
}
