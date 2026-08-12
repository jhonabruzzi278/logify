import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSystemSettings } from "@/hooks/use-system-settings";

describe("useSystemSettings", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("todos los toggles inician en false mientras carga (comportamiento actual, sin sorpresas)", () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSystemSettings());
    expect(result.current.settings).toEqual({
      cashRegisterEnabled: false,
      requireDeleteReason: false,
      productImagesEnabled: false,
      priceFromCostEnabled: false,
      weightRoundingEnabled: false,
    });
  });

  it("convierte valores truthy del backend a boolean estricto para cada toggle", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        cashRegisterEnabled: true,
        requireDeleteReason: 1,
        productImagesEnabled: false,
        priceFromCostEnabled: true,
        weightRoundingEnabled: 0,
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({
      cashRegisterEnabled: true,
      requireDeleteReason: true,
      productImagesEnabled: false,
      priceFromCostEnabled: true,
      weightRoundingEnabled: false,
    });
  });

  it("un toggle ausente en la respuesta del backend queda en false, no undefined", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cashRegisterEnabled: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.weightRoundingEnabled).toBe(false);
  });

  it("si falla el fetch, mantiene los defaults en false en vez de romper", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useSystemSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.cashRegisterEnabled).toBe(false);
  });
});
