import { useEffect, useState } from "react";
import { getApiConnectionConfig } from "@/lib/api-client";
import type { ServerCart } from "@/hooks/use-pos-cart";

export function usePosCartRealtime({
  authToken,
  onCart,
  onConnected,
}: {
  authToken?: string;
  onCart: (cart: ServerCart) => void;
  onConnected: () => void;
}) {
  const [connected, setConnected] = useState(false);

  // react-doctor-disable-next-line effect-needs-cleanup -- cleanup clears the reconnect timer, detaches every handler and closes the current socket.
  useEffect(() => {
    if (typeof WebSocket === "undefined") return () => undefined;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      if (stopped) return;
      const connection = getApiConnectionConfig();
      const token = authToken || connection.token;
      if (!token) {
        reconnectTimer = window.setTimeout(connect, 1000);
        return;
      }
      const url = new URL("/api/pos/cart/ws", connection.baseUrl || window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url, ["logify-cart-v1", `auth.${token}`]);
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        onConnected();
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; cart?: ServerCart };
          if (message.type === "cart" && message.cart) onCart(message.cart);
        } catch {
          // Un mensaje desconocido no debe cerrar el canal del carrito.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        setConnected(false);
        if (stopped) return;
        attempts += 1;
        const delay = Math.min(15000, 750 * (2 ** Math.min(attempts, 4)));
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
    };
  }, [authToken, onCart, onConnected]);

  return connected;
}
