import { Building2, ChevronRight } from "lucide-react";
import { Logo } from "@/components/common/logo";
import type { OrganizationOption } from "@/app/clerk-org-activation";

interface OrganizationPickerProps {
  options: OrganizationOption[];
  onSelect: (organizationId: string) => Promise<unknown>;
  busy?: boolean;
}

// Multi-org: se muestra en vez del formulario de login (o de la app) cuando
// la persona ya se autenticó pero pertenece a 2+ organizaciones y todavía no
// hay una activa -- ver RequireAuth en app/auth.tsx. No usa el primitivo
// Dialog: no hay una app autenticada detrás para superponer, la persona
// todavía no entró a ningún tenant.
export function OrganizationPicker({ options, onSelect, busy }: OrganizationPickerProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Logo variant="brand" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-bold text-foreground">Elige tu empresa</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tu cuenta pertenece a más de una empresa en Logify. Elige con cuál quieres trabajar ahora.
          </p>

          <div className="mt-6 space-y-2">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(option.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition hover:border-primary hover:bg-accent disabled:opacity-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{option.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
