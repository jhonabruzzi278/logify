import { SignIn } from "@clerk/clerk-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { isClerkConfigured } from "@/lib/clerk-config";

// Groundwork Clerk (ver ADR-004): pagina de prueba, separada del /login real,
// para validar el inicio de sesion con Clerk sin afectar el flujo actual.
// No esta enlazada desde ningun lugar de la navegacion -- se accede escribiendo
// la URL directamente mientras dura la fase de groundwork.
export function LoginClerkPage() {
  useDocumentMeta({
    title: "Login con Clerk (prueba)",
    description: "Pagina de diagnostico para probar el login con Clerk.",
    canonicalPath: "/login-clerk"
  });

  if (!isClerkConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Clerk no está configurado en este entorno.</p>
          <p>
            Falta la variable <code className="rounded bg-muted px-1 py-0.5">VITE_CLERK_PUBLISHABLE_KEY</code>. Ver el
            checklist de configuración en <code className="rounded bg-muted px-1 py-0.5">ADR-004</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <SignIn />
    </div>
  );
}
