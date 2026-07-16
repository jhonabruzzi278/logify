const BASE_URL_KEY = "logify-api-base-url";
const TOKEN_KEY = "logify-api-token";

export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export function getDefaultApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

export function readApiConfig(): ApiConfig {
  if (typeof window === "undefined") {
    return { baseUrl: getDefaultApiBaseUrl(), token: "" };
  }

  const isLocalEnv = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultUrl = getDefaultApiBaseUrl();

  // En desarrollo local, siempre usar URL relativa (pasa por proxy Vite)
  if (isLocalEnv) {
    window.localStorage.removeItem(BASE_URL_KEY);
    return { baseUrl: defaultUrl, token: window.localStorage.getItem(TOKEN_KEY) ?? "" };
  }

  // En produccion, el build-time VITE_API_BASE_URL siempre tiene prioridad
  // sobre lo almacenado (la IP publica cambia con cada deploy de ECS)
  const baseUrl = defaultUrl || window.localStorage.getItem(BASE_URL_KEY) || "";

  return {
    baseUrl,
    token: window.localStorage.getItem(TOKEN_KEY) ?? ""
  };
}

export function writeApiConfig(config: ApiConfig) {
  const isLocalEnv = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isLocalEnv) {
    // Siempre persistir el baseUrl para sesiones futuras sin build-time env var
    window.localStorage.setItem(BASE_URL_KEY, config.baseUrl.trim() || getDefaultApiBaseUrl());
  }
  window.localStorage.setItem(TOKEN_KEY, config.token.trim());
}

export function clearApiConfig() {
  window.localStorage.removeItem(BASE_URL_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}