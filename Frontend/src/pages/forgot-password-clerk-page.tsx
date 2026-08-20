import { useState } from "react";
import { Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { activateFirstOrganizationMembership } from "@/app/clerk-auth-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { ErrorBanner, ForgotPasswordShell, PasswordResetDoneStep, PasswordResetStep } from "@/pages/forgot-password-shared";

type Step = "email" | "code" | "reset" | "done";

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
    <ForgotPasswordShell showBackToLogin={step !== "done"}>
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
        <PasswordResetStep
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          onNewPasswordChange={setNewPassword}
          onConfirmPasswordChange={setConfirmPassword}
          busy={busy}
          error={error}
          onSubmit={handleResetSubmit}
        />
      ) : null}

      {step === "done" ? (
        <PasswordResetDoneStep
          message="Ya iniciaste sesión con tu nueva contraseña."
          buttonLabel="Ir a mi panel"
          onContinue={() => navigate("/dashboard", { replace: true })}
        />
      ) : null}
    </ForgotPasswordShell>
  );
}
