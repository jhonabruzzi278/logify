import { useState } from "react";
import { X } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { adaptCashSession } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiCashSession, ApiSalesCloseSummary } from "@/types/api";
import type { CashSession } from "@/types/domain";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit: "Débito",
  credit: "Fiado",
};

interface CloseRegisterModalProps {
  onClose: () => void;
  onClosed?: () => void;
}

export function CloseRegisterModal({ onClose, onClosed }: CloseRegisterModalProps) {
  const { data, loading, error } = useApiQuery<ApiSalesCloseSummary, ApiSalesCloseSummary>({
    path: "/api/sales/close-summary",
    transform: (r) => r,
  });

  const { data: activeSession, refresh: refreshSession } = useApiQuery<ApiCashSession | null, CashSession | null>({
    path: "/api/cash-sessions/active",
    transform: (r) => (r ? adaptCashSession(r) : null),
  });

  const [countedAmount, setCountedAmount] = useState("");
  const [closeError, setCloseError] = useState("");
  const [closing, setClosing] = useState(false);
  const [closedResult, setClosedResult] = useState<CashSession | null>(null);

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    setCloseError("");
    const amount = Number(countedAmount);
    if (!Number.isFinite(amount) || amount < 0) { setCloseError("Ingresa un monto válido"); return; }
    if (!activeSession) return;
    setClosing(true);
    try {
      const raw = await apiFetch<ApiCashSession>(`/api/cash-sessions/${activeSession.id}/close`, {
        method: "PUT", body: JSON.stringify({ countedAmount: amount }),
      });
      setClosedResult(adaptCashSession(raw));
      refreshSession();
      onClosed?.();
    } catch (err) {
      setCloseError(err instanceof ApiRequestError ? err.message : "No se pudo cerrar la caja");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Cierre de caja</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Calculando...</p>}
        {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        {data && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{data.date}</p>
            {data.summary.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas registradas hoy</p>
            ) : (
              <div className="divide-y divide-border rounded border border-border">
                {data.summary.map((row) => (
                  <div key={row.paymentMethod} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">{PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}</span>
                    <span className="text-xs text-muted-foreground">{row.count} venta(s)</span>
                    <span className="font-semibold text-foreground">{formatCurrency(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded bg-[#4B98CF]/10 px-3 py-2.5">
              <span className="text-sm font-bold text-foreground">Total del día (todos los medios de pago)</span>
              <span className="text-lg font-bold text-[#4B98CF]">{formatCurrency(data.grandTotal)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Este total incluye todas las ventas de hoy. El efectivo esperado para tu caja (abajo, al cerrar) solo cuenta ventas en efectivo desde que la abriste.
            </p>
          </div>
        )}

        {closedResult ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Esperado</span>
              <span className="font-semibold text-foreground">{formatCurrency(closedResult.expectedAmount ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Contado</span>
              <span className="font-semibold text-foreground">{formatCurrency(closedResult.countedAmount ?? 0)}</span>
            </div>
            <div className={`flex items-center justify-between rounded px-3 py-2.5 ${(closedResult.difference ?? 0) === 0 ? "bg-[#4EB4A5]/10" : "bg-amber-50"}`}>
              <span className="text-sm font-bold text-foreground">Diferencia</span>
              <span className={`text-lg font-bold ${(closedResult.difference ?? 0) === 0 ? "text-[#4EB4A5]" : "text-amber-600"}`}>
                {(closedResult.difference ?? 0) > 0 ? "+" : ""}{formatCurrency(closedResult.difference ?? 0)}
              </span>
            </div>
            <p className="text-center text-xs text-muted-foreground">Caja cerrada correctamente.</p>
          </div>
        ) : activeSession ? (
          <form onSubmit={handleCloseSession} className="mt-3 space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monto inicial</span>
              <span className="font-semibold text-foreground">{formatCurrency(activeSession.openingAmount)}</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground">Monto contado en caja</label>
              <Input type="number" min="0" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} placeholder="0" className="h-9 text-sm" />
            </div>
            {closeError && <p className="text-xs text-red-500">{closeError}</p>}
            <Button type="submit" size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-white" disabled={closing}>
              {closing ? "Cerrando..." : "Cerrar caja"}
            </Button>
          </form>
        ) : (
          <p className="mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground">
            No tienes una caja abierta — este es solo el resumen de ventas del día.
          </p>
        )}
      </div>
    </div>
  );
}
