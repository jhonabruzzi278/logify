import { DEFAULT_DEMO_PASSWORD, USER_BY_USERNAME } from "@/lib/user-registry";

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface DemoUser {
  username: string;
  name: string;
  groups: string[];
}

function buildJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = encodeBase64Url("demo-signature-local");
  return `${header}.${body}.${signature}`;
}

export function generateDemoTokens(username: string, password: string) {
  const user: DemoUser | undefined = USER_BY_USERNAME[username.toLowerCase()];
  if (!user) {
    throw new Error("Usuario no encontrado en modo demo local.");
  }

  if (password !== DEFAULT_DEMO_PASSWORD) {
    throw new Error(`Contrasena invalida en modo demo local. Usa ${DEFAULT_DEMO_PASSWORD}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;

  const basePayload = {
    sub: user.username,
    email: user.username,
    name: user.name,
    "cognito:groups": user.groups,
    iss: "https://cognito-idp.us-east-1.amazonaws.com/local-demo",
    aud: "logifywebclient",
    token_use: "id",
    auth_time: now,
    iat: now,
    exp: now + expiresIn
  };

  const idToken = buildJwt(basePayload);
  const accessToken = buildJwt({
    ...basePayload,
    token_use: "access",
    scope: "openid profile",
    client_id: "logifywebclient"
  });

  return {
    accessToken,
    idToken,
    refreshToken: buildJwt({ ...basePayload, token_use: "refresh", exp: now + 86400 * 30 }),
    expiresIn,
    tokenType: "Bearer"
  };
}

export function isLocalDemoEnvironment() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_ENABLE_DEMO === "true") return true;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}
