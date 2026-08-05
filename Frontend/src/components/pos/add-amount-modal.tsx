import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddAmountModalProps {
  onAdd: (label: string, amount: number) => void;
  onClose: () => void;
}

export function AddAmountModal({ onAdd, onClose }: AddAmountModalProps) {
  const [label, setLabel] = useState("Varios");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  function handleConfirm() {
    setError("");
    const value = Number(amount);
    if (!value || value <= 0) { setError("Ingresa un monto mayor a 0"); return; }
    onAdd(label.trim() || "Varios", value);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Agregar monto al carrito</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Carga rápidamente un ítem con monto variable.</p>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground">Nombre</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Varios" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground">Monto</label>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm" autoFocus />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar (Esc)</Button>
            <Button type="button" size="sm" className="bg-[#4B98CF] hover:bg-[#346384] text-white" onClick={handleConfirm}>Confirmar (Enter)</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
