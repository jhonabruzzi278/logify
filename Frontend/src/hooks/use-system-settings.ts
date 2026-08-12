import { useApiQuery } from "@/hooks/use-api-query";
import type { ApiSystemSettings } from "@/types/api";

export interface SystemSettings {
  cashRegisterEnabled: boolean;
  requireDeleteReason: boolean;
  productImagesEnabled: boolean;
  priceFromCostEnabled: boolean;
  weightRoundingEnabled: boolean;
}

const DEFAULTS: SystemSettings = {
  cashRegisterEnabled: false,
  requireDeleteReason: false,
  productImagesEnabled: false,
  priceFromCostEnabled: false,
  weightRoundingEnabled: false,
};

/** Opciones del sistema configuradas en /settings ("Opciones del sistema"), con defaults en false mientras cargan. */
export function useSystemSettings() {
  const { data, loading } = useApiQuery<ApiSystemSettings, SystemSettings>({
    path: "/api/settings/system",
    transform: (r) => ({
      cashRegisterEnabled: Boolean(r.cashRegisterEnabled),
      requireDeleteReason: Boolean(r.requireDeleteReason),
      productImagesEnabled: Boolean(r.productImagesEnabled),
      priceFromCostEnabled: Boolean(r.priceFromCostEnabled),
      weightRoundingEnabled: Boolean(r.weightRoundingEnabled),
    }),
  });
  return { settings: data ?? DEFAULTS, loading };
}
