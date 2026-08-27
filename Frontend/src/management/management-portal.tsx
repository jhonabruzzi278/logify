import { useCallback, useEffect, useMemo, useState } from "react";
import { SignIn, useAuth, useClerk, useUser } from "@clerk/react";
import {
  Activity,
  Building2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { getDefaultApiBaseUrl } from "@/lib/api-config";

type Section = "overview" | "tenants" | "billing";

interface Overview {
  totalTenants: number;
  trialingTenants: number;
  activeTenants: number;
  attentionTenants: number;
  activeMrrClp: number;
}

interface Tenant {
  id: number;
  slug: string;
  name: string;
  status: string;
  plan: string;
  contactEmail: string | null;
  subscriptionStatus: string;
  planPriceClp: number | null;
  billingProvider: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}

interface BillingProvider {
  id: string;
  name: string;
  configured: boolean;
  active: boolean;
}

interface BillingProvidersResponse {
  defaultProvider: string;
  providers: BillingProvider[];
}

const navigation = [
  { id: "overview" as const, label: "Resumen", icon: LayoutDashboard },
  { id: "tenants" as const, label: "Organizaciones", icon: Building2 },
  { id: "billing" as const, label: "Facturación", icon: CreditCard },
];

const statusLabel: Record<string, string> = {
  trialing: "Prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatClp(value: number) {
  return clpFormatter.format(value);
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "trialing") return "bg-blue-50 text-blue-700";
  if (status === "past_due" || status === "suspended") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function ManagementPortal() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [billing, setBilling] = useState<BillingProvidersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformFetch = useCallback(async <T,>(path: string): Promise<T> => {
    const token = await getToken({ skipCache: true });
    if (!token) throw new Error("No se pudo obtener la sesión administrativa.");
    const configuredBaseUrl = getDefaultApiBaseUrl();
    const baseUrl = configuredBaseUrl || (window.location.hostname === "gestion.logify.cl" ? "https://api.logify.cl" : "");
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Error ${response.status}`);
    }
    return response.json() as Promise<T>;
  }, [getToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextTenants, nextBilling] = await Promise.all([
        platformFetch<Overview>("/api/platform/overview"),
        platformFetch<Tenant[]>("/api/platform/tenants"),
        platformFetch<BillingProvidersResponse>("/api/platform/billing/providers"),
      ]);
      setOverview(nextOverview);
      setTenants(nextTenants);
      setBilling(nextBilling);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la plataforma.");
    } finally {
      setLoading(false);
    }
  }, [platformFetch]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadData();
  }, [isLoaded, isSignedIn, loadData]);

  const visibleTenants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tenants;
    return tenants.filter((tenant) =>
      [tenant.name, tenant.slug, tenant.contactEmail || ""].some((value) => value.toLowerCase().includes(query))
    );
  }, [search, tenants]);

  if (!isLoaded) {
    return <div className="grid min-h-screen place-items-center bg-[#F7F8FA] text-sm text-slate-500">Validando sesión…</div>;
  }

  if (!isSignedIn) {
    return (
      <main className="grid min-h-screen bg-[#F7F8FA] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#111A34] p-14 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
          <div className="font-logo text-4xl">Logify</div>
          <div className="max-w-xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.04em] text-white">Control central de la plataforma.</h1>
            <p className="mt-5 max-w-md text-base text-slate-300">Organizaciones, suscripciones y proveedores de cobro en un espacio privado para el equipo Logify.</p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Acceso restringido</p>
        </section>
        <section className="flex items-center justify-center px-5 py-12">
          <SignIn routing="hash" fallbackRedirectUrl="/" signUpUrl={undefined} />
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-[#111A34] text-white lg:flex">
        <div className="flex h-20 items-center px-7">
          <span className="font-logo text-3xl">Logify</span>
          <span className="ml-3 border-l border-white/20 pl-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Gestión</span>
        </div>
        <nav className="mt-6 space-y-1 px-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold transition ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/7 hover:text-white"}`}>
                <Icon className="h-4 w-4" />{item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          <div className="mb-3 px-2 text-sm">
            <p className="truncate font-semibold">{user?.fullName || "Administrador"}</p>
            <p className="truncate text-xs text-slate-400">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
          <button onClick={() => void signOut({ redirectUrl: "https://gestion.logify.cl" })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/7 hover:text-white">
            <LogOut className="h-4 w-4" />Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="pb-24 lg:ml-64 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200/80 bg-[#F7F8FA]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Plataforma</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{navigation.find((item) => item.id === section)?.label}</h1>
          </div>
          <button onClick={() => void loadData()} disabled={loading} aria-label="Actualizar datos" className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Actualizar</span>
          </button>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          {error ? (
            <div className="border-l-2 border-red-500 bg-red-50 px-5 py-4 text-sm text-red-800">
              <p className="font-semibold">No se pudo abrir Gestión</p><p className="mt-1">{error}</p>
            </div>
          ) : loading && !overview ? (
            <div className="py-24 text-center text-sm text-slate-500">Cargando información de la plataforma…</div>
          ) : section === "overview" && overview ? (
            <OverviewSection overview={overview} tenants={tenants} />
          ) : section === "tenants" ? (
            <TenantsSection tenants={visibleTenants} search={search} onSearch={setSearch} />
          ) : billing ? (
            <BillingSection billing={billing} tenants={tenants} />
          ) : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {navigation.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} onClick={() => setSection(item.id)} className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold ${section === item.id ? "text-blue-600" : "text-slate-500"}`}><Icon className="h-5 w-5" />{item.label}</button>;
        })}
      </nav>
    </div>
  );
}

function OverviewSection({ overview, tenants }: { overview: Overview; tenants: Tenant[] }) {
  const metrics = [
    { label: "Organizaciones", value: overview.totalTenants.toLocaleString("es-CL"), detail: `${overview.trialingTenants} en prueba`, icon: Building2 },
    { label: "Suscripciones activas", value: overview.activeTenants.toLocaleString("es-CL"), detail: `${overview.attentionTenants} requieren atención`, icon: UsersRound },
    { label: "MRR activo", value: formatClp(overview.activeMrrClp), detail: "Según planes registrados", icon: CircleDollarSign },
  ];
  return (
    <div className="space-y-10">
      <section className="grid border-y border-slate-200 md:grid-cols-3">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return <div key={metric.label} className={`py-7 md:px-8 ${index > 0 ? "border-t border-slate-200 md:border-l md:border-t-0" : ""}`}><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Icon className="h-4 w-4 text-blue-600" />{metric.label}</div><p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{metric.value}</p><p className="mt-2 text-sm text-slate-500">{metric.detail}</p></div>;
        })}
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Altas recientes</h2><p className="mt-1 text-sm text-slate-500">Últimas organizaciones registradas en Logify.</p></div></div>
        <TenantTable tenants={tenants.slice(0, 7)} />
      </section>
    </div>
  );
}

function TenantsSection({ tenants, search, onSearch }: { tenants: Tenant[]; search: string; onSearch: (value: string) => void }) {
  return <section><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight">Organizaciones</h2><p className="mt-1 text-sm text-slate-500">{tenants.length} resultados visibles.</p></div><label className="flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 sm:w-80"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar nombre, slug o correo" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></label></div><TenantTable tenants={tenants} /></section>;
}

function TenantTable({ tenants }: { tenants: Tenant[] }) {
  return <div className="overflow-hidden border-y border-slate-200 bg-white"><div className="hidden grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_32px] gap-5 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400 md:grid"><span>Organización</span><span>Suscripción</span><span>Proveedor</span><span>Valor</span><span /></div>{tenants.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No hay organizaciones para mostrar.</p> : tenants.map((tenant) => <div key={tenant.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_32px] md:items-center md:gap-5"><div><p className="font-semibold">{tenant.name}</p><p className="mt-0.5 text-xs text-slate-500">{tenant.contactEmail || tenant.slug}</p></div><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(tenant.subscriptionStatus)}`}>{statusLabel[tenant.subscriptionStatus] || tenant.subscriptionStatus}</span></div><p className="text-sm capitalize text-slate-600">{tenant.billingProvider?.replace("_", " ") || "Sin asignar"}</p><p className="text-sm font-semibold">{tenant.planPriceClp == null ? "—" : formatClp(tenant.planPriceClp)}</p><ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" /></div>)}</div>;
}

function BillingSection({ billing, tenants }: { billing: BillingProvidersResponse; tenants: Tenant[] }) {
  return <div className="space-y-10"><section><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600"><Settings2 className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold">Proveedores de cobro</h2><p className="text-sm text-slate-500">Configuración detectada en el entorno del servidor.</p></div></div><div className="mt-7 divide-y divide-slate-200 border-y border-slate-200">{billing.providers.map((provider) => <div key={provider.id} className="flex items-center justify-between gap-4 bg-white px-5 py-5"><div className="flex items-center gap-4"><div className={`h-2.5 w-2.5 rounded-full ${provider.configured ? "bg-emerald-500" : "bg-slate-300"}`} /><div><p className="font-semibold">{provider.name}</p><p className="mt-0.5 text-xs text-slate-500">{provider.configured ? "Credenciales detectadas" : "Pendiente de configuración"}</p></div></div><div className="flex items-center gap-3">{provider.active && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Predeterminado</span>}<span className={`text-xs font-semibold ${provider.configured ? "text-emerald-700" : "text-slate-400"}`}>{provider.configured ? "Disponible" : "Inactivo"}</span></div></div>)}</div></section><section><div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-blue-600" /><h3 className="font-semibold">Distribución actual</h3></div><div className="border-y border-slate-200 bg-white px-5 py-5 text-sm text-slate-600">{tenants.filter((tenant) => tenant.billingProvider).length} de {tenants.length} organizaciones tienen un proveedor asignado. El cambio global se habilitará cuando exista al menos un adaptador de cobro configurado y validado.</div></section></div>;
}
