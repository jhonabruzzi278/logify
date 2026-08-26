import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { completeOnboarding, getOnboarding } from "@/lib/onboarding-service";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

describe("onboarding-service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta el estado del onboarding", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ completed: false });
    await getOnboarding();
    expect(apiFetch).toHaveBeenCalledWith("/api/onboarding");
  });

  it("guarda la configuración con JSON", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ completed: true });
    const input = {
      name: "Negocio",
      contactEmail: "dueno@empresa.cl",
      businessCountry: "Chile",
      businessIndustry: "Almacén",
      businessPhone: "+56911111111",
      usedPosBefore: false,
      goals: ["inventario"],
    };
    await completeOnboarding(input);
    expect(apiFetch).toHaveBeenCalledWith("/api/onboarding", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  });
});
