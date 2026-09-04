import { useState } from "react";
import { useAuth } from "@/app/auth";
import { getDefaultPathForRole } from "@/app/access";
import type { OrganizationOption } from "@/app/clerk-org-activation";

interface UseOrganizationSwitchResult {
  supported: boolean;
  dialogOpen: boolean;
  options: OrganizationOption[] | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  open: () => void;
  setDialogOpen: (open: boolean) => void;
  select: (organizationId: string) => Promise<void>;
}

// Botón "Cambiar de organización" del perfil: agrupa el estado y los
// handlers en un hook aparte de profile-page.tsx, que ya es un componente
// grande por su cuenta (banner, stats, notificaciones push, actividad
// reciente). Solo tiene efecto cuando el provider de auth expone
// listMyOrganizations/selectOrganization (ClerkBridgedAuthProvider) --
// AuthProvider (JWT legacy) no tiene concepto de organización.
export function useOrganizationSwitch(): UseOrganizationSwitchResult {
  const { listMyOrganizations, selectOrganization } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [options, setOptions] = useState<OrganizationOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    if (!listMyOrganizations) return;
    setDialogOpen(true);
    setError(null);
    setLoading(true);
    listMyOrganizations()
      .then(setOptions)
      .catch(() => setError("No pudimos cargar tus organizaciones."))
      .finally(() => setLoading(false));
  }

  async function select(organizationId: string) {
    if (!selectOrganization) return;
    setBusy(true);
    setError(null);
    try {
      const next = await selectOrganization(organizationId);
      // Recarga completa (no navegación de React Router): las páginas ya
      // montadas cachean datos del tenant anterior en su propio estado
      // local (useApiQuery no invalida por cambio de token/organización),
      // así que una transición SPA dejaría inventario/pedidos/etc. de la
      // empresa vieja mezclados con la sesión nueva. Un reload fuerza que
      // todo arranque limpio.
      window.location.assign(getDefaultPathForRole(next.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar de organización.");
      setBusy(false);
    }
  }

  return {
    supported: Boolean(listMyOrganizations),
    dialogOpen,
    options,
    loading,
    busy,
    error,
    open,
    setDialogOpen,
    select,
  };
}
