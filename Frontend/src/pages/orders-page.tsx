import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileUp, Plus, Search, Trash2, Truck, User, X, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { managedUsers } from "@/app/user-directory";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { CUSTOMER_TYPE_BY_MODE } from "@/hooks/use-business-mode";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { usePermissions } from "@/hooks/use-permissions";
import { adaptCustomer, adaptInventory, adaptOrder } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { exportOrdersCSV } from "@/lib/export-csv";
import { addHistoryEntry } from "@/lib/order-history";
import { useCustomerScope } from "@/hooks/use-customer-scope";
import { cn, onEscapeKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ApiCreateOrderRequest, ApiCreateOrderResponse, ApiCustomer, ApiInventory, ApiOrder } from "@/types/api";
import type { Customer, Order, Product, Role } from "@/types/domain";
import type { OrderDecisionType } from "@/hooks/use-operational-workspace";

const TRANSPORTERS = managedUsers
  .filter((u) => u.role === "shipper")
  .map((u) => ({ username: u.username, name: u.name }));

export function OrdersPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [transporter, setTransporter] = useState(TRANSPORTERS[0]?.username ?? "");
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteModal, setDeleteModal] = useState<Order | null>(null);
  const { can, role } = usePermissions();
  const { session } = useAuth();
  const canCreate = can("orders.create");
  const canReview = can("orders.review");
  const canAssign = can("orders.assign");
  const canDelete = can("orders.delete");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const customerScope = useCustomerScope();

  const { data: customers, loading: cLoading } = useApiQuery<ApiCustomer[], Customer[]>({
    path: "/api/customers", transform: (r) => r.map(adaptCustomer).filter((c) => c.customerType === CUSTOMER_TYPE_BY_MODE.b2b)
  });

  const { data: products } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory", transform: (r) => r.map(adaptInventory)
  });

  const { data: orders, loading, refresh } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders",
    transform: (r) => {
      const customerMap = new Map<string, string>();
      (customers ?? []).forEach((c) => customerMap.set(c.id, c.name));
      const list = Array.isArray(r) ? r : (r as { data: ApiOrder[] }).data ?? [];
      return list.map((o) => adaptOrder(o, customerMap.get(String(o.customerId))));
    }
  });

  useAutoRefresh(() => { if (!loading && !cLoading) refresh(); }, 10000);

  const { operationalOrders, validationQueue, confirmOrder, cancelOrder, deleteOrder } = useOperationalWorkspace({ orders });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, customerSearch]);

  async function handleConfirm(order: Order) {
    await confirmOrder(order);
    addHistoryEntry({ orderId: order.id, action: "confirmed", actor: session?.name ?? "Admin", actorRole: role ?? "owner", detail: "Pedido confirmado" });
    refresh();
  }

  async function handleCancel(order: Order) {
    if (!cancelReason.trim()) return;
    await cancelOrder(order, cancelReason);
    addHistoryEntry({ orderId: order.id, action: "cancelled", actor: session?.name ?? "Admin", actorRole: role ?? "owner", detail: cancelReason });
    setCancelModal(null);
    setCancelReason("");
    refresh();
  }

  async function handleDelete(order: Order) {
    await deleteOrder(order.id);
    setDeleteModal(null);
    refresh();
  }

  async function handleAssign(orderId: string, transporterUsername: string) {
    setAssigningOrder(orderId);
    try {
      await apiFetch(`/api/orders/${orderId}/assign?transporter=${encodeURIComponent(transporterUsername)}`, { method: "PUT" });
      refresh();
    } catch {
    } finally {
      setAssigningOrder(null);
    }
  }

  const filtered = useMemo(() => {
    let list = customerScope.isCustomer
      ? operationalOrders.filter((o) => o.customerId === customerScope.linkedCustomerId)
      : operationalOrders;
    if (tab !== "all") list = list.filter((o) => o.stage === tab);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((o) => `${o.id} ${o.customer} ${o.sku} ${o.assignedTo ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [operationalOrders, tab, query, customerScope.isCustomer, customerScope.linkedCustomerId]);

  const counts = useMemo(() => {
    const base = customerScope.isCustomer
      ? operationalOrders.filter((o) => o.customerId === customerScope.linkedCustomerId)
      : operationalOrders;
    return {
      total: base.length,
      pending: base.filter((o) => o.stage === "created").length,
      preparing: base.filter((o) => o.stage === "en_preparacion").length,
      inTransit: base.filter((o) => o.stage === "en_reparto").length,
    };
  }, [operationalOrders, customerScope.isCustomer, customerScope.linkedCustomerId]);

  const tabs = ["all", "created", "en_preparacion", "en_reparto", "entregado", "cancelado"] as const;
  const tabLabels: Record<string, string> = {
    all: "Todos",
    created: "Pendientes",
    en_preparacion: "Preparación",
    en_reparto: "Reparto",
    entregado: "Entregados",
    cancelado: "Cancelados",
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFeedback(null);
    if (!selectedCustomer) {
      setFeedback({ type: "error", msg: "Selecciona un cliente" });
      setCreating(false);
      return;
    }
    const product = (products ?? []).find((p) => p.sku === sku.trim());
    const qty = Number(quantity);
    if (product && qty > product.stock) {
      setFeedback({ type: "error", msg: `Stock insuficiente: disponible ${product.stock}, solicitado ${qty}` });
      setCreating(false);
      return;
    }
    try {
      const res = await apiFetch<ApiCreateOrderResponse>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ customerId: Number(selectedCustomer.id), sku: sku.trim(), quantity: qty } as ApiCreateOrderRequest)
      });
      if (transporter) {
        await apiFetch(`/api/orders/${res.orderId}/assign?transporter=${encodeURIComponent(transporter)}`, { method: "PUT" });
      }
      addHistoryEntry({
        orderId: String(res.orderId),
        action: "created",
        actor: session?.name ?? "Admin",
        actorRole: role ?? "owner",
        detail: `Pedido #${res.orderId} creado - ${selectedCustomer.name}, SKU ${sku}, ${qty} unids` + (transporter ? ` - Asignado a ${TRANSPORTERS.find(t => t.username === transporter)?.name}` : ""),
      });
      setSelectedCustomer(null);
      setCustomerSearch("");
      setQuantity("1");
      refresh();
      setFeedback({ type: "success", msg: `Pedido #${res.orderId} creado` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof ApiRequestError ? err.message : "Error al crear pedido" });
    } finally { setCreating(false); }
  }

  const getTransporterName = (order: Order) => {
    if (order.assignedTo) {
      return TRANSPORTERS.find((t) => t.username === order.assignedTo)?.name ?? order.assignedTo;
    }
    return null;
  };

  const badgeColor = (stage: string) =>
    stage === "created" ? "bg-[#4B98CF]/10 text-[#4B98CF]" :
    stage === "en_preparacion" ? "bg-[#E3AA75]/10 text-[#E3AA75]" :
    stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
    stage === "entregado" ? "bg-green-50 text-green-600" :
    stage === "cancelado" ? "bg-red-50 text-red-500" : "bg-muted text-muted-foreground";

  const stageLabel = (stage: string) =>
    stage === "created" ? "Pendiente" :
    stage === "en_preparacion" ? "Preparación" :
    stage === "en_reparto" ? "En reparto" :
    stage === "entregado" ? "Entregado" :
    stage === "cancelado" ? "Cancelado" : stage;

  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[1.2px] text-muted-foreground">Pedidos</p>
          <h1 className="text-xl font-bold text-foreground">
            {customerScope.isCustomer && customerScope.linkedCustomer
              ? `Mis pedidos - ${customerScope.linkedCustomer.name}`
              : "Gestion de ordenes"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">{counts.total} total</span>
          {!customerScope.isCustomer && (
            <>
              <span className="rounded bg-[#4B98CF]/10 px-2 py-0.5 text-[#4B98CF] font-bold">{counts.pending} pendientes</span>
              <span className="rounded bg-[#E3AA75]/10 px-2 py-0.5 text-[#E3AA75] font-bold">{counts.preparing} preparacion</span>
            </>
          )}
          {canCreate && !customerScope.isCustomer && (
            <>
              <button type="button" onClick={() => setShowForm(!showForm)} className="btn-touch-primary min-h-[40px] gap-1">
                <Plus className="h-4 w-4" /> Nuevo
              </button>
              <button type="button" onClick={() => setShowBulk(!showBulk)} className="btn-touch-outline min-h-[40px] gap-1">
                <FileUp className="h-4 w-4" /> CSV
              </button>
            </>
          )}
          <button type="button" onClick={() => exportOrdersCSV(operationalOrders.map(o => ({ id: o.id, customer: o.customer, sku: o.sku, quantity: o.quantity, stage: String(o.stage), createdAt: o.createdAt, transporter: getTransporterName(o) ?? undefined })))} className="btn-touch-outline min-h-[40px] gap-1">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded border border-border bg-card p-4">
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0 relative" ref={dropdownRef}>
              <label htmlFor="orders-page-f263" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">Cliente</label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input id="orders-page-f263"
                  value={selectedCustomer ? selectedCustomer.name : customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Buscar cliente..."
                  className="h-9 w-full rounded border border-input bg-[#F8FBFD] pl-8 pr-3 text-sm"
                />
              </div>
              {showCustomerDropdown && !selectedCustomer && (
                <div className="absolute z-50 mt-1 w-full rounded border border-border bg-white shadow-lg max-h-48 overflow-y-auto">
                  {filteredCustomers.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                  )}
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); setShowCustomerDropdown(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    >
                      <User className="h-3.5 w-3.5 text-[#4B98CF] shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="orders-page-f297" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">Producto</label>
              <select id="orders-page-f297"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="h-9 w-full rounded border border-input bg-[#F8FBFD] px-2 text-sm"
              >
                <option value="" disabled>Seleccionar...</option>
                {(products ?? []).filter((p) => p.stock > 0).map((p) => (
                  <option key={p.sku} value={p.sku}>{p.name} ({p.stock} unids)</option>
                ))}
              </select>
            </div>
            <div className="w-20 sm:w-20">
              <label htmlFor="orders-page-f310" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">Cant</label>
              <input id="orders-page-f310" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9 w-full rounded border border-input bg-[#F8FBFD] px-3 text-sm text-center" placeholder="1" />
            </div>
            <div className="sm:w-44">
              <label className="block text-[10px] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-1">
                <Truck className="inline h-3 w-3 mr-1" />Transportista
              </label>
              <select value={transporter} onChange={(e) => setTransporter(e.target.value)} className="h-9 w-full rounded border border-input bg-[#F8FBFD] px-2 text-xs">
                {TRANSPORTERS.map((t) => (
                  <option key={t.username} value={t.username}>{t.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={creating} className="h-9 rounded bg-[#4B98CF] px-4 text-xs font-bold text-white hover:bg-[#346384] disabled:opacity-50">
              {creating ? "..." : "Crear"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="h-9 rounded border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">Cancelar</button>
          </form>
          {feedback && (
            <p className={cn("mt-2 text-xs font-medium", feedback.type === "success" ? "text-[#4EB4A5]" : "text-red-500")}>{feedback.msg}</p>
          )}
        </div>
      )}

      {showBulk && (
        <div className="rounded border border-border bg-card p-4">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-muted-foreground mb-3">Carga masiva CSV</p>
          <p className="text-xs text-muted-foreground mb-2">Formato: customerId,sku,quantity (uno por línea)</p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"1,COCA-COLA-2L,3\n2,SPRITE-2L,1"}
            rows={5}
            className="w-full rounded border border-input bg-[#F8FBFD] p-3 text-sm font-mono"
          />
          <div className="flex items-center gap-2 mt-2">
            <button type="button"
              onClick={async () => {
                const lines = csvText.trim().split("\n").filter(Boolean);
                let success = 0, errors: string[] = [];
                for (const line of lines) {
                  const [cId, s, q] = line.split(",").map((v) => v.trim());
                  if (!cId || !s || !q) { errors.push("Línea invalida: " + line); continue; }
                  try {
                    await apiFetch<ApiCreateOrderResponse>("/api/orders", {
                      method: "POST",
                      body: JSON.stringify({ customerId: Number(cId), sku: s, quantity: Number(q) } as ApiCreateOrderRequest)
                    });
                    success++;
                  } catch { errors.push("Fallo: " + line); }
                }
                setBulkFeedback(`${success} pedidos creados.${errors.length ? ` ${errors.length} errores.` : ""}`);
                setCsvText("");
                refresh();
              }}
              className="h-9 rounded bg-[#4B98CF] px-4 text-xs font-bold text-white hover:bg-[#346384]"
            >
              Procesar CSV
            </button>
            <button type="button" onClick={() => setShowBulk(false)} className="h-9 rounded border border-border px-3 text-xs font-semibold text-muted-foreground">Cancelar</button>
          </div>
          {bulkFeedback && <p className="mt-2 text-xs text-[#4B98CF]">{bulkFeedback}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pedido, cliente, SKU..." className="h-10 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="flex gap-1 rounded border border-border bg-card p-0.5 overflow-x-auto scroll-x">
          {tabs.map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)} className={cn("rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors", tab === t ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground")}>
              {tabLabels[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded border border-border bg-card">
        <div className="overflow-x-auto scroll-x">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-bold uppercase tracking-[0.92px] text-muted-foreground">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 w-12 hidden sm:table-cell">Cant</th>
                <th className="px-4 py-3 hidden md:table-cell">Transportista</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 hidden md:table-cell">Creado</th>
                {!customerScope.isCustomer && <th className="px-4 py-3 text-right">{canReview ? "Acci&oacute;n" : ""}</th>}
              </tr>
            </thead>
          <tbody>
            {filtered.map((order) => {
              const tName = getTransporterName(order);
              return (
                <tr key={order.id} className="border-b border-[#F5F7F9] hover:bg-muted cursor-pointer" onClick={() => navigate(`/orders/${order.id}`)}>
                  <td className="px-4 py-3 font-bold text-[#4B98CF]">#{order.id}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{order.customer}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{order.sku}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">x{order.quantity}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {tName && (
                      <span className="inline-flex items-center gap-1 text-xs text-foreground">
                        <Truck className="h-3 w-3 text-[#4EB4A5]" />
                        {tName}
                      </span>
                    )}
                    {!tName && canAssign && (
                      <select
                        onClick={(e) => e.stopPropagation()}
                        value=""
                        onChange={(e) => { if (e.target.value) handleAssign(order.id, e.target.value); }}
                        disabled={assigningOrder === order.id}
                        className="text-xs rounded border border-border bg-transparent px-1.5 py-0.5"
                      >
                        <option value="" disabled>Asignar...</option>
                        {TRANSPORTERS.map((t) => (
                          <option key={t.username} value={t.username}>{t.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", badgeColor(order.stage))}>
                      {stageLabel(order.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {new Date(order.createdAt).toLocaleDateString("es-CL")}
                  </td>
                  {!customerScope.isCustomer && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                   {canReview && order.stage === "created" && (
                     <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                       <button type="button" onClick={() => handleConfirm(order)} title="Confirmar pedido" className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-green-600 hover:bg-green-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Check className="h-4 w-4 sm:h-5 sm:w-5" /></button>
                       <button type="button" onClick={() => { setCancelModal(order); setCancelReason(""); }} title="Cancelar pedido" className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-red-500 hover:bg-red-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4 sm:h-5 sm:w-5" /></button>
                     </div>
                   )}
                    {canReview && order.stage === "en_preparacion" && (
                      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                        <button type="button" onClick={() => { setCancelModal(order); setCancelReason(""); }} title="Cancelar pedido" className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-red-500 hover:bg-red-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4 sm:h-5 sm:w-5" /></button>
                      </div>
                    )}
                    {canDelete && order.stage === "cancelado" && (
                      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                        <button type="button" onClick={() => setDeleteModal(order)} title="Eliminar pedido" className="inline-flex items-center justify-center rounded-lg border border-border min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-red-500 hover:bg-red-50 active:scale-[0.95] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="h-4 w-4 sm:h-5 sm:w-5" /></button>
                      </div>
                    )}
                  </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={customerScope.isCustomer ? 7 : 8} className="px-4 py-12 text-center text-xs text-muted-foreground">Sin pedidos que coincidan</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {cancelModal && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setCancelModal(null); setCancelReason(""); }}
          onKeyDown={onEscapeKey(() => { setCancelModal(null); setCancelReason(""); })}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-bold text-sm text-[#112b4a]">Cancelar pedido #{cancelModal.id}</h3>
              </div>
              <button type="button" onClick={() => { setCancelModal(null); setCancelReason(""); }} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-[#6B7280]">
              Ingresa el motivo de cancelacion para <strong>{cancelModal.customer}</strong> ({cancelModal.sku} x{cancelModal.quantity})
            </p>
            {cancelModal.stage === "en_preparacion" && (
              <p className="text-xs text-[#E3AA75]">El stock se restaurará automáticamente</p>
            )}
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo de cancelacion..."
              rows={3}
              className="w-full rounded border border-input bg-[#F8FBFD] p-3 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setCancelModal(null); setCancelReason(""); }}>Volver</Button>
              <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleCancel(cancelModal)} disabled={!cancelReason.trim()}>
                Cancelar pedido
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteModal(null)}
          onKeyDown={onEscapeKey(() => setDeleteModal(null))}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-bold text-sm text-[#112b4a]">Eliminar pedido #{deleteModal.id}</h3>
              </div>
              <button type="button" onClick={() => setDeleteModal(null)} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-[#6B7280]">
              Esta accion es irreversible. Se eliminara permanentemente el pedido de <strong>{deleteModal.customer}</strong> ({deleteModal.sku} x{deleteModal.quantity}).
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(null)}>Volver</Button>
              <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(deleteModal)}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
