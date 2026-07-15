import { useApiQuery } from "@/hooks/use-api-query";

interface Indicador {
  valor: number | null;
  fecha: string | null;
}

interface ApiIndicadores {
  uf: Indicador;
  dolar: Indicador;
  utm: Indicador;
}

export function useIndicadores() {
  const { data, loading } = useApiQuery<ApiIndicadores, ApiIndicadores>({
    path: "/api/inventory/indicadores",
    transform: (r) => r
  });

  return {
    uf: data?.uf.valor ?? null,
    dolar: data?.dolar.valor ?? null,
    loading
  };
}

export function formatUF(clpValue: number, ufValor: number | null): string | null {
  if (!ufValor) return null;
  return `${(clpValue / ufValor).toFixed(2)} UF`;
}

export function formatUSD(clpValue: number, dolarValor: number | null): string | null {
  if (!dolarValor) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(clpValue / dolarValor);
}
