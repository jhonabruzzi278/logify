import { useState } from "react";
import { X } from "lucide-react";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OpenRegisterModalProps {
  onOpened: () => void;
  onClose: () => void;
}

export function OpenRegisterModal({ onOpened, onClose }: OpenRegisterModalProps) {
  const [openingAmount, setOpeningAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = Number(openingAmount);
    if (!openingAmount || !Number.isFinite(amount) || amount < 0) { setError("Ingresa un monto válido"); return; }
    setSaving(true);
    try {
      await apiFetch("/api/cash-sessions", { method: "POST", body: JSON.stringify({ openingAmount: amount }) });
      onOpened();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No se pudo abrir la caja");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Abrir caja</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="open-register-modal-f44" className="text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground">Monto inicial en caja</label>
            <Input id="open-register-modal-f44" type="number" min="0" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="50000" className="h-9 text-sm" autoFocus />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" className="bg-[#0D9488] hover:bg-[#0D9488] text-white" disabled={saving}>{saving ? "Abriendo..." : "Abrir caja"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
