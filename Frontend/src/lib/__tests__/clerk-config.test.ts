import { describe, expect, it, afterEach, vi } from "vitest";
import { getClerkPublishableKey, isClerkConfigured } from "@/lib/clerk-config";

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
});
