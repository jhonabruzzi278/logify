import { useState } from "react";
import { ShieldQuestion, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSecretQuestion, resetPasswordWithToken, verifySecretAnswer } from "@/lib/security-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { ErrorBanner, ForgotPasswordShell, PasswordResetDoneStep, PasswordResetStep } from "@/pages/forgot-password-shared";

type Step = "username" | "question" | "reset" | "done";

// Flujo legacy de pregunta secreta, para tenants que todavia no migraron a
// Clerk (ver forgot-password-page.tsx, que decide cual de los dos flujos
// mostrar segun el host). Misma logica, mismo contrato con
// security-service.ts, sin cambios de comportamiento para los tenants que
// dependen de este camino.
export function ForgotPasswordLegacyPage() {
  useDocumentMeta({ title: "Recuperar contraseña" });
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("username");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [question, setQuestion] = useState("");
  const [secretAnswer, setSecretAnswer] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleUsernameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const q = await getSecretQuestion(username);
      setQuestion(q);
      setStep("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo continuar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = await verifySecretAnswer(username, secretAnswer);
      setResetToken(token);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Respuesta secreta incorrecta.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPasswordWithToken(resetToken, newPassword, confirmPassword);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ForgotPasswordShell showBackToLogin={step !== "done"}>
      {step === "username" ? (
        <>
          <h1 className="text-xl font-bold text-foreground">Recuperar contraseña</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ingresa tu usuario. Te haremos una pregunta secreta para confirmar tu identidad.
          </p>
          <form onSubmit={handleUsernameSubmit} className="mt-5 space-y-4">
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nombre.usuario"
                autoComplete="username"
                autoFocus
                disabled={busy}
                className="pl-10"
              />
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <Button type="submit" className="h-11 w-full bg-primary font-bold hover:bg-primary/90" disabled={busy || !username.trim()}>
              {busy ? "Buscando..." : "Continuar"}
            </Button>
          </form>
        </>
      ) : null}

      {step === "question" ? (
        <>
          <h1 className="text-xl font-bold text-foreground">Pregunta secreta</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Responde para confirmar que eres tú.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm font-medium text-foreground">{question}</p>
          </div>
          <form onSubmit={handleAnswerSubmit} className="mt-4 space-y-4">
            <Input
              type="text"
              value={secretAnswer}
              onChange={(e) => setSecretAnswer(e.target.value)}
              placeholder="Tu respuesta"
              autoFocus
              disabled={busy}
            />
            {error ? <ErrorBanner message={error} /> : null}
            <Button type="submit" className="h-11 w-full bg-primary font-bold hover:bg-primary/90" disabled={busy || !secretAnswer.trim()}>
              {busy ? "Verificando..." : "Verificar respuesta"}
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
          message="Ya puedes iniciar sesión con tu nueva contraseña."
          buttonLabel="Ir a iniciar sesión"
          onContinue={() => navigate("/login", { replace: true })}
        />
      ) : null}
    </ForgotPasswordShell>
  );
}
