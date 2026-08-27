import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiFetch } from "@/lib/api-client";
import { inviteUser } from "@/lib/local-jwt-auth";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...original, apiFetch: vi.fn() };
});

describe("inviteUser", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.restoreAllMocks();
  });

  it("usa el cliente compartido que renueva la sesión de Clerk", async () => {
    const invitation = {
      id: 7,
      email: "persona@empresa.test",
      role: "ops",
      status: "pending",
      expires_at: "2026-09-03T00:00:00.000Z",
    };
    vi.mocked(apiFetch).mockResolvedValue(invitation);

    await expect(inviteUser("token-no-registrado", {
      email: invitation.email,
      role: invitation.role,
    })).resolves.toEqual(invitation);
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/invite", {
      method: "POST",
      body: JSON.stringify({ email: invitation.email, role: invitation.role }),
    });
  });

  it("registra un diagnóstico seguro cuando la API rechaza la invitación", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(apiFetch).mockRejectedValue(new ApiRequestError("Token invalido", 401, "req-401"));

    await expect(inviteUser("secreto-que-no-debe-aparecer", {
      email: "privado@empresa.test",
      role: "ops",
    })).rejects.toThrow("Token invalido");

    expect(consoleError).toHaveBeenCalledWith("[inviteUser] invitación rechazada", {
      status: 401,
      message: "Token invalido",
      requestId: "req-401",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secreto-que-no-debe-aparecer");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("privado@empresa.test");
  });

  it("diagnostica un fallo de red sin exponer los datos de la invitación", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(inviteUser("otro-secreto", {
      email: "otro@empresa.test",
      role: "warehouse",
    })).rejects.toThrow("Failed to fetch");

    expect(consoleError).toHaveBeenCalledWith("[inviteUser] fallo de red al enviar invitación", {
      errorType: "TypeError",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("otro-secreto");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("otro@empresa.test");
  });
});
