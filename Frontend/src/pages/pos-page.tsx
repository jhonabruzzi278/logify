import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Camera, Check, CreditCard, DollarSign, Landmark, Lock, Minus, PiggyBank, Plus, Receipt, Search, ShoppingCart, Tag, Trash2, User, X } from "lucide-react";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { CUSTOMER_TYPE_BY_MODE } from "@/hooks/use-business-mode";
import { usePosCart } from "@/hooks/use-pos-cart";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { formatUF, formatUSD, useIndicadores } from "@/hooks/use-indicadores";
import { adaptCashSession, adaptCustomer, adaptInventory } from "@/lib/api-adapters";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { ApiErrorBanner } from "@/components/common/api-error-banner";
import { AddAmountModal } from "@/components/pos/add-amount-modal";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { CloseRegisterModal } from "@/components/pos/close-register-modal";
import { ExtrasModal } from "@/components/pos/extras-modal";
import { OpenRegisterModal } from "@/components/pos/open-register-modal";
import { PriceCheckModal } from "@/components/pos/price-check-modal";
import { cn, formatCurrency, onEscapeKey } from "@/lib/utils";
import type { ApiCashSession, ApiCustomer, ApiInventory } from "@/types/api";
import type { Customer, PaymentMethod, Product, ProductCategory, Sale } from "@/types/domain";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  bebidas: "Bebidas",
  galletas: "Galletas",
  dulces: "Dulces",
  otros: "Otros",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit: "Débito",
  credit: "Fiado",
};

const PAYMENT_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  transfer: Landmark,
  debit: CreditCard,
  credit: Lock,
};

export function PosPage() {
  const { session } = useAuth();
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [successSale, setSuccessSale] = useState<Sale | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [closeRegisterOpen, setCloseRegisterOpen] = useState(false);
  const [openRegisterOpen, setOpenRegisterOpen] = useState(false);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [addAmountOpen, setAddAmountOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const lastEnterAtRef = useRef(0);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const { data: inventory, loading, error, refresh } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory",
    transform: (r) => r.map(adaptInventory),
  });

  const { data: customers } = useApiQuery<ApiCustomer[], Customer[]>({
    path: "/api/customers", transform: (r) => r.map(adaptCustomer).filter((c) => c.customerType === CUSTOMER_TYPE_BY_MODE.b2c)
  });

  const { data: activeCashSession, refresh: refreshCashSession } = useApiQuery<ApiCashSession | null, boolean>({
    path: "/api/cash-sessions/active", transform: (r) => Boolean(r && adaptCashSession(r).status === "open"),
  });

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, customerSearch]);

  const { operationalInventory, recordSale } = useOperationalWorkspace({ inventory });

  const { items, addToCart, addManualAmount, removeFromCart, updateQuantity, clearCart, total, itemCount, saleItems } = usePosCart();
  const { uf, dolar } = useIndicadores();

  const filteredProducts = useMemo(() => {
    let list = operationalInventory;
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q));
    }
    return list;
  }, [operationalInventory, category, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const categories = useMemo(() => {
    const set = new Set<ProductCategory>();
    operationalInventory.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [operationalInventory]);

  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    if (items.length === 0) return;
    setCheckoutError(null);
    setCreditWarning(null);

    const oversold = items.filter((entry) => entry.quantity > entry.product.stock);
    if (oversold.length > 0) {
      const msgs = oversold.map((e) => `${e.product.name}: hay ${e.product.stock} disponibles, intentas vender ${e.quantity}`);
      setCheckoutError(msgs.join(". "));
      return;
    }

    if (paymentMethod === "credit" && !selectedCustomer) {
      setCheckoutError("Selecciona un cliente para registrar una venta a fiado");
      return;
    }

    const sale: Sale = {
      id: `sale-${Date.now()}`,
      items: saleItems,
      total,
      paymentMethod,
      vendorId: session?.username ?? "unknown",
      vendorName: session?.name ?? "Desconocido",
      customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer?.name ?? null,
      createdAt: new Date().toISOString(),
    };

    await recordSale(sale);
    refresh();

    if (paymentMethod === "credit" && selectedCustomer) {
      try {
        await apiFetch(`/api/customers/${selectedCustomer.id}/credit/charge`, {
          method: "POST",
          body: JSON.stringify({ amount: total, referenceType: "sale", note: "Venta POS a fiado" }),
        });
      } catch (err) {
        setCreditWarning(
          `La venta se registró, pero no se pudo cargar a la cuenta corriente de ${selectedCustomer.name}: ${
            err instanceof ApiRequestError ? err.message : "error desconocido"
          }. Registra el cargo manualmente desde la ficha del cliente.`
        );
      }
    }

    setSuccessSale(sale);
    clearCart();
    setCartOpen(false);
    setSelectedCustomer(null);
    setCustomerSearch("");

    setTimeout(() => setSuccessSale(null), 3000);
  }

  function handleQuickAdd(product: Product) {
    const inCart = items.find((e) => e.product.sku === product.sku);
    const currentQty = inCart ? inCart.quantity : 0;
    if (currentQty >= product.stock) return;
    addToCart(product, 1);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim()) return;
    e.preventDefault();
    const q = search.trim().toLowerCase();
    const exactSku = filteredProducts.find((p) => p.sku.toLowerCase() === q);
    const target = exactSku ?? (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (target) {
      handleQuickAdd(target);
      setSearch("");
    }
  }

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const now = Date.now();
      if (now - lastEnterAtRef.current < 600 && items.length > 0) {
        lastEnterAtRef.current = 0;
        handleCheckout();
      } else {
        lastEnterAtRef.current = now;
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, paymentMethod, selectedCustomer, total, saleItems]);

  function handleBarcodeDetected(code: string) {
    setScannerOpen(false);
    const product = operationalInventory.find((p) => p.sku.toLowerCase() === code.toLowerCase());
    if (product) {
      handleQuickAdd(product);
    } else {
      setSearch(code);
    }
  }

  const cartContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">Carrito</h3>
          {itemCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
              {itemCount}
            </span>
          )}
        </div>
        <button type="button" onClick={clearCart} className="text-xs text-muted-foreground hover:text-red-500">
          Vaciar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Carrito vacío</p>
          <p className="text-xs text-muted-foreground/60">Agrega productos desde el listado</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {items.map((entry) => (
              <div key={entry.cartId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(entry.product.price)}{!entry.isManualAmount && " c/u"}
                    {!entry.isManualAmount && entry.quantity >= entry.product.stock && (
                      <span className="ml-1 text-red-500 font-semibold">Stock max</span>
                    )}
                  </p>
                </div>

                {entry.isManualAmount ? (
                  <span className="flex h-8 min-w-[32px] items-center justify-center text-sm font-bold text-foreground">{entry.quantity}</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button"
                      onClick={() => updateQuantity(entry.cartId, entry.quantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted active:scale-[0.95]"
                    >
                      {entry.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="flex h-8 min-w-[32px] items-center justify-center text-sm font-bold text-foreground">{entry.quantity}</span>
                    <button type="button"
                      onClick={() => {
                        if (entry.quantity < entry.product.stock) {
                          updateQuantity(entry.cartId, entry.quantity + 1);
                        }
                      }}
                      disabled={entry.quantity >= entry.product.stock}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted active:scale-[0.95]",
                        entry.quantity >= entry.product.stock && "opacity-30 cursor-not-allowed"
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <p className="min-w-[70px] text-right text-sm font-bold text-foreground">
                  {formatCurrency(entry.product.price * entry.quantity)}
                </p>

                <button type="button"
                  onClick={() => removeFromCart(entry.cartId)}
                  className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground/40 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <div className="text-right">
                <span className="text-sm text-foreground">{formatCurrency(total)}</span>
                {(formatUF(total, uf) || formatUSD(total, dolar)) && (
                  <p className="text-[10px] text-muted-foreground">
                    {[formatUF(total, uf), formatUSD(total, dolar)].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-semibold text-foreground">{selectedCustomer ? selectedCustomer.name : "Consumidor Final"}</span>
            </div>

            <button
              type="button"
              onClick={() => setExtrasOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              <Tag className="h-3.5 w-3.5" />
              Gestionar Extras
            </button>

            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Método de pago</span>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((pm) => {
                  const Icon = PAYMENT_ICONS[pm];
                  return (
                    <button type="button"
                      key={pm}
                      onClick={() => setPaymentMethod(pm)}
                      className={cn(
                        "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                        paymentMethod === pm
                          ? "bg-[#2563EB] text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {PAYMENT_LABELS[pm]}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === "credit" && (
              <div className="relative" ref={customerDropdownRef}>
                <span className="text-xs text-muted-foreground">Cliente (fiado)</span>
                <div className="relative mt-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={selectedCustomer ? selectedCustomer.name : customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Buscar cliente..."
                    className="h-9 w-full rounded border border-input bg-[#F8FAFC] pl-8 pr-3 text-sm"
                  />
                </div>
                {showCustomerDropdown && !selectedCustomer && (
                  <div className="absolute z-50 mt-1 w-full rounded border border-border bg-white shadow-lg max-h-40 overflow-y-auto">
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
                        <User className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          {c.creditBalance ? <p className="text-[10px] text-amber-600">Debe {formatCurrency(c.creditBalance)}</p> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {checkoutError && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {checkoutError}
              </div>
            )}

            <button type="button"
              onClick={handleCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] py-3 text-sm font-bold text-white transition-colors hover:bg-[#0D9488] active:scale-[0.98]"
            >
              <Check className="h-5 w-5" />
              Cobrar {formatCurrency(total)}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (successSale) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0D9488]/10">
          <Check className="h-10 w-10 text-[#0D9488]" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-foreground">Venta registrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatCurrency(successSale.total)} - {successSale.items.length} producto(s)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {PAYMENT_LABELS[successSale.paymentMethod]} - {successSale.vendorName}
          {successSale.customerName ? ` - ${successSale.customerName}` : ""}
        </p>
        {creditWarning && (
          <p className="mt-3 max-w-sm rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
            {creditWarning}
          </p>
        )}
        <button type="button"
          onClick={() => { setSuccessSale(null); setCreditWarning(null); }}
          className="btn-touch-primary mt-6"
        >
          Nueva venta
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ApiErrorBanner error={error} onRetry={refresh} />}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-muted-foreground">Punto de Venta</p>
          <h1 className="text-xl font-bold text-foreground">
            {session?.role === "vendor" ? `Hola, ${session.name.split(" ")[0]}` : "Caja"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => setScannerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted"
            title="Escanear código de barras"
          >
            <Camera className="h-5 w-5" />
          </button>
          {!activeCashSession && (
            <button type="button"
              onClick={() => setOpenRegisterOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#0D9488]/30 bg-[#0D9488]/10 px-2.5 py-2 text-sm font-semibold text-[#0D9488] hover:bg-[#0D9488]/20 sm:px-3"
              title="Abrir caja"
            >
              <PiggyBank className="h-4 w-4" />
              <span className="hidden sm:inline">Abrir caja</span>
            </button>
          )}
          <button type="button"
            onClick={() => setCloseRegisterOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted sm:px-3"
            title="Cierre de caja"
          >
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Cierre de caja</span>
          </button>
          <button type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted lg:hidden"
          >
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </button>
          <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{itemCount} items</span>
            {itemCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Product area */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Category tabs + Search */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-1 overflow-x-auto scroll-x rounded border border-border bg-card p-0.5">
              <button type="button"
                onClick={() => setCategory("all")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  category === "all" ? "bg-[#2563EB] text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                    category === cat ? "bg-[#2563EB] text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Escanee código de barras o escriba el nombre del producto (Enter para agregar)"
                className="h-9 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriceCheckOpen(true)}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                <Search className="h-3.5 w-3.5" />
                Consultar Precio
              </button>
              <button
                type="button"
                onClick={() => setAddAmountOpen(true)}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Agregar Monto
              </button>
            </div>
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const inCart = items.find((e) => e.product.sku === product.sku);
              const cartQty = inCart ? inCart.quantity : 0;
              const atLimit = cartQty >= product.stock;
              return (
                <button type="button"
                  key={product.sku}
                  onClick={() => handleQuickAdd(product)}
                  disabled={product.stock <= 0 || atLimit}
                  className={cn(
                    "flex flex-col rounded-lg border border-border bg-card p-3 text-left transition-all active:scale-[0.97] hover:border-[#2563EB] hover:shadow-sm",
                    (product.stock <= 0 || atLimit) && "opacity-40 pointer-events-none"
                  )}
                >
                  {product.imageUrl && (
                    <img src={product.imageUrl} alt="" className="mb-2 h-16 w-full rounded object-cover" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-[0.5px] text-muted-foreground">
                    {CATEGORY_LABELS[product.category]}
                  </span>
                  <span className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{product.name}</span>
                  <span className="mt-1.5 text-base font-bold text-[#2563EB]">{formatCurrency(product.price)}</span>

                  <div className="mt-2 flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-medium",
                      product.stock <= 5 ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {product.stock <= 0 ? "Agotado" : atLimit ? `Max alcanzado (${cartQty})` : `${product.stock} unid.`}
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white">
                      <Plus className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16">
                <p className="text-sm text-muted-foreground">Sin productos en esta categoria</p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop cart sidebar */}
        <div className="hidden lg:flex lg:w-80 lg:shrink-0">
          <div className="sticky top-0 flex h-[calc(100vh-10rem)] w-full flex-col rounded-lg border border-border bg-card">
            {cartContent}
          </div>
        </div>
      </div>

      {/* Mobile cart overlay */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            role="button"
            tabIndex={-1}
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
            onKeyDown={onEscapeKey(() => setCartOpen(false))}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[80vh] flex-col rounded-t-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCartOpen(false)} className="text-sm font-semibold text-[#2563EB]">
                  ← Seguir comprando
                </button>
                {itemCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">{cartContent}</div>
          </div>
        </div>
      )}

      {scannerOpen && <BarcodeScannerModal onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />}
      {closeRegisterOpen && <CloseRegisterModal onClose={() => setCloseRegisterOpen(false)} onClosed={refreshCashSession} />}
      {openRegisterOpen && (
        <OpenRegisterModal
          onOpened={() => { setOpenRegisterOpen(false); refreshCashSession(); }}
          onClose={() => setOpenRegisterOpen(false)}
        />
      )}
      {priceCheckOpen && <PriceCheckModal products={operationalInventory} onClose={() => setPriceCheckOpen(false)} />}
      {addAmountOpen && (
        <AddAmountModal
          onAdd={(label, amount) => { addManualAmount(label, amount); setAddAmountOpen(false); }}
          onClose={() => setAddAmountOpen(false)}
        />
      )}
      {extrasOpen && (
        <ExtrasModal
          subtotal={total}
          onApply={(label, amount) => { addManualAmount(label, amount); setExtrasOpen(false); }}
          onClose={() => setExtrasOpen(false)}
        />
      )}
    </div>
  );
}
