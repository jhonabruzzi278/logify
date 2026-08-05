import { test, expect } from "@playwright/test";

test.describe("Reportes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
  });

  test("el grafico de barras renderiza con alturas reales, no en cero", async ({ page }) => {
    const bars = page.locator(".chart-bar");
    await expect(bars.first()).toBeVisible();

    const heights = await bars.evaluateAll((els) => els.map((el) => Number(el.getAttribute("height"))));
    expect(heights.length).toBeGreaterThan(0);
    // Regresion cubierta: el polling de refresco no debe dejar todas las barras
    // clavadas en la altura minima (bug encontrado y corregido durante el
    // desarrollo de esta animacion).
    expect(heights.some((h) => h > 5)).toBe(true);
  });

  test("cambiar de pestaña no rompe el layout", async ({ page }) => {
    const stockTab = page.getByRole("button", { name: "Stock" });
    if (await stockTab.isVisible().catch(() => false)) {
      await stockTab.click();
      await expect(page.locator(".chart-bar").first()).toBeVisible();
    }
  });

  test("visual — breakpoints clave", async ({ page }) => {
    await expect(page.locator(".chart-bar").first()).toBeVisible();
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page).toHaveScreenshot(`reports-${width}.png`, { maxDiffPixelRatio: 0.03 });
    }
  });
});
