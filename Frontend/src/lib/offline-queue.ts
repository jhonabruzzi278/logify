type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  body?: string;
  timestamp: number;
  retries: number;
};

const QUEUE_KEY = "logify-offline-queue:v1";
const MAX_RETRIES = 3;

function readQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOffline(url: string, method: string, body?: string): string {
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const queue = readQueue();
  queue.push({ id, url, method, body, timestamp: Date.now(), retries: 0 });
  writeQueue(queue);
  window.dispatchEvent(new CustomEvent("logify-offline-queued"));
  return id;
}

export function dequeueOffline(id: string) {
  const queue = readQueue().filter((r) => r.id !== id);
  writeQueue(queue);
}

export function getPendingCount(): number {
  return readQueue().length;
}

export async function processOfflineQueue(fetchFn: (url: string, init?: RequestInit) => Promise<Response>) {
  const queue = readQueue();
  if (!queue.length) return;

  const remaining: QueuedRequest[] = [];

  for (const req of queue) {
    try {
      await fetchFn(req.url, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: req.body,
      });
    } catch {
      if (req.retries < MAX_RETRIES) {
        remaining.push({ ...req, retries: req.retries + 1 });
      }
    }
  }

  writeQueue(remaining);
  if (remaining.length > 0) {
    window.dispatchEvent(new CustomEvent("logify-offline-retry-failed"));
  } else {
    window.dispatchEvent(new CustomEvent("logify-offline-processed"));
  }
}

export function exponentialBackoff(attempt: number, baseMs = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt), 30000);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseMs = 1000
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, exponentialBackoff(attempt, baseMs)));
      }
    }
  }
  throw lastError!;
}
