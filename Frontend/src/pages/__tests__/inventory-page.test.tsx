import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InventoryPage } from "@/pages/inventory-page";
import type { Product } from "@/types/domain";

const mockUseApiQuery = vi.fn();
const mockApiFetch = vi.fn();
let nextScannedCode = "";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { name: "Ana", username: "ana", role: "owner", token: "tok", expiresAt: Date.now() + 1000000 } }),
}));

vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: (args: { path: string }) => mockUseApiQuery(args),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@/components/pos/barcode-scanner-modal", () => ({
  BarcodeScannerModal: ({ onDetected }: { onDetected: (code: string) => void }) => (
    <button onClick={() => onDetected(nextScannedCode)}>Simular escaneo</button>
  ),
}));

const INVENTORY: Product[] = [
  {
    id: "1", sku: "COCA-2L", barcode: "7801111111111", name: "Coca-Cola 2L", stock: 10, price: 2000, cost: 1000,
    category: "bebidas", status: "healthy", updatedAt: "2026-09-04T10:00:00.000Z",
  },
];

function mockQueries(inventory: Product[] = INVENTORY) {
  mockUseApiQuery.mockImplementation(({ path }: { path: string }) => {
    if (path === "/api/inventory") return { data: inventory, loading: false, error: null, refresh: vi.fn() };
    if (path === "/api/suppliers") return { data: [], loading: false, error: null, refresh: vi.fn() };
    if (path === "/api/inventory/indicadores") return { data: null, loading: false, error: null, refresh: vi.fn() };
    return { data: null, loading: false, error: null, refresh: vi.fn() };
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );
}

async function openCreateFormAndScanner() {
  fireEvent.click(screen.getByRole("button", { name: /agregar producto/i }));
  fireEvent.click(screen.getByRole("button", { name: /escanear código de barras/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Simular escaneo" }));
}

describe("InventoryPage — escanear para autocompletar", () => {
  beforeEach(() => {
    mockUseApiQuery.mockReset();
    mockApiFetch.mockReset();
    mockQueries();
    nextScannedCode = "";
  });

  it("si el código escaneado ya existe en el inventario, avisa y no llama al backend", async () => {
    nextScannedCode = "7801111111111"; // coincide con INVENTORY[0].barcode
    renderPage();

    await openCreateFormAndScanner();

    expect(await screen.findByText(/ya existe un producto con este código/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/inventory/barcode-lookup"));
  });

  it("si el código es nuevo y se encuentra información, completa nombre y categoría sin tocar precio/costo", async () => {
    nextScannedCode = "7802222222222";
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/inventory/barcode-lookup")) {
        return { found: true, name: "Agua Mineral 1.5L", category: "bebidas", imageUrl: "https://example.com/agua.jpg" };
      }
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage();

    await openCreateFormAndScanner();

    await waitFor(() => expect(screen.getByPlaceholderText("Coca-Cola 2L")).toHaveValue("Agua Mineral 1.5L"));
    expect(screen.getByPlaceholderText("2.500")).toHaveValue("");
    expect(screen.getByPlaceholderText("1.500")).toHaveValue("");
    expect(screen.queryByText(/no pudimos autocompletar/i)).not.toBeInTheDocument();
  });

  it("si no se encuentra información, muestra un mensaje suave y deja el formulario editable", async () => {
    nextScannedCode = "7803333333333";
    mockApiFetch.mockResolvedValue({ found: false, reason: "not_found" });
    renderPage();

    await openCreateFormAndScanner();

    expect(await screen.findByText(/no pudimos autocompletar, ingresa los datos manualmente/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Coca-Cola 2L")).toHaveValue("");
  });

  it("si la búsqueda falla por red, muestra el mismo mensaje suave (nunca un error duro)", async () => {
    nextScannedCode = "7804444444444";
    mockApiFetch.mockRejectedValue(new Error("network down"));
    renderPage();

    await openCreateFormAndScanner();

    expect(await screen.findByText(/no pudimos autocompletar, ingresa los datos manualmente/i)).toBeInTheDocument();
  });

  it("al crear el producto, envía el imageUrl autocompletado en el POST", async () => {
    nextScannedCode = "7805555555555";
    mockApiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path.startsWith("/api/inventory/barcode-lookup")) {
        return { found: true, name: "Jugo Natural 1L", category: "bebidas", imageUrl: "https://example.com/jugo.jpg" };
      }
      if (path === "/api/inventory" && options?.method === "POST") {
        return { id: 99, sku: "JUGO-1L" };
      }
      throw new Error(`unexpected call: ${path}`);
    });
    renderPage();

    await openCreateFormAndScanner();
    await waitFor(() => expect(screen.getByPlaceholderText("Coca-Cola 2L")).toHaveValue("Jugo Natural 1L"));

    fireEvent.change(screen.getByPlaceholderText("COCA-COLA-2L"), { target: { value: "JUGO-1L" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/inventory", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("https://example.com/jugo.jpg"),
    })));
  });
});
