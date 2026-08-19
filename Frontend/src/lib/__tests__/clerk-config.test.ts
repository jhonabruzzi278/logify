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
  });
});
