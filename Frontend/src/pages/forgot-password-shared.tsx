import { CheckCircle2, KeyRound, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { Logo } from "@/components/common/logo";

export const PASSWORD_RULES = [
  "Al menos 10 caracteres",
  "Una letra mayúscula y una minúscula",
  "Un número",
  "Un símbolo (por ejemplo: ! @ # $)",
];

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
      {message}
    </div>
  );
}

export function PasswordRulesList() {
  return (
    <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2.5">
      {PASSWORD_RULES.map((rule) => (
        <li key={rule} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          {rule}
        </li>
      ))}
    </ul>
  );
}

interface PasswordResetStepProps {
  newPassword: string;
  confirmPassword: string;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

// Paso final compartido ("nueva contraseña") de ambos flujos de reset -- el
// contenido es identico una vez que cada uno confirmo la identidad por su
// propio camino (Clerk o pregunta secreta), asi que cada pagina solo aporta
// su propio estado y su propio handler de submit.
export function PasswordResetStep({
  newPassword,
  confirmPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  busy,
  error,
  onSubmit,
}: PasswordResetStepProps) {
  return (
    <>
      <h1 className="text-xl font-bold text-foreground">Nueva contraseña</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Identidad confirmada. Define una contraseña nueva y segura.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => onNewPasswordChange(e.target.value)}
            placeholder="Contraseña nueva"
            autoComplete="new-password"
            autoFocus
            disabled={busy}
            className="pl-10"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            placeholder="Confirma la contraseña nueva"
            autoComplete="new-password"
            disabled={busy}
            className="pl-10"
          />
        </div>

        <PasswordRulesList />

        {error ? <ErrorBanner message={error} /> : null}
        <Button
          type="submit"
          className="h-11 w-full bg-primary font-bold hover:bg-primary/90"
          disabled={busy || !newPassword || !confirmPassword}
        >
          {busy ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </form>
    </>
  );
}

interface PasswordResetDoneStepProps {
  message: string;
  buttonLabel: string;
  onContinue: () => void;
}

// Paso final compartido ("contraseña actualizada") de ambos flujos -- solo
// cambia el mensaje y el destino del boton (login vs panel), asi que cada
// pagina aporta esos dos valores y el callback de continuar.
export function PasswordResetDoneStep({ message, buttonLabel, onContinue }: PasswordResetDoneStepProps) {
  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
      <h1 className="mt-3 text-xl font-bold text-foreground">Contraseña actualizada</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
      <Button
        type="button"
        onClick={onContinue}
        className="mt-5 h-11 w-full bg-primary font-bold hover:bg-primary/90"
      >
        <KeyRound className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>
    </div>
  );
}

interface ForgotPasswordShellProps extends PropsWithChildren {
  showBackToLogin: boolean;
}

// Chrome compartido entre los dos flujos de "olvidé mi contraseña"
// (forgot-password-clerk-page.tsx y forgot-password-legacy-page.tsx, ver
// forgot-password-page.tsx para el router que elige entre ambos): mismo
// fondo, misma tarjeta, mismo pie de pagina. Cada pagina solo aporta el
// contenido de su paso actual como children -- la logica de cada flujo
// (Clerk vs pregunta secreta) vive exclusivamente en cada pagina.
export function ForgotPasswordShell({ children, showBackToLogin }: ForgotPasswordShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-48 -left-32 h-[380px] w-[380px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo variant="brand" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>

        {showBackToLogin ? (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        ) : null}
      </div>
      <SupportWhatsappButton variant="mono" />
    </div>
  );
}
