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

export interface UserInvitation {
  id: number;
  email: string;
  name: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
}

async function invitationRequest(token: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "No se pudo procesar la invitación" })) as { error?: string };
    throw new Error(body.error || "No se pudo procesar la invitación");
  }
  return response;
}

export async function inviteUser(token: string, data: { email: string; name: string; role: string }): Promise<UserInvitation> {
  const response = await invitationRequest(token, "/api/auth/invitations", { method: "POST", body: JSON.stringify(data) });
  return response.json() as Promise<UserInvitation>;
}

export async function fetchInvitations(token: string): Promise<UserInvitation[]> {
  const response = await invitationRequest(token, "/api/auth/invitations");
  return response.json() as Promise<UserInvitation[]>;
}

export async function resendInvitation(token: string, id: number): Promise<UserInvitation> {
  const response = await invitationRequest(token, `/api/auth/invitations/${id}/resend`, { method: "POST" });
  return response.json() as Promise<UserInvitation>;
}

export async function revokeInvitation(token: string, id: number): Promise<void> {
  await invitationRequest(token, `/api/auth/invitations/${id}`, { method: "DELETE" });
}

export async function fetchUsers(token: string): Promise<Array<{ id: number; username: string; name: string; email: string; role: string; created_at: string; updated_at: string; last_login_at: string | null }>> {
  const response = await fetch(apiUrl("/api/auth/users"), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener la lista de usuarios");
  }

  return response.json() as Promise<Array<{ id: number; username: string; name: string; email: string; role: string; created_at: string; updated_at: string; last_login_at: string | null }>>;
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
