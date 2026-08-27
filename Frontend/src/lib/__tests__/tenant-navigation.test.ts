import { describe, expect, it } from "vitest";
import { buildTenantUrl, isManagementPortalHostname, isPlatformPortalHostname, normalizeTenantSlug } from "@/lib/tenant-navigation";

describe("tenant navigation", () => {
  it("normaliza slug y URL completa del tenant", () => {
    expect(normalizeTenantSlug(" LaPercha ")).toBe("lapercha");
    expect(normalizeTenantSlug("https://lapercha.logify.cl/login")).toBe("lapercha");
  });

  it("rechaza dominios reservados y entradas inválidas", () => {
    expect(normalizeTenantSlug("app.logify.cl")).toBeNull();
    expect(normalizeTenantSlug("gestion.logify.cl")).toBeNull();
    expect(normalizeTenantSlug("empresa_con_guion_bajo")).toBeNull();
  });

  it("construye destinos dentro del subdominio", () => {
    expect(buildTenantUrl("lapercha", "/forgot-password")).toBe("https://lapercha.logify.cl/forgot-password");
  });

  it("reconoce exclusivamente el portal central", () => {
    expect(isPlatformPortalHostname("app.logify.cl")).toBe(true);
    expect(isPlatformPortalHostname("lapercha.logify.cl")).toBe(false);
  });

  it("distingue el portal de gestión del portal de clientes", () => {
    expect(isManagementPortalHostname("gestion.logify.cl")).toBe(true);
    expect(isManagementPortalHostname("app.logify.cl")).toBe(false);
  });
});
