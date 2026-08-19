import { shouldActivateClerk } from "@/lib/clerk-config";
import { isPlatformPortalHostname } from "@/lib/tenant-navigation";
import { ForgotPasswordClerkPage } from "@/pages/forgot-password-clerk-page";
import { ForgotPasswordLegacyPage } from "@/pages/forgot-password-legacy-page";
import { WorkspacePortalPage } from "@/pages/workspace-portal-page";

// Router segun el host (ver clerk-config.ts para el porque de shouldActivateClerk
// en vez de isClerkConfigured() a secas). Antes del fix, esta pagina mostraba
// WorkspacePortalPage en app.logify.cl sin importar si Clerk estaba activo --
// un callejon sin salida para el tenant "logify" (slug reservado, sin
// subdominio propio) y, si se hubiera quitado el gate sin más, un riesgo real:
// el flujo legacy habría "restablecido" un password_hash en Postgres que ya
// no es la credencial real de un usuario migrado a Clerk.
export function ForgotPasswordPage() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (shouldActivateClerk(hostname)) return <ForgotPasswordClerkPage />;
  if (isPlatformPortalHostname(hostname)) return <WorkspacePortalPage destination="/forgot-password" />;
  return <ForgotPasswordLegacyPage />;
}
