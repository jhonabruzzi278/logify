import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, CreditCard, Package, ShoppingBag, Truck, User, Phone, Mail, MapPin, Check, X, AlertTriangle, Clock } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { adaptCustomer, adaptCustomerCredit, adaptOrder } from "@/lib/api-adapters";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { cn, onActivateKey } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiCustomer, ApiCustomerCredit, ApiOrder } from "@/types/api";
import type { Customer, CustomerCredit, Order } from "@/types/domain";

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const { data: customers } = useApiQuery<ApiCustomer[], Customer[]>({
    path: "/api/customers", transform: (r) => r.map(adaptCustomer)
  });

  const { data: orders } = useApiQuery<ApiOrder[], Order[]>({
    path: "/api/orders", transform: (r) => r.map((o) => adaptOrder(o))
  });

  const { data: credit, refresh: refreshCredit } = useApiQuery<ApiCustomerCredit, CustomerCredit>({
    path: `/api/customers/${customerId}/credit`, transform: adaptCustomerCredit, enabled: Boolean(customerId)
  });

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [payingBack, setPayingBack] = useState(false);

  const customer = useMemo(() => (customers ?? []).find((c) => c.id === customerId) ?? null, [customers, customerId]);

  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    setPaymentError("");
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) { setPaymentError("Ingresa un monto válido"); return; }
    setPayingBack(true);
    try {
      await apiFetch(`/api/customers/${customerId}/credit/payment`, {
        method: "POST", body: JSON.stringify({ amount })
      });
      setPaymentAmount("");
      setPaymentOpen(false);
      refreshCredit();
    } catch (err) {
      setPaymentError(err instanceof ApiRequestError ? err.message : "No se pudo registrar el abono");
    } finally {
      setPayingBack(false);
    }
  }

  const { operationalOrders } = useOperationalWorkspace({ orders });

  const customerOrders = useMemo(() => {
    return (operationalOrders ?? []).filter((o) => o.customerId === customerId);
  }, [operationalOrders, customerId]);

  const stats = useMemo(() => ({
    total: customerOrders.length,
    entregados: customerOrders.filter((o) => o.stage === "entregado").length,
    cancelados: customerOrders.filter((o) => o.stage === "cancelado").length,
    activos: customerOrders.filter((o) => o.stage !== "entregado" && o.stage !== "cancelado").length,
  }), [customerOrders]);

  const badgeClass = (stage: string) =>
    stage === "entregado" ? "bg-green-50 text-green-600" :
    stage === "created" ? "bg-[#2563EB]/10 text-[#2563EB]" :
    stage === "en_preparacion" ? "bg-[#D97706]/10 text-[#D97706]" :
    stage === "en_reparto" ? "bg-purple-50 text-purple-600" :
    stage === "cancelado" ? "bg-red-50 text-red-500" : "bg-muted text-muted-foreground";

  const badgeLabel = (stage: string) =>
    stage === "created" ? "Pendiente" :
    stage === "en_preparacion" ? "Preparación" :
    stage === "en_reparto" ? "En reparto" :
    stage === "entregado" ? "Entregado" :
    stage === "cancelado" ? "Cancelado" : stage;

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <User className="h-12 w-12 text-[#E2E8F0]" />
        <p className="mt-4 font-medium text-[#64748B]">Cliente no encontrado</p>
        <Link to="/customers" className="mt-2 text-sm text-[#2563EB] hover:underline">Volver a clientes</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-sm w-full mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <Link to="/customers" className="inline-flex items-center gap-1 text-xs text-[#64748B] hover:text-[#172554]">
        <ArrowLeft className="h-3.5 w-3.5" /> Clientes
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10">
            <User className="h-6 w-6 text-[#2563EB]" />
          </div>
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Cliente</p>
            <h1 className="text-xl font-bold text-[#172554]">{customer.name}</h1>
          </div>
        </div>
        <span className="text-xs text-[#64748B]">ID #{customer.id}</span>
      </div>

      {customer.phone || customer.email || customer.address ? (
        <div className="rounded border border-[#E2E8F0] bg-white p-4">
          <div className="space-y-2">
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <Phone className="h-4 w-4 text-[#2563EB]" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <Mail className="h-4 w-4 text-[#2563EB]" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <MapPin className="h-4 w-4 text-[#2563EB]" />
                <span>{customer.address}{customer.province ? `, ${customer.province}` : ""}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border border-[#E2E8F0] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#172554]">{stats.total}</p>
          <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-[0.92px]">Total</p>
        </div>
        <div className="rounded border border-[#E2E8F0] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#0D9488]">{stats.entregados}</p>
          <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-[0.92px]">Entregados</p>
        </div>
        <div className="rounded border border-[#E2E8F0] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#2563EB]">{stats.activos}</p>
          <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-[0.92px]">Activos</p>
        </div>
      </div>

      <div className="rounded border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <CreditCard className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Cuenta corriente (fiado)</p>
              <p className={cn("text-lg font-bold", (credit?.creditBalance ?? 0) > 0 ? "text-amber-600" : "text-[#172554]")}>
                ${(credit?.creditBalance ?? 0).toLocaleString("es-CL")}
                {credit?.creditLimit != null && (
                  <span className="ml-1 text-xs font-medium text-[#64748B]">/ ${credit.creditLimit.toLocaleString("es-CL")} límite</span>
                )}
              </p>
            </div>
          </div>
          <Dialog open={paymentOpen} onOpenChange={(open) => { setPaymentOpen(open); if (!open) { setPaymentAmount(""); setPaymentError(""); } }}>
            <DialogTrigger render={<Button size="sm" className="bg-[#0D9488] hover:bg-[#0D9488] text-white">Registrar abono</Button>} />
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Registrar abono</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleRegisterPayment} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="customer-detail-page-f178" className="text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">Monto</label>
                  <Input id="customer-detail-page-f178" type="number" min="1" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="10000" className="h-9 text-sm" autoFocus />
                </div>
                {paymentError && <p className="text-xs text-red-500">{paymentError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPaymentOpen(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" className="bg-[#0D9488] hover:bg-[#0D9488] text-white" disabled={payingBack}>{payingBack ? "Guardando..." : "Guardar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {credit && credit.movements.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-[#F8FAFC] pt-3">
            {credit.movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {m.type === "charge"
                    ? <ArrowUpCircle className="h-3.5 w-3.5 text-amber-500" />
                    : <ArrowDownCircle className="h-3.5 w-3.5 text-[#0D9488]" />}
                  <span className="text-[#64748B]">{m.type === "charge" ? "Fiado" : "Abono"}</span>
                  <span className="text-[10px] text-[#64748B]/70">{new Date(m.createdAt).toLocaleDateString("es-CL")}</span>
                </div>
                <span className={cn("font-semibold", m.type === "charge" ? "text-amber-600" : "text-[#0D9488]")}>
                  {m.type === "charge" ? "+" : "-"}${m.amount.toLocaleString("es-CL")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B] mb-3">Historial de pedidos</p>
        {customerOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded border border-[#E2E8F0] bg-white py-12">
            <Package className="h-8 w-8 text-[#E2E8F0]" />
            <p className="mt-2 text-sm text-[#64748B]">Sin pedidos registrados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customerOrders.map((order) => (
              <div
                key={order.id}
                role="button"
                tabIndex={0}
                className="rounded border border-[#E2E8F0] bg-white p-4 hover:border-[#2563EB]/40 transition-colors cursor-pointer"
                onClick={() => navigate(`/orders/${order.id}`)}
                onKeyDown={onActivateKey(() => navigate(`/orders/${order.id}`))}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      order.stage === "entregado" ? "bg-green-50" :
                      order.stage === "cancelado" ? "bg-red-50" :
                      order.stage === "en_reparto" ? "bg-purple-50" :
                      "bg-[#2563EB]/10"
                    )}>
                      <ShoppingBag className={cn(
                        "h-4 w-4",
                        order.stage === "entregado" ? "text-[#0D9488]" :
                        order.stage === "cancelado" ? "text-red-500" :
                        order.stage === "en_reparto" ? "text-purple-500" :
                        "text-[#2563EB]"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#2563EB]">#{order.id}</p>
                      <p className="text-xs text-[#64748B]">{order.sku} x{order.quantity}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", badgeClass(order.stage))}>
                      {badgeLabel(order.stage)}
                    </span>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">
                      {new Date(order.createdAt).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                </div>
                {order.cancelReason && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    {order.cancelReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
