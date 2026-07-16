import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, History, LogOut, MapPin, Package, Search, Truck, XCircle } from "lucide-react";
import { useAuth } from "@/app/auth";
import { adaptShipment } from "@/lib/api-adapters";
import { cn } from "@/lib/utils";
import type { ApiNotificationRecord, ApiShipment } from "@/types/api";

interface TrackRow {
  id: number;
  sku: string;
  quantity: number;
  status: string;
  created_at: string;
  client_code: string;
  cancel_reason?: string | null;
  customer_name?: string;
}

interface TrackResult {
  order: TrackRow;
  shipment: ReturnType<typeof adaptShipment> | null;
  notifications: ApiNotificationRecord[];
}

const STAGE_ORDER = ["created", "en_preparacion", "en_reparto", "entregado"] as const;

function normalizeStage(status: string): typeof STAGE_ORDER[number] | "cancelado" {
  const s = status.toLowerCase();
  if (s.includes("preparacion") || s === "en_preparacion") return "en_preparacion";
  if (s.includes("reparto") || s === "en_reparto") return "en_reparto";
  if (s.includes("entregado") || s === "entregado") return "entregado";
  if (s.includes("cancel")) return "cancelado";
  return "created";
}

const STEP_CONFIG = [
  { key: "created", label: "Pedido recibido", icon: Package },
  { key: "en_preparacion", label: "En preparación", icon: Clock },
  { key: "en_reparto", label: "En reparto", icon: Truck },
  { key: "entregado", label: "Entregado", icon: CheckCircle2 },
] as const;

function stageLabel(stage: string) {
  if (stage === "created") return "Recibido";
  if (stage === "en_preparacion") return "En preparación";
  if (stage === "en_reparto") return "En reparto";
  if (stage === "entregado") return "Entregado";
  if (stage === "cancelado") return "Cancelado";
  return stage;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function TrackingPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [input, setInput] = useState(code ?? "");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const didAutoSearch = useRef(false);

  async function doSearch(raw: string) {
    const q = raw.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      if (!q.startsWith("SL-")) {
        throw new Error("Ingresa tu código de cliente (formato SL-XXXXXX). Encuéntralo en el correo de confirmación de tu pedido.");
      }

      const res = await fetch(`/api/orders/track/${q}`);
      if (!res.ok) throw new Error("Código de cliente no encontrado. Verifica que lo ingresaste correctamente.");
      const order = await res.json() as TrackRow;

      const [shipRes, notifsRes] = await Promise.all([
        fetch(`/api/shipments`),
        fetch("/api/notifications"),
      ]);
      const allShipments: ApiShipment[] = shipRes.ok ? await shipRes.json() : [];
      const allNotifs: ApiNotificationRecord[] = notifsRes.ok ? await notifsRes.json() : [];

      const rawShipment = allShipments.find((s) => {
        const r = s as unknown as Record<string, unknown>;
        return (r.order_id ?? r.orderId ?? s.orderId) === order.id;
      }) ?? null;

      const notifications = allNotifs.filter((n) => {
        const r = n as unknown as Record<string, unknown>;
        return (r.order_id ?? r.orderId ?? n.orderId) === order.id;
      });

      setResult({
        order,
        shipment: rawShipment ? adaptShipment(rawShipment) : null,
        notifications,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (code && !didAutoSearch.current) {
      didAutoSearch.current = true;
      doSearch(code);
    }
  }, [code]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(input);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const stage = result ? normalizeStage(result.order.status) : null;
  const isCancelled = stage === "cancelado";
  const stageIdx = stage && stage !== "cancelado" ? STAGE_ORDER.indexOf(stage) : -1;

  const timeline = useMemo(() => {
    if (!result) return [];
    const { notifications, order, shipment } = result;
    const recordMap: Record<string, string> = {};
    for (const n of notifications) {
      const r = n as unknown as Record<string, unknown>;
      const s = String(r.stage ?? "").toUpperCase();
      const t = String(r.occurred_at ?? r.occurredAt ?? n.occurredAt ?? "");
      if (s.includes("CREAT") || s.includes("ORDER_C")) recordMap["created"] = recordMap["created"] ?? t;
      if (s.includes("PREPARACION") || s.includes("CONFIRM")) recordMap["en_preparacion"] = recordMap["en_preparacion"] ?? t;
      if (s.includes("REPARTO") || s.includes("TRANSIT")) recordMap["en_reparto"] = recordMap["en_reparto"] ?? t;
      if (s.includes("ENTREGADO") || s.includes("DELIVERED")) recordMap["entregado"] = recordMap["entregado"] ?? t;
    }
    return [
      { key: "created", time: recordMap["created"] ?? order.created_at },
      { key: "en_preparacion", time: recordMap["en_preparacion"] ?? (stageIdx >= 1 ? order.created_at : null) },
      { key: "en_reparto", time: recordMap["en_reparto"] ?? (stageIdx >= 2 ? shipment?.shippedAt ?? null : null) },
      { key: "entregado", time: recordMap["entregado"] ?? (stageIdx >= 3 ? shipment?.shippedAt ?? null : null) },
    ];
  }, [result, stageIdx]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg,#0d2137 0%,#1a3a5c 40%,#112b4a 100%)" }}>
      <header className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#4B98CF] flex items-center justify-center">
            <Truck className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Logify</span>
        </div>
        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-xs hidden sm:inline">Hola, {session.name}</span>
            <button
              type="button"
              disabled
              title="Disponible próximamente"
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/40 cursor-not-allowed"
            >
              <History className="h-3.5 w-3.5" />
              Historial de pedidos
              <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/50">
                Próximamente
              </span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <Link to="/login" className="text-white/50 text-xs hover:text-white/80 transition-colors">
            Acceso interno →
          </Link>
        )}
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white">Seguimiento</h1>
            <p className="text-white/60 text-sm">
              Ingresa tu código de cliente para rastrear tu pedido
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Código de cliente (ej: SL-AB12CD)"
                className="h-12 w-full rounded-xl bg-white/10 border border-white/20 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#4B98CF] focus:bg-white/15 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-xl bg-[#4B98CF] hover:bg-[#3d85be] disabled:opacity-60 px-6 text-sm font-bold text-white transition-colors shrink-0"
            >
              {loading ? "..." : "Rastrear"}
            </button>
          </form>

          {errorMsg && (
            <div className="rounded-xl bg-red-500/10 border border-red-400/30 px-4 py-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{errorMsg}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {result.order.client_code && (
                      <p className="text-xs font-bold text-[#4B98CF] font-mono tracking-wide mb-1">
                        {result.order.client_code}
                      </p>
                    )}
                    <p className="text-white font-bold text-lg">
                      Pedido #{result.order.id}
                    </p>
                    <p className="text-white/60 text-sm mt-0.5">
                      {result.order.sku} · {result.order.quantity} unid{result.order.quantity !== 1 ? "s" : ""}
                    </p>
                    {result.order.customer_name && (
                      <p className="text-white/50 text-xs mt-1">{result.order.customer_name}</p>
                    )}
                    {result.shipment?.tracking && result.shipment.tracking !== "Pendiente" && (
                      <p className="text-white/40 text-xs font-mono mt-1">{result.shipment.tracking}</p>
                    )}
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold shrink-0",
                    isCancelled ? "bg-red-500/20 text-red-300" :
                    stage === "entregado" ? "bg-green-500/20 text-green-300" :
                    stage === "en_reparto" ? "bg-purple-400/20 text-purple-300" :
                    "bg-[#4B98CF]/20 text-[#4B98CF]"
                  )}>
                    {stageLabel(stage ?? "created")}
                  </span>
                </div>
              </div>

              {!isCancelled && (
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-white/40 mb-5">Estado del envío</p>
                  <div className="space-y-0">
                    {STEP_CONFIG.map((step, i) => {
                      const done = stageIdx > i;
                      const active = stageIdx === i;
                      const Icon = step.icon;
                      const tl = timeline[i];
                      return (
                        <div key={step.key} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                              done ? "bg-green-500" :
                              active ? "bg-[#4B98CF]" :
                              "bg-white/10"
                            )}>
                              <Icon className={cn("h-4 w-4", done || active ? "text-white" : "text-white/30")} />
                            </div>
                            {i < STEP_CONFIG.length - 1 && (
                              <div className={cn(
                                "w-0.5 h-8 mt-1",
                                done ? "bg-green-500/40" : "bg-white/10"
                              )} />
                            )}
                          </div>
                          <div className="flex-1 pb-6 -mt-0.5">
                            <p className={cn(
                              "text-sm font-semibold",
                              done || active ? "text-white" : "text-white/30"
                            )}>
                              {step.label}
                            </p>
                            {tl?.time && (done || active) && (
                              <p className="text-xs text-white/40 mt-0.5">{fmtDate(tl.time)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCancelled && (
                <div className="rounded-2xl bg-red-500/10 border border-red-400/30 p-5 text-center">
                  <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-red-300">Pedido cancelado</p>
                  {result.order.cancel_reason && (
                    <p className="text-xs text-red-400/70 mt-1">{result.order.cancel_reason}</p>
                  )}
                </div>
              )}

              {result.shipment?.stage === "entregado" && result.shipment.proofOfDeliveryImage && (
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-white/40 mb-3">Foto de entrega</p>
                  <img
                    src={result.shipment.proofOfDeliveryImage}
                    alt="Comprobante de entrega"
                    className="w-full max-h-56 object-cover rounded-xl border border-white/10"
                  />
                  {result.shipment.recipientRut && (
                    <div className="mt-3 flex items-center gap-2 text-white/50 text-xs">
                      <MapPin className="h-3.5 w-3.5" />
                      Recibido por RUT {result.shipment.recipientRut}
                    </div>
                  )}
                </div>
              )}

              {result.notifications.length > 0 && (
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-white/40 mb-4">Historial</p>
                  <div className="space-y-3">
                    {[...result.notifications]
                      .sort((a, b) => {
                        const ta = (a as unknown as Record<string, unknown>).occurred_at ?? a.occurredAt ?? "";
                        const tb = (b as unknown as Record<string, unknown>).occurred_at ?? b.occurredAt ?? "";
                        return new Date(tb as string).getTime() - new Date(ta as string).getTime();
                      })
                      .map((n, idx) => {
                        const r = n as unknown as Record<string, unknown>;
                        const time = String(r.occurred_at ?? r.occurredAt ?? n.occurredAt ?? "");
                        const msg = String(r.message ?? n.message ?? "");
                        const src = String(r.source_service ?? r.sourceService ?? n.sourceService ?? "");
                        return (
                          <div key={idx} className="flex gap-3 text-sm">
                            <div className="h-1.5 w-1.5 rounded-full bg-[#4B98CF]/70 mt-1.5 shrink-0" />
                            <div>
                              <p className="text-white/80">{msg}</p>
                              <p className="text-white/30 text-xs mt-0.5">
                                {src} · {time ? fmtDate(time) : "—"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="py-5 text-center">
        <p className="text-white/20 text-xs">Logify © 2025 · Logística inteligente</p>
      </footer>
    </div>
  );
}
