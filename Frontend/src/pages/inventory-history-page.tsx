import { useMemo, useState } from "react";
import { Archive, ArrowLeft, ClipboardCheck, PackagePlus, Plus, ScanLine } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/use-permissions";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ApiInventorySession, ApiInventorySessionStatus, ApiInventorySessionType } from "@/types/api";

const statusLabels: Record<ApiInventorySessionStatus, string> = {
  draft: "Borrador",
  finalized: "Finalizado",
  cancelled: "Anulado",
};

const typeLabels: Record<ApiInventorySessionType, string> = {
  count: "Conteo físico",
  restock: "Agregar inventario",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function InventoryHistoryPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [filter, setFilter] = useState<"all" | ApiInventorySessionStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ApiInventorySessionType>("count");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error } = useApiQuery<ApiInventorySession[], ApiInventorySession[]>({
    path: "/api/inventory-sessions",
    transform: (response) => response,
    enabled: can("inventory.sessions.manage"),
  });

  const sessions = useMemo(() => {
    const rows = data ?? [];
    return filter === "all" ? rows : rows.filter((session) => session.status === filter);
  }, [data, filter]);

  if (!can("inventory.sessions.manage")) return <Navigate to="/inventory" replace />;

  async function createSession() {
    setBusy(true);
    setActionError(null);
    try {
      const session = await apiFetch<ApiInventorySession>("/api/inventory-sessions", {
        method: "POST",
        body: JSON.stringify({ type: selectedType, name: name.trim() || undefined }),
      });
      navigate(`/inventory/history/${session.id}`);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "No se pudo crear el inventario";
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden px-1 sm:px-2">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link to="/inventory" aria-label="Volver al inventario" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#172554]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Inventario</p>
            <h1 className="break-words text-2xl font-bold text-[#172554]">Historial de inventarios</h1>
            <p className="mt-1 text-sm text-[#64748B]">Conteos físicos e ingresos de mercadería realizados por administradores.</p>
          </div>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] active:scale-[0.99] sm:w-auto">
          <Plus className="h-5 w-5" /> Nuevo proceso
        </button>
      </header>

      <nav aria-label="Filtrar historial" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {(["all", "draft", "finalized", "cancelled"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={cn("h-10 rounded-lg border px-3 text-sm font-semibold transition", filter === value ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#E2E8F0] bg-white text-[#64748B]")}>{value === "all" ? "Todos" : statusLabels[value]}</button>
        ))}
      </nav>

      {loading ? <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent" /></div> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {!loading && !error && sessions.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-6 py-16 text-center">
          <Archive className="mx-auto h-10 w-10 text-[#94A3B8]" />
          <h2 className="mt-4 text-lg font-bold text-[#172554]">Todavía no hay procesos</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#64748B]">Crea un conteo físico para detectar diferencias o registra mercadería nueva.</p>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
          {sessions.map((session) => (
            <Link key={session.id} to={`/inventory/history/${session.id}`} className="flex min-w-0 flex-col gap-3 p-4 transition hover:bg-[#F8FAFC] sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", session.type === "count" ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-emerald-50 text-emerald-600")}>{session.type === "count" ? <ClipboardCheck className="h-5 w-5" /> : <PackagePlus className="h-5 w-5" />}</span>
              <div className="min-w-0">
                <h2 className="break-words font-bold text-[#172554]">{session.name}</h2>
                <p className="mt-0.5 text-sm text-[#64748B]">{typeLabels[session.type]} · {formatDate(session.startedAt)}</p>
                <p className="mt-1 text-xs text-[#64748B]">{session.scannedProducts} de {session.totalProducts} productos registrados</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pl-14 sm:justify-end sm:pl-0">
              {session.status === "draft" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"><ScanLine className="h-3.5 w-3.5" /> Continuar</span> : <span className={cn("rounded-full px-3 py-1 text-xs font-bold", session.status === "finalized" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{statusLabels[session.status]}</span>}
              {session.status === "finalized" ? <strong className={cn("text-sm", session.totalDifference < 0 ? "text-red-600" : "text-emerald-700")}>{session.totalDifference > 0 ? "+" : ""}{session.totalDifference}</strong> : null}
            </div>
            </Link>
          ))}
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setActionError(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo proceso de inventario</DialogTitle>
            <DialogDescription>Solo se puede mantener un proceso abierto por empresa.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button type="button" onClick={() => setSelectedType("count")} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", selectedType === "count" ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#E2E8F0]")}>
              <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#2563EB]" />
              <span><strong className="block text-[#172554]">Conteo físico</strong><span className="mt-1 block text-sm text-[#64748B]">Compara las cantidades escaneadas con el stock registrado.</span></span>
            </button>
            <button type="button" onClick={() => setSelectedType("restock")} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", selectedType === "restock" ? "border-emerald-500 bg-emerald-50" : "border-[#E2E8F0]")}>
              <PackagePlus className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              <span><strong className="block text-[#172554]">Agregar inventario</strong><span className="mt-1 block text-sm text-[#64748B]">Suma la mercadería escaneada al stock existente.</span></span>
            </button>
            <div>
              <label htmlFor="inventory-session-name" className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Nombre opcional</label>
              <input id="inventory-session-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder={selectedType === "count" ? "Conteo de bodega" : "Ingreso de mercadería"} className="mt-1 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#2563EB]" />
            </div>
            {actionError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p> : null}
            <button type="button" disabled={busy} onClick={createSession} className="h-11 rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Creando…" : "Comenzar"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
