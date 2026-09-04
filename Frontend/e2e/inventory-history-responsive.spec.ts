import { expect, test } from "@playwright/test";

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block",
});

const sessionSummary = {
  id: 21,
  type: "count",
  name: "Conteo general de bodega",
  status: "draft",
  createdBy: "admin",
  createdByName: "Administrador",
  startedAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:05:00.000Z",
  finalizedAt: null,
  cancelledAt: null,
  totalProducts: 2,
  scannedProducts: 1,
  totalDifference: -7,
};

const sessionDetail = {
  ...sessionSummary,
  items: [
    {
      id: 1,
      sku: "PRODUCTO-LARGO-001",
      barcode: "7801234567890",
      name: "Producto de prueba con un nombre suficientemente largo para validar teléfonos pequeños",
      initialStock: 10,
      currentStock: 10,
      quantity: 3,
      scanned: true,
      difference: -7,
      finalStock: 3,
      appliedDelta: null,
      stockChanged: false,
      updatedAt: "2026-09-04T10:05:00.000Z",
    },
    {
      id: 2,
      sku: "SIN-ESCANEAR",
      barcode: null,
      name: "Producto pendiente",
      initialStock: 5,
      currentStock: 5,
      quantity: 0,
      scanned: false,
      difference: -5,
      finalStock: 0,
      appliedDelta: null,
      stockChanged: false,
      updatedAt: "2026-09-04T10:00:00.000Z",
    },
  ],
};

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  ))).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logify-auth-v2", JSON.stringify({
      token: "e2e-admin-token",
      username: "admin",
      name: "Administrador",
      role: "owner",
      expiresAt: Date.now() + 3_600_000,
    }));
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/onboarding") return route.fulfill({ json: { completed: true } });
    if (url.pathname === "/api/inventory-sessions/21") return route.fulfill({ json: sessionDetail });
    if (url.pathname === "/api/inventory-sessions") return route.fulfill({ json: [sessionSummary] });
    return route.fulfill({ json: [] });
  });
});

test("historial y detalle no se desplazan lateralmente en los tamaños móviles obligatorios", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/inventory/history");
    await expect(page.getByRole("heading", { name: "Historial de inventarios" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/inventory/history/21");
    await expect(page.getByRole("heading", { name: "Conteo general de bodega" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Escanear producto" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("reportes no se desplaza lateralmente en los tamaños móviles obligatorios", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Analytics operacional" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
