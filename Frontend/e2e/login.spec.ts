import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login", () => {
  test("muestra el panel de marca y el formulario de acceso", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bienvenido de vuelta" })).toBeVisible();
    await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  });

  test("el SVG decorativo de rutas esta presente y con la estructura esperada", async ({ page }) => {
    await page.goto("/login");
    const paths = page.locator(".route-path");
    const dots = page.locator(".route-dot");
    await expect(paths).toHaveCount(2);
    await expect(dots).toHaveCount(4);
  });

  test("credenciales invalidas muestran un mensaje de error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.getByLabel("Contraseña", { exact: true }).fill("password-incorrecto");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 10_000 });
  });

  test("login exitoso redirige al panel operativo", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.getByLabel("Contraseña", { exact: true }).fill("Admin123!");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/^Hola,/)).toBeVisible({ timeout: 10_000 });
  });

  test("visual — breakpoints clave", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bienvenido de vuelta" })).toBeVisible();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page).toHaveScreenshot(`login-${width}.png`, { maxDiffPixelRatio: 0.02 });
    }
  });
});
