import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/admin.json";

/**
 * Credenciales de seed documentadas en README.md (seedUsers() en
 * Backend/orders-service) — no son secretas, solo existen en datos de
 * desarrollo local.
 */
setup("autenticarse como admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText(/^Hola,/)).toBeVisible({ timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});
