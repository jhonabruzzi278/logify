import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSecretQuestion, verifySecretAnswer, resetPasswordWithToken } from "@/lib/security-service";

vi.mock("@/lib/api-config", () => ({
  readApiConfig: () => ({ baseUrl: "http://test.local", token: "" }),
  getTenantSlug: vi.fn(),
}));

import { getTenantSlug } from "@/lib/api-config";

describe("security-service — header de tenant en el flujo de recuperar contraseña", () => {
  beforeEach(() => {
    vi.mocked(getTenantSlug).mockReset();
    vi.mocked(getTenantSlug).mockReturnValue("minimarketelsol");
  });

  it("getSecretQuestion envia X-Tenant-Slug", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ question: "¿Tu color favorito?" }), { status: 200 })
    );
    globalThis.fetch = fetchMock;

    await getSecretQuestion("ana");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Tenant-Slug")).toBe("minimarketelsol");
  });

  it("verifySecretAnswer envia X-Tenant-Slug", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ resetToken: "tok-123" }), { status: 200 })
    );
    globalThis.fetch = fetchMock;

    await verifySecretAnswer("ana", "azul");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Tenant-Slug")).toBe("minimarketelsol");
  });

  it("resetPasswordWithToken envia X-Tenant-Slug", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    await resetPasswordWithToken("tok-123", "NuevaClave2026!", "NuevaClave2026!");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Tenant-Slug")).toBe("minimarketelsol");
  });
});
