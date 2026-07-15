import { apiFetch } from "@/lib/api-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error("Push no soportado en este navegador");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso de notificaciones denegado");

  const { publicKey } = await apiFetch<{ publicKey: string | null }>("/api/notifications/push/vapid-public-key");
  if (!publicKey) throw new Error("El servidor no tiene configurada la clave VAPID");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  const json = subscription.toJSON();
  await apiFetch("/api/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiFetch("/api/notifications/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint })
  }).catch(() => {});
}
