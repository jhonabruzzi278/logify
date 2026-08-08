import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExtraType = "discount" | "surcharge";
type ExtraMode = "percentage" | "fixed";

interface ExtrasModalProps {
  subtotal: number;
  onApply: (label: string, amount: number) => void;
  onClose: () => void;
}

export function ExtrasModal({ subtotal, onApply, onClose }: ExtrasModalProps) {
  const [type, setType] = useState<ExtraType>("discount");
  const [mode, setMode] = useState<ExtraMode>("percentage");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const amount = useMemo(() => {
    const raw = Number(value) || 0;
    const magnitude = mode === "percentage" ? Math.round((subtotal * raw) / 100) : Math.round(raw);
    return type === "discount" ? -magnitude : magnitude;
  }, [value, mode, type, subtotal]);

  function handleApply() {
    setError("");
    const raw = Number(value);
    if (!raw || raw <= 0) { setError("Ingresa un valor mayor a 0"); return; }
    if (mode === "percentage" && raw > 100) { setError("El porcentaje no puede ser mayor a 100"); return; }
    onApply(type === "discount" ? "Descuento" : "Recargo", amount);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Gestionar Extras</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">Subtotal</span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(subtotal)}</span>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 rounded border border-border p-0.5">
            {([["discount", "Descuento"], ["surcharge", "Recargo"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                className={cn("flex-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors", type === v ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded border border-border p-0.5">
            {([["percentage", "Porcentaje"], ["fixed", "Monto fijo"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={cn("flex-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors", mode === v ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground">
              {mode === "percentage" ? "Porcentaje (%)" : "Monto"}
            </label>
            <Input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "percentage" ? "10" : "1000"} className="h-9 text-sm" autoFocus />
          </div>

          {value && !error && (
            <div className="flex items-center justify-between rounded bg-[#4B98CF]/10 px-3 py-2">
              <span className="text-xs text-muted-foreground">Nuevo total</span>
              <span className="text-sm font-bold text-foreground">{formatCurrency(subtotal + amount)}</span>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="button" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" onClick={handleApply}>
              Aplicar {type === "discount" ? "Descuento" : "Recargo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
