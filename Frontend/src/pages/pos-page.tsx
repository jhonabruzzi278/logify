import { useState, useMemo } from "react";
import { Banknote, Check, CreditCard, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useAuth } from "@/app/auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { usePosCart } from "@/hooks/use-pos-cart";
import { useOperationalWorkspace } from "@/hooks/use-operational-workspace";
import { formatUF, formatUSD, useIndicadores } from "@/hooks/use-indicadores";
import { adaptInventory } from "@/lib/api-adapters";
import { ApiErrorBanner } from "@/components/common/api-error-banner";
import { cn, formatCurrency } from "@/lib/utils";
import type { ApiInventory } from "@/types/api";
import type { PaymentMethod, Product, ProductCategory, Sale } from "@/types/domain";

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
  credit: "Crédito",
};

export function PosPage() {
  const { session } = useAuth();
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [successSale, setSuccessSale] = useState<Sale | null>(null);

  const { data: inventory, loading, error, refresh } = useApiQuery<ApiInventory[], Product[]>({
    path: "/api/inventory",
    transform: (r) => r.map(adaptInventory),
  });

  const { operationalInventory, recordSale } = useOperationalWorkspace({ inventory });

  const { items, addToCart, removeFromCart, updateQuantity, clearCart, total, itemCount, saleItems } = usePosCart();
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

  const categories = useMemo(() => {
    const set = new Set<ProductCategory>();
    operationalInventory.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [operationalInventory]);

  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    if (items.length === 0) return;
    setCheckoutError(null);

    const oversold = items.filter((entry) => entry.quantity > entry.product.stock);
    if (oversold.length > 0) {
      const msgs = oversold.map((e) => `${e.product.name}: hay ${e.product.stock} disponibles, intentas vender ${e.quantity}`);
      setCheckoutError(msgs.join(". "));
      return;
    }

    const sale: Sale = {
      id: `sale-${Date.now()}`,
      items: saleItems,
      total,
      paymentMethod,
      vendorId: session?.username ?? "unknown",
      vendorName: session?.name ?? "Desconocido",
      createdAt: new Date().toISOString(),
    };

    await recordSale(sale);
    refresh();
    setSuccessSale(sale);
    clearCart();
    setCartOpen(false);

    setTimeout(() => setSuccessSale(null), 3000);
  }

  function handleQuickAdd(product: Product) {
    const inCart = items.find((e) => e.product.sku === product.sku);
    const currentQty = inCart ? inCart.quantity : 0;
    if (currentQty >= product.stock) return;
    addToCart(product, 1);
  }

  const cartContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">Carrito</h3>
          {itemCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4B98CF] text-[10px] font-bold text-white">
              {itemCount}
            </span>
          )}
        </div>
        <button onClick={clearCart} className="text-xs text-muted-foreground hover:text-red-500">
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
              <div key={entry.product.sku} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(entry.product.price)} c/u
                    {entry.quantity >= entry.product.stock && (
                      <span className="ml-1 text-red-500 font-semibold">Stock max</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(entry.product.sku, entry.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted active:scale-[0.95]"
                  >
                    {entry.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  </button>
                  <span className="flex h-8 min-w-[32px] items-center justify-center text-sm font-bold text-foreground">{entry.quantity}</span>
                  <button
                    onClick={() => {
                      if (entry.quantity < entry.product.stock) {
                        updateQuantity(entry.product.sku, entry.quantity + 1);
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

                <p className="min-w-[70px] text-right text-sm font-bold text-foreground">
                  {formatCurrency(entry.product.price * entry.quantity)}
                </p>

                <button
                  onClick={() => removeFromCart(entry.product.sku)}
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

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Método de pago</span>
              <div className="flex gap-1">
                {(["cash", "transfer"] as PaymentMethod[]).map((pm) => (
                  <button
                    key={pm}
                    onClick={() => setPaymentMethod(pm)}
                    className={cn(
                      "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                      paymentMethod === pm
                        ? "bg-[#4B98CF] text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {pm === "cash" ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                    {PAYMENT_LABELS[pm]}
                  </button>
                ))}
              </div>
            </div>

            {checkoutError && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {checkoutError}
              </div>
            )}

            <button
              onClick={handleCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4EB4A5] py-3 text-sm font-bold text-white transition-colors hover:bg-[#3d9e91] active:scale-[0.98]"
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
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#4EB4A5]/10">
          <Check className="h-10 w-10 text-[#4EB4A5]" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-foreground">Venta registrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatCurrency(successSale.total)} - {successSale.items.length} producto(s)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {PAYMENT_LABELS[successSale.paymentMethod]} - {successSale.vendorName}
        </p>
        <button
          onClick={() => setSuccessSale(null)}
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
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted lg:hidden"
          >
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4B98CF] text-[10px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </button>
          <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{itemCount} items</span>
            {itemCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4B98CF] text-[10px] font-bold text-white">
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
              <button
                onClick={() => setCategory("all")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  category === "all" ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                    category === cat ? "bg-[#4B98CF] text-white" : "text-muted-foreground hover:text-foreground"
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
                placeholder="Buscar producto..."
                className="h-9 w-full rounded border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const inCart = items.find((e) => e.product.sku === product.sku);
              const cartQty = inCart ? inCart.quantity : 0;
              const atLimit = cartQty >= product.stock;
              return (
                <button
                  key={product.sku}
                  onClick={() => handleQuickAdd(product)}
                  disabled={product.stock <= 0 || atLimit}
                  className={cn(
                    "flex flex-col rounded-lg border border-border bg-card p-3 text-left transition-all active:scale-[0.97] hover:border-[#4B98CF] hover:shadow-sm",
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
                  <span className="mt-1.5 text-base font-bold text-[#4B98CF]">{formatCurrency(product.price)}</span>

                  <div className="mt-2 flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-medium",
                      product.stock <= 5 ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {product.stock <= 0 ? "Agotado" : atLimit ? `Max alcanzado (${cartQty})` : `${product.stock} unid.`}
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4B98CF] text-white">
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[80vh] flex-col rounded-t-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setCartOpen(false)} className="text-sm font-semibold text-[#4B98CF]">
                  ← Seguir comprando
                </button>
                {itemCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4B98CF] text-[10px] font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">{cartContent}</div>
          </div>
        </div>
      )}
    </div>
  );
}
