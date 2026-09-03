import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Barcode, Boxes, Check, Minus, PackageSearch, Plus, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { useApiQuery } from "@/hooks/use-api-query";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptInventory } from "@/lib/api-adapters";
import { cn } from "@/lib/utils";
import type { ApiInventory } from "@/types/api";
import type { Product } from "@/types/domain";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { ApiErrorBanner } from "@/components/common/api-error-banner";

export function ScanPage() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState<number | null>(null);

  const { can } = usePermissions();
  const canAdjust = can("inventory.adjust");
  const { data: inventory, loading, error, refresh } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory",
    transform: (response) => response.map(adaptInventory),
  });
  const { operationalInventory, adjustInventory } = useOperationalWorkspace({ inventory });

  const product = useMemo(() => {
    const normalized = scannedCode.trim().toLowerCase();
    if (!normalized) return null;
    return operationalInventory.find((item) =>
      item.sku.trim().toLowerCase() === normalized || item.barcode?.trim().toLowerCase() === normalized
    ) ?? null;
  }, [operationalInventory, scannedCode]);

  const handleDetected = useCallback((code: string) => {
    setScannedCode(code);
    setAdjusted(null);
    setScannerOpen(false);
  }, []);

  async function handleAdjust(delta: number) {
    if (!product || adjusting) return;
    setAdjusting(true);
    try {
      await adjustInventory(product, delta, "Ajuste desde escáner móvil");
      setAdjusted(delta);
      await refresh();
    } finally {
      setAdjusting(false);
    }
  }

  function scanAgain() {
    setScannedCode("");
    setAdjusted(null);
    setScannerOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-3">
      {error && <ApiErrorBanner error={error} onRetry={refresh} />}

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Inventario móvil</p>
          <h1 className="mt-0.5 text-2xl font-bold text-[#172554]">Escanear código</h1>
          <p className="mt-1 max-w-md text-sm text-[#64748B]">Encuentra un producto por su código de barras o SKU y actualiza el stock en segundos.</p>
        </div>
        <Link to="/inventory" className="hidden items-center gap-1 text-sm font-semibold text-[#2563EB] sm:flex">Ver inventario <ArrowRight className="h-4 w-4" /></Link>
      </div>

      {!scannedCode ? (
        <section className="scan-entry overflow-hidden rounded-2xl border border-[#BFDBFE] bg-white">
          <button type="button" onClick={() => setScannerOpen(true)} className="group flex min-h-[430px] w-full flex-col items-center justify-center px-7 py-12 text-center sm:min-h-[500px]">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[#DBEAFE] transition duration-300 group-hover:scale-105 group-active:scale-95">
              <span className="absolute inset-6 rounded-full border border-[#93C5FD]" />
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-[0_14px_32px_rgba(37,99,235,.28)]">
                <ScanLine className="h-11 w-11" />
              </span>
            </div>
            <h2 className="mt-10 text-xl font-bold text-[#172554]">Presiona para escanear</h2>
            <p className="mt-2 max-w-xs text-sm text-[#64748B]">Usaremos la cámara trasera. También podrás ingresar el código manualmente.</p>
          </button>
        </section>
      ) : product ? (
        <section className="scan-result-in rounded-2xl border border-[#BFDBFE] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Check className="h-6 w-6" /></span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[1px] text-emerald-700">Producto encontrado</p>
              <h2 className="truncate text-lg font-bold text-[#172554]">{product.name}</h2>
            </div>
          </div>

          <div className="grid gap-5 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="space-y-2">
              <div className="flex min-w-0 items-center gap-2 text-sm text-[#64748B]"><Barcode className="h-4 w-4 shrink-0" /><span className="shrink-0">SKU</span><strong className="min-w-0 break-all font-mono text-[#172554]">{product.sku}</strong></div>
              {product.barcode && <div className="flex min-w-0 items-center gap-2 text-sm text-[#64748B]"><ScanLine className="h-4 w-4 shrink-0" /><span className="shrink-0">Código</span><strong className="min-w-0 break-all font-mono text-[#172554]">{product.barcode}</strong></div>}
              <div className="flex items-center gap-2 text-sm text-[#64748B]"><Boxes className="h-4 w-4" /><span>Stock disponible</span></div>
              <p className={cn("text-4xl font-bold", product.stock <= 5 ? "text-red-500" : "text-[#172554]")}>{product.stock} <span className="text-sm font-semibold text-[#64748B]">unidades</span></p>
            </div>

            {canAdjust && (
              <div className="flex items-center justify-center gap-3 rounded-xl bg-[#F8FAFC] p-3">
                <button type="button" disabled={adjusting || product.stock <= 0} onClick={() => handleAdjust(-1)} aria-label="Restar una unidad" className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-red-500 transition active:scale-95 disabled:opacity-40"><Minus className="h-5 w-5" /></button>
                <span className="min-w-20 text-center text-sm font-bold text-[#172554]">Ajustar</span>
                <button type="button" disabled={adjusting} onClick={() => handleAdjust(1)} aria-label="Agregar una unidad" className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#2563EB] text-white shadow-sm transition active:scale-95 disabled:opacity-40"><Plus className="h-5 w-5" /></button>
              </div>
            )}
          </div>

          {adjusted !== null && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">Stock actualizado {adjusted > 0 ? "+1" : "−1"}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={scanAgain} className="btn-touch-primary gap-2"><ScanLine className="h-5 w-5" /> Escanear otro</button>
            <Link to={`/inventory/${encodeURIComponent(product.sku)}`} className="btn-touch-outline gap-2">Ver ficha del producto <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      ) : (
        <section className="scan-result-in rounded-2xl border border-amber-200 bg-white px-6 py-10 text-center shadow-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600"><PackageSearch className="h-8 w-8" /></span>
          <h2 className="mt-5 text-xl font-bold text-[#172554]">Producto no encontrado</h2>
          <p className="mt-2 break-words text-sm text-[#64748B]">No existe un producto con el código <strong className="break-all font-mono text-[#172554]">{scannedCode}</strong>.</p>
          <button type="button" onClick={scanAgain} className="btn-touch-primary mt-6 w-full gap-2 sm:mx-auto sm:w-auto"><ScanLine className="h-5 w-5" /> Intentar nuevamente</button>
        </section>
      )}

      {loading && !inventory && <p className="text-center text-sm text-[#64748B]">Cargando inventario…</p>}

      {scannerOpen && <BarcodeScannerModal title="Escáner de inventario" onDetected={handleDetected} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}
