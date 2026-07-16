const HISTORY_KEY = "logify-order-history:v2";

export interface HistoryEntry {
  id: string;
  orderId: string;
  action: "created" | "confirmed" | "cancelled" | "dispatched" | "in_transit" | "delivered" | "rejected";
  actor: string;
  actorRole: string;
  detail: string;
  timestamp: string;
}

export function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "timestamp">) {
  const history = readHistory();
  history.unshift({
    ...entry,
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
  window.dispatchEvent(new CustomEvent("logify-history-updated", { detail: { orderId: entry.orderId } }));
}

export function getOrderHistory(orderId: string): HistoryEntry[] {
  return readHistory().filter((e) => e.orderId === orderId);
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
