import type { CognitoAuthResult } from "@/lib/cognito-auth";
import { decodeJwtPayload } from "@/lib/cognito-auth";
import { readApiConfig } from "@/lib/api-config";

function apiUrl(path: string): string {
  const { baseUrl } = readApiConfig();
  return `${baseUrl}${path}`;
}

interface LoginResponse {
  token: string;
  role: string;
  name: string;
  username: string;
}

export async function loginWithLocalJwt(username: string, password: string): Promise<CognitoAuthResult> {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    let message = "Credenciales invalidas.";
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = (await response.json()) as LoginResponse;

  const payload = decodeJwtPayload(data.token);
  const now = Math.floor(Date.now() / 1000);
  const exp = (payload.exp as number) || (now + 3600);
  const iat = (payload.iat as number) || now;
  const expiresIn = exp - iat;

  return {
    accessToken: data.token,
    idToken: data.token,
    refreshToken: "",
    expiresIn: expiresIn > 0 ? expiresIn : 28800,
    tokenType: "Bearer",
  };
}

export async function registerUser(
  token: string,
  userData: { username: string; password: string; name: string; role: string }
): Promise<{ id: number; username: string; name: string; role: string }> {
  const response = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Error al registrar" })) as { error?: string };
    throw new Error(body.error || "Error al registrar usuario");
  }

  return response.json() as Promise<{ id: number; username: string; name: string; role: string }>;
}

export async function inviteUser(
  token: string,
  data: { email: string; role: string }
): Promise<{ id: number; email: string; role: string; status: string; expires_at: string }> {
  const response = await fetch(apiUrl("/api/auth/invite"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Error al invitar" })) as { error?: string };
    throw new Error(body.error || "Error al invitar usuario");
  }

  return response.json() as Promise<{ id: number; email: string; role: string; status: string; expires_at: string }>;
}

export async function fetchUsers(token: string): Promise<Array<{ id: number; username: string; name: string; role: string; created_at: string; updated_at: string; last_login_at: string | null }>> {
  const response = await fetch(apiUrl("/api/auth/users"), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener la lista de usuarios");
  }

  return response.json() as Promise<Array<{ id: number; username: string; name: string; role: string; created_at: string; updated_at: string; last_login_at: string | null }>>;
}

export async function updateUser(
  token: string,
  id: number,
  data: { name?: string; role?: string; password?: string }
): Promise<{ id: number; username: string; name: string; role: string }> {
  const response = await fetch(apiUrl(`/api/auth/users/${id}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Error al actualizar" })) as { error?: string };
    throw new Error(body.error || "Error al actualizar usuario");
  }

  return response.json() as Promise<{ id: number; username: string; name: string; role: string }>;
}

export async function deleteUser(token: string, id: number): Promise<void> {
  const response = await fetch(apiUrl(`/api/auth/users/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Error al eliminar" })) as { error?: string };
    throw new Error(body.error || "Error al eliminar usuario");
  }
}
