import { CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BillingPage() {
  return (
    <div className="space-y-4 max-w-sm w-full mx-auto sm:max-w-2xl px-2">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Cuenta</p>
        <h1 className="text-xl font-bold text-[#172554]">Plan y facturación</h1>
      </div>

      <div className="rounded border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10">
            <CreditCard className="h-5 w-5 text-[#2563EB]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#172554]">Plan Gratis</p>
            <p className="text-xs text-[#64748B]">Sin fecha de vencimiento</p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
          <p className="text-sm text-[#64748B]">
            Próximamente vas a poder cambiar de plan, actualizar tu método de pago y revisar tu historial de facturación desde aquí.
          </p>
        </div>

        <Button disabled className="mt-5 w-full bg-[#2563EB]/50 text-white cursor-not-allowed">
          Ver planes (próximamente)
        </Button>
      </div>
    </div>
  );
}
