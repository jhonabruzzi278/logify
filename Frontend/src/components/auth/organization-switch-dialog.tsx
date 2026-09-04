import { Building2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { OrganizationOption } from "@/app/clerk-org-activation";

interface OrganizationSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: OrganizationOption[] | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  currentSlug?: string;
  onSelect: (organizationId: string) => void;
}

// Variante del selector de login (organization-picker.tsx) para cuando la
// persona YA está dentro de la app: se muestra en un Dialog sobre el shell
// autenticado en vez de ocupar toda la pantalla, que es lo que corresponde
// antes de tener una sesión activa.
export function OrganizationSwitchDialog({
  open,
  onOpenChange,
  options,
  loading,
  busy,
  error,
  currentSlug,
  onSelect,
}: OrganizationSwitchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar de organización</DialogTitle>
          <DialogDescription>Elige con cuál empresa quieres trabajar ahora.</DialogDescription>
        </DialogHeader>

        {loading && <p className="py-4 text-center text-sm text-muted-foreground">Buscando tus organizaciones...</p>}

        {!loading && error && <p className="py-2 text-sm text-red-500">{error}</p>}

        {!loading && !error && options && options.length <= 1 && (
          <p className="py-2 text-sm text-muted-foreground">Solo perteneces a esta organización por ahora.</p>
        )}

        {!loading && !error && options && options.length > 1 && (
          <div className="space-y-2">
            {options.map((option) => {
              const isCurrent = option.slug === currentSlug;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || isCurrent}
                  onClick={() => onSelect(option.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                    isCurrent && "border-primary bg-accent"
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{option.name}</span>
                  {isCurrent && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
