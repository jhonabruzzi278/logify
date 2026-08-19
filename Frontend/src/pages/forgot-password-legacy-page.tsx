import { useState } from "react";
import { CheckCircle2, KeyRound, Lock, ShieldQuestion, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getSecretQuestion, resetPasswordWithToken, verifySecretAnswer } from "@/lib/security-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";
import { Logo } from "@/components/common/logo";

type Step = "username" | "question" | "reset" | "done";

const PASSWORD_RULES = [
  "Al menos 10 caracteres",
  "Una letra mayúscula y una minúscula",
  "Un número",
  "Un símbolo (por ejemplo: ! @ # $)",
];

// Flujo legacy de pregunta secreta, para tenants que todavia no migraron a
// Clerk (ver forgot-password-page.tsx, que decide cual de los dos flujos
// mostrar segun el host). Extraido tal cual de ForgotPasswordPage -- misma
// logica, mismo contrato con security-service.ts, sin cambios de
// comportamiento para los tenants que dependen de este camino.
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
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <Button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="mt-5 h-11 w-full bg-primary font-bold hover:bg-primary/90"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Ir a iniciar sesión
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
