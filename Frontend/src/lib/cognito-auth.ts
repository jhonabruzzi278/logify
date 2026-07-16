import { generateDemoTokens, isLocalDemoEnvironment } from "@/lib/demo-auth";
import { loginWithLocalJwt } from "@/lib/local-jwt-auth";

const DEFAULT_COGNITO_ENDPOINT = import.meta.env.VITE_COGNITO_ENDPOINT ?? "/aws/cognito";
const DEFAULT_COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "logifywebclient";

interface CognitoErrorPayload {
  __type?: string;
  message?: string;
}

interface JwtPayload {
  [key: string]: unknown;
}

export interface CognitoAuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split(".");
  const payloadPart = parts[1];

  if (!payloadPart) {
    throw new Error("Token JWT invalido.");
  }

  return JSON.parse(decodeBase64Url(payloadPart)) as JwtPayload;
}

function getCognitoErrorMessage(payload: CognitoErrorPayload | null, status: number, fallbackMessage: string) {
  const type = payload?.__type ?? "";
  const message = payload?.message ?? "";

  if (type.includes("NotAuthorizedException")) {
    return fallbackMessage;
  }

  if (type.includes("UserNotConfirmedException")) {
    return "La cuenta aun no esta confirmada.";
  }

  if (type.includes("PasswordResetRequiredException")) {
    return "La cuenta requiere restablecer contrasena.";
  }

  return message || `${fallbackMessage} (HTTP ${status}).`;
}

async function postToCognito<TResponse>(target: string, body: Record<string, unknown>, fallbackMessage: string): Promise<TResponse> {
  const response = await fetch(DEFAULT_COGNITO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": target
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let payload: CognitoErrorPayload | null = null;

    try {
      payload = (await response.json()) as CognitoErrorPayload;
    } catch {
      payload = null;
    }

    throw new Error(getCognitoErrorMessage(payload, response.status, fallbackMessage));
  }

  const raw = await response.text();
  return raw ? (JSON.parse(raw) as TResponse) : ({} as TResponse);
}

function parseAuthenticationResult(data: {
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
    TokenType?: string;
  };
}): CognitoAuthResult {
  const auth = data.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken || !auth.ExpiresIn) {
    throw new Error("Cognito no devolvio un resultado de autenticacion valido.");
  }

  return {
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken: auth.RefreshToken ?? "",
    expiresIn: auth.ExpiresIn,
    tokenType: auth.TokenType ?? "Bearer"
  };
}

export async function loginWithCognito(username: string, password: string): Promise<CognitoAuthResult> {
  const data = await postToCognito<{
    AuthenticationResult?: {
      AccessToken?: string;
      IdToken?: string;
      RefreshToken?: string;
      ExpiresIn?: number;
      TokenType?: string;
    };
  }>(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: DEFAULT_COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    },
    "Credenciales invalidas. Revisa tu correo y contrasena."
  );

  return parseAuthenticationResult(data);
}

export async function refreshCognitoSession(refreshToken: string): Promise<CognitoAuthResult> {
  if (isLocalDemoEnvironment()) {
    const payload = decodeJwtPayload(refreshToken);
    const username = typeof payload.email === "string" ? payload.email : typeof payload.sub === "string" ? payload.sub : "";
    if (!username) {
      throw new Error("Token demo invalido.");
    }
    return generateDemoTokens(username, "Logify123!");
  }

  if (useLocalJwtAuth()) {
    throw new Error("La sesion expiro. Vuelve a iniciar sesion.");
  }

  const data = await postToCognito<{
    AuthenticationResult?: {
      AccessToken?: string;
      IdToken?: string;
      RefreshToken?: string;
      ExpiresIn?: number;
      TokenType?: string;
    };
  }>(
    "AWSCognitoIdentityProviderService.InitiateAuth",
    {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: DEFAULT_COGNITO_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    },
    "La sesion ya no es valida. Vuelve a iniciar sesion."
  );

  return parseAuthenticationResult(data);
}

export async function globalSignOut(accessToken: string): Promise<void> {
  if (isLocalDemoEnvironment() || useLocalJwtAuth()) {
    return;
  }

  await postToCognito<Record<string, never>>(
    "AWSCognitoIdentityProviderService.GlobalSignOut",
    {
      AccessToken: accessToken
    },
    "No se pudo cerrar la sesion en Cognito."
  );
}

export function useLocalJwtAuth(): boolean {
  if (import.meta.env.VITE_AUTH_MODE === "local") return true;
  if (import.meta.env.VITE_AUTH_MODE === "demo" || import.meta.env.VITE_AUTH_MODE === "cognito") return false;
  return !isLocalDemoEnvironment();
}

export async function loginWithCognitoOrDemo(username: string, password: string): Promise<CognitoAuthResult> {
  if (isLocalDemoEnvironment()) {
    return generateDemoTokens(username, password);
  }

  if (useLocalJwtAuth()) {
    return loginWithLocalJwt(username, password);
  }

  return loginWithCognito(username, password);
}