import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { router } from "@/app/router";
import { AuthProvider } from "@/app/auth";
import { ClerkAuthProvider } from "@/app/clerk-provider";
import { ClerkBridgedAuthProvider } from "@/app/clerk-auth-bridge";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { ToastProvider } from "@/components/common/toast-provider";
import { BusinessModeProvider } from "@/hooks/use-business-mode";
import { isClerkConfigured } from "@/lib/clerk-config";
import "@/styles/index.css";

const isLocalEnvironment = ["localhost", "127.0.0.1"].includes(window.location.hostname);

if (isLocalEnvironment && "caches" in window) {
  // Limpia caches de builds anteriores; el SW de dev (devOptions.enabled) no
  // precachea, así que no hay riesgo de servir JS obsoleto durante HMR.
  window.addEventListener("load", () => {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  });
}

let isReloadingForUpdate = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloadingForUpdate) return;
    isReloadingForUpdate = true;
    window.location.reload();
  });
}

let updateServiceWorker: (reloadPage?: boolean) => Promise<void> = async () => undefined;
updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh: () => {
    void updateServiceWorker(true);
  },
  onRegisteredSW: (_serviceWorkerUrl, registration) => {
    void registration?.update();
  },
});

// Fase 2 de ADR-004 (corte real): con Clerk configurado, ClerkBridgedAuthProvider
// (que usa hooks de Clerk) reemplaza a AuthProvider -- ambos implementan el
// mismo AuthContext, asi que login-page.tsx y el resto de la app no cambian.
// Sin la env var (local/dev/tests sin Clerk), el arbol es identico al de antes.
const authTree = isClerkConfigured() ? (
  <ClerkAuthProvider>
    <ClerkBridgedAuthProvider>
      <BusinessModeProvider>
        <RouterProvider router={router} />
      </BusinessModeProvider>
    </ClerkBridgedAuthProvider>
  </ClerkAuthProvider>
) : (
  <AuthProvider>
    <BusinessModeProvider>
      <RouterProvider router={router} />
    </BusinessModeProvider>
  </AuthProvider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>{authTree}</ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
