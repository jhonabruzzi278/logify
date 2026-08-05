import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("muestra las tarjetas de metricas y acciones rapidas", async ({ page }) => {
    await expect(page.getByText(/^Hola,/)).toBeVisible();
    await expect(page.getByText("Pedidos recientes")).toBeVisible();
    await expect(page.getByText("Alertas")).toBeVisible();
    await expect(page.getByText("Acciones rapidas", { exact: false })).toBeVisible();
  });

  test("las tarjetas de metrica terminan mostrando un monto formateado", async ({ page }) => {
    const firstMetricValue = page.locator(".tabular-nums").first();
    await expect(firstMetricValue).toBeVisible();
    // El contador GSAP debe asentarse en un valor con formato de moneda, no quedar en "$0" indefinidamente.
    await expect(firstMetricValue).toHaveText(/^\$[\d.,]+$/, { timeout: 5_000 });
  });

  test("responsive — sin overflow horizontal en mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload();
    await expect(page.getByText(/^Hola,/)).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
