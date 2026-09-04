import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Minus, PackagePlus, Plus, ScanLine, Search, Trash2, TriangleAlert } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiQuery } from "@/hooks/use-api-query";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ApiInventorySession, ApiInventorySessionItem } from "@/types/api";

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

function QuantityEditor({
  item,
  busy,
  onUpdate,
}: {
  item: ApiInventorySessionItem;
  busy: boolean;
  onUpdate: (item: ApiInventorySessionItem, quantity: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(item.quantity));

  const parsed = Math.max(0, Number.parseInt(draft || "0", 10) || 0);
  async function commit(quantity: number) {
    setDraft(String(quantity));
    if (quantity !== item.quantity) await onUpdate(item, quantity);
  }

  return (
    <div className="flex items-center justify-end gap-2 pl-12 sm:pl-0">
      <button type="button" disabled={busy || parsed <= 0} onClick={() => commit(parsed - 1)} aria-label={`Restar una unidad de ${item.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#475569] disabled:opacity-40"><Minus className="h-4 w-4" /></button>
      <input type="number" min={0} inputMode="numeric" aria-label={`Cantidad de ${item.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => commit(parsed)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-11 w-20 rounded-lg border border-[#E2E8F0] text-center text-base font-bold text-[#172554] outline-none focus:border-[#2563EB]" />
      <button type="button" disabled={busy} onClick={() => commit(parsed + 1)} aria-label={`Sumar una unidad de ${item.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

export function InventorySessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastScanned, setLastScanned] = useState<ApiInventorySessionItem | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [confirmChanges, setConfirmChanges] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const path = sessionId ? `/api/inventory-sessions/${sessionId}` : "/api/inventory-sessions/invalid";
  const { data: session, loading, error, refresh } = useApiQuery<ApiInventorySession, ApiInventorySession>({
    path,
    transform: (response) => response,
    enabled: can("inventory.sessions.manage") && Boolean(sessionId),
  });

  const visibleItems = useMemo(() => {
    const items = session?.items ?? [];
    const normalized = query.trim().toLowerCase();
    const relevant = session?.type === "restock" ? items.filter((item) => item.scanned) : items;
    if (!normalized) return relevant;
    return relevant.filter((item) => `${item.name} ${item.sku} ${item.barcode ?? ""}`.toLowerCase().includes(normalized));
  }, [query, session]);

  const unscannedCount = session?.type === "count" ? (session.items ?? []).filter((item) => !item.scanned).length : 0;
  const changedCount = session?.type === "count" ? (session.items ?? []).filter((item) => item.stockChanged).length : 0;
  const progress = session?.totalProducts ? Math.round((session.scannedProducts / session.totalProducts) * 100) : 0;

  if (!can("inventory.sessions.manage")) return <Navigate to="/inventory" replace />;
  if (loading && !session) return <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent" /></div>;
  if (error && !session) return <div className="mx-auto max-w-lg py-20 text-center"><p className="text-sm text-red-600">{error}</p><Link to="/inventory/history" className="mt-4 inline-block text-sm font-bold text-[#2563EB]">Volver al historial</Link></div>;
  if (!session) return null;

  const isDraft = session.status === "draft";
  const isCount = session.type === "count";

  async function scanProduct(code: string) {
    setScannerOpen(false);
    setActionError(null);
    try {
      const item = await apiFetch<ApiInventorySessionItem>(`/api/inventory-sessions/${sessionId}/scan`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setLastScanned(item);
      refresh();
    } catch (scanError) {
      setLastScanned(null);
      setActionError(scanError instanceof Error ? scanError.message : "No se pudo registrar el producto");
    }
  }

  async function updateQuantity(item: ApiInventorySessionItem, quantity: number) {
    if (!sessionId || quantity < 0 || busySku) return;
    setBusySku(item.sku);
    setActionError(null);
    try {
      await apiFetch(`/api/inventory-sessions/${sessionId}/items/${encodeURIComponent(item.sku)}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });
      refresh();
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la cantidad");
    } finally {
      setBusySku(null);
    }
  }

  async function finalizeSession() {
    if (!sessionId) return;
    setFinishing(true);
    setActionError(null);
    try {
      await apiFetch(`/api/inventory-sessions/${sessionId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ confirmUnscannedAsZero: confirmMissing, confirmStockChanges: confirmChanges }),
      });
      setFinalizeOpen(false);
      refresh();
    } catch (finishError) {
      setActionError(finishError instanceof Error ? finishError.message : "No se pudo finalizar el inventario");
      setFinalizeOpen(false);
    } finally {
      setFinishing(false);
    }
  }

  async function cancelSession() {
    if (!sessionId) return;
    setFinishing(true);
    try {
      await apiFetch(`/api/inventory-sessions/${sessionId}`, { method: "DELETE" });
      navigate("/inventory/history");
    } catch (cancelError) {
      setActionError(cancelError instanceof Error ? cancelError.message : "No se pudo anular el inventario");
      setCancelOpen(false);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden px-1 pb-28 sm:px-2 sm:pb-8">
      <header className="flex min-w-0 items-start gap-3">
        <Link to="/inventory/history" aria-label="Volver al historial" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#172554]"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide", isCount ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-emerald-50 text-emerald-700")}>{isCount ? "Conteo físico" : "Agregar inventario"}</span>
            <span className={cn("rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide", session.status === "draft" ? "bg-amber-50 text-amber-700" : session.status === "finalized" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{session.status === "draft" ? "Borrador" : session.status === "finalized" ? "Finalizado" : "Anulado"}</span>
          </div>
          <h1 className="mt-2 break-words text-2xl font-bold text-[#172554]">{session.name}</h1>
          <p className="mt-1 text-sm text-[#64748B]">Inicio: {formatDate(session.startedAt)}{session.finalizedAt ? ` · Finalizado: ${formatDate(session.finalizedAt)}` : ""}</p>
        </div>
      </header>

      {isDraft && isCount ? (
        <section aria-label="Progreso del conteo" className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
          <div className="flex items-center justify-between gap-3 text-sm"><strong className="text-[#172554]">{session.scannedProducts} de {session.totalProducts} productos</strong><span className="font-bold text-[#2563EB]">{progress}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${progress}%` }} /></div>
        </section>
      ) : null}

      {lastScanned ? (
        <section role="status" className="flex min-w-0 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0"><p className="break-words font-bold text-emerald-900">{lastScanned.name}</p><p className="text-sm text-emerald-700">Cantidad registrada: {lastScanned.quantity}</p></div>
        </section>
      ) : null}
      {actionError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p> : null}

      {isDraft ? (
        <button type="button" onClick={() => setScannerOpen(true)} className="flex min-h-28 w-full items-center justify-center gap-3 rounded-2xl bg-[#2563EB] px-6 text-lg font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] active:scale-[0.99]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15"><ScanLine className="h-7 w-7" /></span>
          Escanear producto
        </button>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input aria-label="Buscar productos del inventario" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, SKU o código" className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#2563EB]" />
      </div>

      {visibleItems.length === 0 ? (
        <section className="rounded-xl border border-dashed border-[#CBD5E1] px-5 py-12 text-center"><PackagePlus className="mx-auto h-9 w-9 text-[#94A3B8]" /><p className="mt-3 font-bold text-[#172554]">{isCount ? "No se encontraron productos" : "Escanea la mercadería recibida"}</p></section>
      ) : (
        <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
          {visibleItems.map((item) => (
            <article key={item.sku} className={cn("grid min-w-0 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", isDraft && isCount && !item.scanned && "bg-slate-50/70")}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", item.scanned ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-slate-100 text-slate-400")}>{isCount ? <ClipboardCheck className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}</span>
                  <div className="min-w-0"><h2 className="break-words font-bold text-[#172554]">{item.name}</h2><p className="mt-0.5 break-all font-mono text-xs text-[#64748B]">{item.barcode || item.sku}</p></div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 pl-12 text-xs sm:max-w-md">
                  <span><span className="block text-[#94A3B8]">Inicial</span><strong className="text-sm text-[#172554]">{item.initialStock}</strong></span>
                  <span><span className="block text-[#94A3B8]">{isCount ? "Contado" : "Agregar"}</span><strong className="text-sm text-[#172554]">{item.quantity}</strong></span>
                  <span><span className="block text-[#94A3B8]">{isCount ? "Diferencia" : "Resultado"}</span><strong className={cn("text-sm", isCount && item.difference < 0 ? "text-red-600" : "text-emerald-700")}>{isCount ? `${item.difference > 0 ? "+" : ""}${item.difference}` : item.finalStock}</strong></span>
                </div>
                {item.stockChanged && isDraft ? <p className="mt-2 flex items-center gap-1 pl-12 text-xs font-semibold text-amber-700"><TriangleAlert className="h-3.5 w-3.5" /> El stock cambió durante el conteo</p> : null}
              </div>
              {isDraft ? (
                <QuantityEditor key={`${item.sku}:${item.quantity}`} item={item} busy={busySku === item.sku} onUpdate={updateQuantity} />
              ) : null}
            </article>
          ))}
        </div>
      )}

      {isDraft ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E2E8F0] bg-white/95 p-3 backdrop-blur md:static md:rounded-xl md:border">
          <div className="mx-auto flex w-full max-w-5xl gap-2">
            <button type="button" onClick={() => setCancelOpen(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600" aria-label="Anular inventario"><Trash2 className="h-5 w-5" /></button>
            <button type="button" disabled={session.scannedProducts === 0} onClick={() => setFinalizeOpen(true)} className="h-12 min-w-0 flex-1 rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-40">Revisar y finalizar</button>
          </div>
        </div>
      ) : null}

      {scannerOpen ? <BarcodeScannerModal title={isCount ? "Conteo físico" : "Agregar inventario"} onDetected={scanProduct} onClose={() => setScannerOpen(false)} /> : null}

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Finalizar inventario</DialogTitle><DialogDescription>{isCount ? "El stock será reemplazado por las cantidades contadas." : "Las cantidades registradas se sumarán al stock actual."}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-[#F8FAFC] p-3 text-sm"><div className="flex justify-between"><span>Productos registrados</span><strong>{session.scannedProducts}</strong></div>{isCount ? <div className="mt-2 flex justify-between"><span>Diferencia total</span><strong className={session.totalDifference < 0 ? "text-red-600" : "text-emerald-700"}>{session.totalDifference > 0 ? "+" : ""}{session.totalDifference}</strong></div> : null}</div>
            {unscannedCount > 0 ? <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={confirmMissing} onChange={(event) => setConfirmMissing(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>Confirmo que {unscannedCount} producto(s) no escaneado(s) quedarán con stock cero.</span></label> : null}
            {changedCount > 0 ? <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={confirmChanges} onChange={(event) => setConfirmChanges(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>Revisé {changedCount} producto(s) cuyo stock cambió durante el conteo.</span></label> : null}
            <button type="button" disabled={finishing || (unscannedCount > 0 && !confirmMissing) || (changedCount > 0 && !confirmChanges)} onClick={finalizeSession} className="h-11 w-full rounded-lg bg-[#2563EB] font-bold text-white disabled:opacity-40">{finishing ? "Finalizando…" : "Confirmar y finalizar"}</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent><DialogHeader><DialogTitle>Anular inventario</DialogTitle><DialogDescription>El borrador quedará en el historial, pero no modificará el stock.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setCancelOpen(false)} className="h-11 rounded-lg border border-[#E2E8F0] font-bold text-[#475569]">Volver</button><button type="button" disabled={finishing} onClick={cancelSession} className="h-11 rounded-lg bg-red-600 font-bold text-white">Anular</button></div></DialogContent>
      </Dialog>
    </div>
  );
}
