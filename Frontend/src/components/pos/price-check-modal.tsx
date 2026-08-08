import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/domain";

interface PriceCheckModalProps {
  products: Product[];
  onClose: () => void;
}

export function PriceCheckModal({ products, onClose }: PriceCheckModalProps) {
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 10);
  }, [products, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Consultar precio</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Escanea o busca un producto..."
            autoFocus
            className="h-9 w-full rounded border border-input bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {search && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
          )}
          {results.map((p) => (
            <div key={p.sku} className="flex items-center justify-between rounded border border-border px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.sku} · {p.stock} unid.</p>
              </div>
              <span className="shrink-0 text-base font-bold text-[#4B98CF]">{formatCurrency(p.price)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
