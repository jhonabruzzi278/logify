import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCouriers } from "@/hooks/use-couriers";
import type { ApiCourier } from "@/types/api";

const mockCouriers: ApiCourier[] = [
  { id: 5, username: "luis.carvajal", name: "Luis Carvajal" },
];

describe("useCouriers", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("inicia con lista vacía mientras carga", () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useCouriers());
    expect(result.current.couriers).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("mapea la respuesta del backend a { username, name }", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockCouriers), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const { result } = renderHook(() => useCouriers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.couriers).toEqual([{ username: "luis.carvajal", name: "Luis Carvajal" }]);
  });

  it("consulta /api/auth/couriers, no la lista de usuarios restringida a owner/admin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    globalThis.fetch = fetchMock;
    renderHook(() => useCouriers());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/auth/couriers");
  });

  it("devuelve lista vacía (no null) si el fetch falla", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useCouriers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.couriers).toEqual([]);
  });
});
