import { useState } from "react";
import { CheckCircle2, KeyRound, Lock, User } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { acceptInvite } from "@/lib/local-jwt-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export function InvitePage() {
  useDocumentMeta({ title: "Aceptar invitación" });
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("El enlace de invitación no es válido.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await acceptInvite(token, { username: username.trim(), password, name: name.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1A3142]">
            <span className="text-lg font-bold text-white">S</span>
          </div>
          <span className="text-lg font-bold text-foreground">Logify</span>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#4B98CF]" />
              <h1 className="mt-3 text-xl font-bold text-foreground">Cuenta creada</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Ya puedes iniciar sesión con tu nuevo usuario.
              </p>
              <Button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="mt-5 h-11 w-full bg-[#4B98CF] font-bold hover:bg-[#346384]"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Ir a iniciar sesión
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground">Aceptar invitación</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Crea tu usuario y contraseña para unirte al equipo.
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    autoComplete="name"
                    autoFocus
                    disabled={busy}
                    className="pl-10"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="nombre.usuario"
                    autoComplete="username"
                    disabled={busy}
                    className="pl-10"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    autoComplete="new-password"
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
                    placeholder="Confirma la contraseña"
                    autoComplete="new-password"
                    disabled={busy}
                    className="pl-10"
                  />
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="h-11 w-full bg-[#4B98CF] font-bold hover:bg-[#346384]"
                  disabled={busy || !username.trim() || !name.trim() || !password || !confirmPassword}
                >
                  {busy ? "Creando cuenta..." : "Crear cuenta"}
                </Button>
              </form>
            </>
          )}
        </div>

        {!done ? (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            <Link to="/login" className="font-medium text-[#4B98CF] hover:underline">
              Ya tengo una cuenta
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
