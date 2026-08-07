import { describe, it, expect, vi, beforeEach } from "vitest";
import { loginWithBackend } from "@/lib/auth-service";

vi.mock("@/lib/api-config", () => ({
  readApiConfig: () => ({ baseUrl: "http://test.local", token: "" }),
  getTenantSlug: vi.fn(),
}));

import { getTenantSlug } from "@/lib/api-config";

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: object) => btoa(JSON.stringify(obj)).replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("loginWithBackend", () => {
  beforeEach(() => {
    vi.mocked(getTenantSlug).mockReset();
  });

  it("envia X-Tenant-Slug cuando hay tenant en el subdominio", async () => {
    vi.mocked(getTenantSlug).mockReturnValue("minimarketelsol");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ token: fakeJwt({ exp: 9999999999 }), role: "owner", name: "Ana", username: "ana" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock;

    await loginWithBackend({ username: "ana", password: "secret" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Tenant-Slug")).toBe("minimarketelsol");
  });

  it("no rompe cuando no hay tenant resuelto (dominio principal)", async () => {
    vi.mocked(getTenantSlug).mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ token: fakeJwt({ exp: 9999999999 }), role: "owner", name: "Ana", username: "ana" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock;

    await loginWithBackend({ username: "ana", password: "secret" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has("X-Tenant-Slug")).toBe(false);
  });

  it("propaga el mensaje de error del backend en credenciales invalidas", async () => {
    vi.mocked(getTenantSlug).mockReturnValue("minimarketelsol");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Credenciales invalidas" }), { status: 401 })
    );

    await expect(loginWithBackend({ username: "ana", password: "bad" })).rejects.toThrow("Credenciales invalidas");
  });
});
