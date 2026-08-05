import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/cliente.json" });

test.describe("Tracking", () => {
  test("muestra el buscador cuando no hay codigo", async ({ page }) => {
    await page.goto("/tracking");
    await expect(page.getByText("Logify", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /buscar/i }).or(page.locator("form"))).toBeVisible();
  });

  test("visual — breakpoints clave", async ({ page }) => {
    await page.goto("/tracking");
    for (const width of [375, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page).toHaveScreenshot(`tracking-${width}.png`, { maxDiffPixelRatio: 0.03 });
    }
  });
});
