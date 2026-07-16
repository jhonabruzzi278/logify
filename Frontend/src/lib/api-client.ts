import type { ApiErrorResponse } from "@/types/api";
import { readApiConfig, getTenantSlug } from "@/lib/api-config";

const DEFAULT_TIMEOUT_MS = 30_000;

type AuthErrorListener = (status: number) => void;
type AuthRefreshHandler = () => Promise<string | null>;

interface ApiClientDeps {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  onAuthError?: AuthErrorListener;
  onAuthRefresh?: AuthRefreshHandler;
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isTimeout() {
    return this.status === 408;
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null;
  private timeoutMs: number;
  private onAuthError: AuthErrorListener | null;
  private onAuthRefresh: AuthRefreshHandler | null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(deps: ApiClientDeps = {}) {
    const stored = readApiConfig();
    this.baseUrl = (deps.baseUrl ?? stored.baseUrl).trim();
    this.token = (deps.token ?? stored.token)?.trim() || null;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onAuthError = deps.onAuthError ?? null;
    this.onAuthRefresh = deps.onAuthRefresh ?? null;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  setAuthErrorListener(listener: ((status: number) => void) | null) {
    this.onAuthError = listener;
  }

  setAuthRefreshHandler(handler: (() => Promise<string | null>) | null) {
    this.onAuthRefresh = handler;
  }

  async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    return this.handleResponse<T>(response);
  }

  /** Para respuestas binarias (PDF, PNG) que no deben parsearse como JSON. */
  async fetchBlob(path: string, init?: RequestInit): Promise<Blob> {
    const response = await this.request(path, init);
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try {
        const payload = (await response.json()) as ApiErrorResponse;
        message = payload?.error ?? message;
      } catch {
        /* cuerpo no JSON */
      }
      if (response.status === 401 || response.status === 403) {
        this.onAuthError?.(response.status);
      }
      throw new ApiRequestError(message, response.status);
    }
    return response.blob();
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let response = await this.executeWithTimeout(url, init);

    if ((response.status === 401 || response.status === 403) && this.onAuthRefresh) {
      const refreshed = await this.dedupeRefresh();
      if (refreshed) {
        this.token = refreshed;
        response = await this.executeWithTimeout(url, init);
      }
    }

    return response;
  }

  private async dedupeRefresh(): Promise<string | null> {
    if (!this.onAuthRefresh) return null;
    if (!this.refreshPromise) {
      this.refreshPromise = this.onAuthRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async executeWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = init?.signal ? combineSignals(init.signal, controller.signal) : controller.signal;

    try {
      return await fetch(url, {
        ...init,
        signal,
        headers: this.buildHeaders(init)
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiRequestError("La solicitud excedio el tiempo limite.", 408);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHeaders(init?: RequestInit): Headers {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    } else {
      headers.delete("Authorization");
    }
    const tenantSlug = getTenantSlug();
    if (tenantSlug) {
      headers.set("X-Tenant-Slug", tenantSlug);
    }
    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try {
        const payload = (await response.json()) as ApiErrorResponse;
        message = payload?.error ?? message;
      } catch {
        /* cuerpo no JSON */
      }

      if (response.status === 401 || response.status === 403) {
        this.onAuthError?.(response.status);
      }

      throw new ApiRequestError(message, response.status);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  if (AbortSignal.any) {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export const apiClient = new ApiClient();

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiClient.fetch<T>(path, init);
}

export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  return apiClient.fetchBlob(path, init);
}

export function setApiAuthErrorListener(listener: ((status: number) => void) | null) {
  apiClient.setAuthErrorListener(listener);
}

export function setApiAuthRefreshHandler(handler: (() => Promise<string | null>) | null) {
  apiClient.setAuthRefreshHandler(handler);
}

export function updateApiToken(token: string | null): void {
  apiClient.setToken(token);
}
