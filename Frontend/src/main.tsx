import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { router } from "@/app/router";
import { AuthProvider } from "@/app/auth";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { ToastProvider } from "@/components/common/toast-provider";
import { BusinessModeProvider } from "@/hooks/use-business-mode";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BusinessModeProvider>
            <RouterProvider router={router} />
          </BusinessModeProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
