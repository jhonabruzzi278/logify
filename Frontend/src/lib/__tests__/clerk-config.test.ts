import { describe, expect, it, afterEach, vi } from "vitest";
import { getClerkPublishableKey, isClerkConfigured, shouldActivateClerk } from "@/lib/clerk-config";

describe("clerk-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getClerkPublishableKey", () => {
    it("retorna null cuando VITE_CLERK_PUBLISHABLE_KEY no esta definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
      expect(getClerkPublishableKey()).toBeNull();
    });

    it("retorna null cuando la variable es solo espacios en blanco", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "   ");
      expect(getClerkPublishableKey()).toBeNull();
    });

    it("retorna la clave, sin espacios, cuando esta definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "  fake-publishable-key-for-tests  ");
      expect(getClerkPublishableKey()).toBe("fake-publishable-key-for-tests");
    });
  });

  describe("isClerkConfigured", () => {
    it("retorna false sin la variable de entorno", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
      expect(isClerkConfigured()).toBe(false);
    });

    it("retorna true con la variable de entorno definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(isClerkConfigured()).toBe(true);
    });
  });

  describe("shouldActivateClerk", () => {
    it("retorna false sin la variable de entorno, sin importar el hostname", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
      expect(shouldActivateClerk("app.logify.cl")).toBe(false);
      expect(shouldActivateClerk("localhost")).toBe(false);
    });

    it("retorna true en app.logify.cl con la variable definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(shouldActivateClerk("app.logify.cl")).toBe(true);
    });

    it("retorna true en gestion.logify.cl con la variable definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(shouldActivateClerk("gestion.logify.cl")).toBe(true);
    });

    it("retorna true en localhost/127.0.0.1 con la variable definida (para poder probar /login-clerk)", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(shouldActivateClerk("localhost")).toBe(true);
      expect(shouldActivateClerk("127.0.0.1")).toBe(true);
    });

    it("retorna false en el subdominio de un tenant no migrado, aunque la variable este definida", () => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(shouldActivateClerk("minimarketelsol.logify.cl")).toBe(false);
      expect(shouldActivateClerk("lapercha.logify.cl")).toBe(false);
    });

    // Pin de regresion del incidente 2026-08-19: estos 7 tenants existian en
    // produccion sin ningun usuario en Clerk cuando la activacion global rompio
    // su login. Si alguno de estos vuelve a dar `true`, su login vuelve a romperse.
    const LEGACY_TENANT_SLUGS = [
      "auditprodverify1",
      "minimarketelsol",
      "la-isla-barber-studio",
      "vin-studio",
      "jany",
      "jonyfy",
      "laboratorio",
    ];

    it.each(LEGACY_TENANT_SLUGS)("retorna false para el tenant legacy no migrado '%s'", (slug) => {
      vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
      expect(shouldActivateClerk(`${slug}.logify.cl`)).toBe(false);
    });
  });
});
