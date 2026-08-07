import { getTenantSlug, readApiConfig } from "@/lib/api-config";

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const tenantSlug = getTenantSlug();
  return { ...(extra ?? {}), ...(tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {}) };
}

export async function getSecretQuestion(username: string): Promise<string> {
  const { baseUrl } = readApiConfig();
  const response = await fetch(`${baseUrl}/api/security/forgot-password/question?username=${encodeURIComponent(username.trim().toLowerCase())}`, {
    headers: tenantHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "No se pudo obtener la pregunta secreta."));
  }
  const data = (await response.json()) as { question: string };
  return data.question;
}

export async function verifySecretAnswer(username: string, secretAnswer: string): Promise<string> {
  const { baseUrl } = readApiConfig();
  const response = await fetch(`${baseUrl}/api/security/forgot-password/verify`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ username: username.trim().toLowerCase(), secretAnswer }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Usuario o respuesta secreta incorrecta."));
  }
  const data = (await response.json()) as { resetToken: string };
  return data.resetToken;
}

export async function resetPasswordWithToken(resetToken: string, newPassword: string, confirmPassword: string): Promise<void> {
  const { baseUrl } = readApiConfig();
  const response = await fetch(`${baseUrl}/api/security/forgot-password/reset`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "No se pudo restablecer la contraseña."));
  }
}
