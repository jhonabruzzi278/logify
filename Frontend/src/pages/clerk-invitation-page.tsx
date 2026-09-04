import { SignIn, SignUp } from "@clerk/react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Logo } from "@/components/common/logo";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { isClerkConfigured } from "@/lib/clerk-config";

type InvitationStatus = "sign_in" | "sign_up" | "complete" | null;

function InvitationCard({ status }: { status: InvitationStatus }) {
  if (status === "complete") return <Navigate to="/dashboard" replace />;

  if (!status) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-3 text-xl font-bold text-[#172554]">Invitación no válida</h1>
        <p className="mt-2 text-sm text-[#64748B]">Abre el enlace completo que recibiste por correo. El enlace puede haber vencido.</p>
        <Link to="/login" className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#2563EB] px-5 text-sm font-bold text-white">Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-[#2563EB]" />
        <h1 className="mt-2 text-2xl font-bold text-[#172554]">Únete a tu equipo</h1>
        <p className="mt-1 text-sm text-[#64748B]">Completa tu acceso. El rol asignado por el administrador se aplicará automáticamente.</p>
      </div>
      <div className="flex justify-center overflow-hidden rounded-2xl">
        {status === "sign_up" ? (
          <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/dashboard" />
        ) : (
          <SignIn routing="hash" signUpUrl="/accept-invitation" fallbackRedirectUrl="/dashboard" />
        )}
      </div>
    </div>
  );
}

export function ClerkInvitationPage() {
  useDocumentMeta({ title: "Aceptar invitación" });
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const ticket = params.get("__clerk_ticket");
  const rawStatus = params.get("__clerk_status");
  const status: InvitationStatus = rawStatus === "sign_in" || rawStatus === "sign_up" || rawStatus === "complete" ? rawStatus : null;
  const ready = isClerkConfigured() && Boolean(ticket);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-[#F8FAFC] px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo variant="brand" /></div>
        {ready ? <InvitationCard status={status} /> : <InvitationCard status={null} />}
      </main>
      <SupportWhatsappButton variant="mono" />
    </div>
  );
}
