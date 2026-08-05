import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BusinessModeProvider, useBusinessMode } from "@/hooks/use-business-mode";

function renderBusinessMode() {
  return renderHook(() => useBusinessMode(), { wrapper: BusinessModeProvider });
}

describe("useBusinessMode", () => {
  beforeEach(() => { localStorage.clear(); });

  it("inicia en modo b2b por defecto", () => {
    const { result } = renderBusinessMode();
    expect(result.current.mode).toBe("b2b");
  });

  it("restaura el modo persistido en localStorage", () => {
    localStorage.setItem("logify-business-mode", "b2c");
    const { result } = renderBusinessMode();
    expect(result.current.mode).toBe("b2c");
  });

  it("toggleMode alterna entre b2b y b2c y persiste el cambio", () => {
    const { result } = renderBusinessMode();
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("b2c");
    expect(localStorage.getItem("logify-business-mode")).toBe("b2c");
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("b2b");
  });

  it("setMode fija un modo explícito", () => {
    const { result } = renderBusinessMode();
    act(() => result.current.setMode("b2c"));
    expect(result.current.mode).toBe("b2c");
  });

  it("lanza un error si se usa fuera del provider", () => {
    const { result } = renderHook(() => {
      try {
        return useBusinessMode();
      } catch (err) {
        return err as Error;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
  });
});
