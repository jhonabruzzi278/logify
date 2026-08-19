import { useState } from "react";
import { CheckCircle2, KeyRound, Lock, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { activateFirstOrganizationMembership } from "@/app/clerk-auth-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { Logo } from "@/components/common/logo";

type Step = "email" | "code" | "reset" | "done";

const PASSWORD_RULES = [
  "Al menos 10 caracteres",
  "Una letra mayúscula y una minúscula",
  "Un número",
  "Un símbolo (por ejemplo: ! @ # $)",
];

const RESET_STRATEGY = "reset_password_email_code" as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Reset de contraseña nativo de Clerk para tenants migrados (ver
// forgot-password-page.tsx, que decide cual de los dos flujos mostrar segun
// el host): correo -> codigo -> nueva contraseña, sin pregunta secreta y sin
// tocar Postgres -- Clerk es la unica fuente de verdad de la credencial para
// estos tenants. Termina con la sesion activa (igual que login()) para que
// el usuario no tenga que volver a autenticarse tras cambiar la contraseña.
export function ForgotPasswordClerkPage() {
  useDocumentMeta({ title: "Recuperar contraseña" });
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();

  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setBusy(true);
    try {
      await signIn.create({ strategy: RESET_STRATEGY, identifier: email.trim() });
      setStep("code");
    } catch (err) {
      setError(errorMessage(err, "No se pudo enviar el código. Revisa el correo ingresado."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);
    setBusy(true);
    try {
      const attempt = await signIn.attemptFirstFactor({ strategy: RESET_STRATEGY, code: code.trim() });
      if (attempt.status !== "needs_new_password") {
        throw new Error("El código no es válido o ya expiró.");
      }
      setStep("reset");
    } catch (err) {
      setError(errorMessage(err, "El código no es válido o ya expiró."));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signIn || !setActive) return;
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await signIn.resetPassword({ password: newPassword });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("No se pudo restablecer la contraseña.");
      }
      await setActive({ session: result.createdSessionId });
      // La contraseña ya se cambio y la sesion ya esta activa en este punto --
      // si activar la Organization falla (ej. hiccup de red en el reload()),
      // no tiene sentido bloquear al usuario con un error: signIn.resetPassword()
      // no es reintentable una vez "complete", asi que mostrar error aqui lo
      // dejaria atascado en la pantalla de reset estando ya autenticado. Se
      // deja avanzar a "done" igual; si el JWT sale sin organizacion activa,
      // el resto de la app ya maneja ese caso (ver clerk-auth-bridge.tsx).
      try {
        await activateFirstOrganizationMembership(clerk, setActive, result.createdSessionId);
      } catch {
        // no-op intencional, ver comentario de arriba.
      }
      setStep("done");
    } catch (err) {
      setError(errorMessage(err, "No se pudo restablecer la contraseña."));
    } finally {
      setBusy(false);
    }
  }

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

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {step === "email" ? (
            <>
              <h1 className="text-xl font-bold text-foreground">Recuperar contraseña</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Ingresa tu correo y te enviamos un código para restablecerla.
              </p>
              <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    autoFocus
                    disabled={busy}
                    className="pl-10"
                  />
                </div>
                {error ? <ErrorBanner message={error} /> : null}
                <Button type="submit" className="h-11 w-full bg-primary font-bold hover:bg-primary/90" disabled={busy || !email.trim()}>
                  {busy ? "Enviando..." : "Enviar código"}
                </Button>
              </form>
            </>
          ) : null}

          {step === "code" ? (
            <>
              <h1 className="text-xl font-bold text-foreground">Revisa tu correo</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Te enviamos un código a <strong>{email}</strong>. Ingrésalo para continuar.
              </p>
              <form onSubmit={handleCodeSubmit} className="mt-4 space-y-4">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de 6 dígitos"
                  autoFocus
                  disabled={busy}
                />
                {error ? <ErrorBanner message={error} /> : null}
                <Button type="submit" className="h-11 w-full bg-primary font-bold hover:bg-primary/90" disabled={busy || !code.trim()}>
                  {busy ? "Verificando..." : "Verificar código"}
                </Button>
              </form>
            </>
          ) : null}

          {step === "reset" ? (
            <>
              <h1 className="text-xl font-bold text-foreground">Nueva contraseña</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Identidad confirmada. Define una contraseña nueva y segura.
              </p>
              <form onSubmit={handleResetSubmit} className="mt-4 space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirma la contraseña nueva"
                    autoComplete="new-password"
                    disabled={busy}
                    className="pl-10"
                  />
                </div>

                <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2.5">
                  {PASSWORD_RULES.map((rule) => (
                    <li key={rule} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      {rule}
                    </li>
                  ))}
                </ul>

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
          ) : null}

          {step === "done" ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h1 className="mt-3 text-xl font-bold text-foreground">Contraseña actualizada</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Ya iniciaste sesión con tu nueva contraseña.
              </p>
              <Button
                type="button"
                onClick={() => navigate("/dashboard", { replace: true })}
                className="mt-5 h-11 w-full bg-primary font-bold hover:bg-primary/90"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Ir a mi panel
              </Button>
            </div>
          ) : null}
        </div>

        {step !== "done" ? (
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
      {message}
    </div>
  );
}
