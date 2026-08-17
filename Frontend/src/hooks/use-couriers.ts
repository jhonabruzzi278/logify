import { useApiQuery } from "@/hooks/use-api-query";
import type { ApiCourier } from "@/types/api";

export interface Courier {
  username: string;
  name: string;
}

/** Transportistas reales del tenant (usuarios con rol shipper), obtenidos del backend. */
export function useCouriers() {
  const { data, loading, error } = useApiQuery<ApiCourier[], Courier[]>({
    path: "/api/auth/couriers",
    transform: (r) => r.map((c) => ({ username: c.username, name: c.name }))
  });
  return { couriers: data ?? [], loading, error };
}
