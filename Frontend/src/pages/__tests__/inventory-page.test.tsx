import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { InventoryPage } from "@/pages/inventory-page";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function mockFetchFor(settings: Partial<Record<string, boolean>>) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/settings/system")) return Promise.resolve(jsonResponse(settings));
    if (url.includes("/api/inventory/indicadores")) return Promise.resolve(jsonResponse({ uf: { valor: null, fecha: null }, dolar: { valor: null, fecha: null }, utm: { valor: null, fecha: null } }));
    if (url.includes("/api/suppliers")) return Promise.resolve(jsonResponse([]));
    if (init?.method === "POST" && url.includes("/api/inventory")) return Promise.resolve(jsonResponse({ id: 99, sku: "NEW-SKU" }));
    if (url.includes("/api/inventory")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
}

async function openCreateForm() {
  fireEvent.click(await screen.findByRole("button", { name: /Agregar producto/i }));
  await screen.findByText("Nuevo producto", {}, { timeout: 5000 });
}

describe("InventoryPage — campo de imagen (toggle productImagesEnabled)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("muestra el campo de imagen en el formulario cuando el toggle esta activo", async () => {
    globalThis.fetch = mockFetchFor({ productImagesEnabled: true });
    render(<InventoryPage />);
    await openCreateForm();
    expect(screen.getByLabelText("Imagen (URL)")).toBeInTheDocument();
  });

  it("no muestra el campo de imagen cuando el toggle esta apagado", async () => {
    globalThis.fetch = mockFetchFor({ productImagesEnabled: false });
    render(<InventoryPage />);
    await openCreateForm();
    expect(screen.queryByLabelText("Imagen (URL)")).not.toBeInTheDocument();
  });

  it("envia la imagen cargada al crear el producto", async () => {
    const fetchMock = mockFetchFor({ productImagesEnabled: true });
    globalThis.fetch = fetchMock;
    render(<InventoryPage />);
    await openCreateForm();

    fireEvent.change(screen.getByPlaceholderText("COCA-COLA-2L"), { target: { value: "AGUA-500" } });
    fireEvent.change(screen.getByPlaceholderText("Coca-Cola 2L"), { target: { value: "Agua 500ml" } });
    fireEvent.change(screen.getByLabelText("Imagen (URL)"), { target: { value: "https://example.com/agua.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]: [unknown, RequestInit?]) => init?.method === "POST");
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall![1].body));
      expect(body.imageUrl).toBe("https://example.com/agua.jpg");
    });
  });
});

describe("InventoryPage — calculo de precio por costo (toggle priceFromCostEnabled)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("muestra el campo de margen cuando el toggle esta activo", async () => {
    globalThis.fetch = mockFetchFor({ priceFromCostEnabled: true });
    render(<InventoryPage />);
    await openCreateForm();
    expect(screen.getByLabelText("Margen % (sobre el costo)")).toBeInTheDocument();
  });

  it("no muestra el campo de margen cuando el toggle esta apagado", async () => {
    globalThis.fetch = mockFetchFor({ priceFromCostEnabled: false });
    render(<InventoryPage />);
    await openCreateForm();
    expect(screen.queryByLabelText("Margen % (sobre el costo)")).not.toBeInTheDocument();
  });

  it("calcula el precio de venta a partir del costo y el margen ingresado", async () => {
    globalThis.fetch = mockFetchFor({ priceFromCostEnabled: true });
    render(<InventoryPage />);
    await openCreateForm();

    fireEvent.change(screen.getByPlaceholderText("1.500"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Margen % (sobre el costo)"), { target: { value: "30" } });

    // costo 1000 + 30% de margen = 1300
    expect(screen.getByText("Precio calculado: $1.300")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("2.500")).toHaveValue("1.300");
  });
});
