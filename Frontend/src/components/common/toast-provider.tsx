import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { AlertTriangle, CheckCircle, Info, X, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "shipment";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: { label: string; href: string };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
  shipment: Truck,
};

const colors: Record<ToastType, string> = {
  success: "border-[#0D9488] bg-[#0D9488]/10",
  error: "border-red-400 bg-red-50",
  info: "border-[#2563EB] bg-[#2563EB]/10",
  shipment: "border-purple-400 bg-purple-50",
};

const iconColors: Record<ToastType, string> = {
  success: "text-[#0D9488]",
  error: "text-red-500",
  info: "text-[#2563EB]",
  shipment: "text-purple-500",
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => removeToast(id), 6000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg animate-in slide-in-from-right",
                colors[toast.type]
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", iconColors[toast.type])} />
              <p className="flex-1 text-xs text-foreground">{toast.message}</p>
              {toast.action && (
                <a href={toast.action.href} className="text-xs font-semibold text-[#2563EB] hover:underline shrink-0">
                  {toast.action.label}
                </a>
              )}
              <button type="button" onClick={() => removeToast(toast.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
