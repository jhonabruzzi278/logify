import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/cliente.json";

/** El rol "customer" es el unico con acceso a /tracking (ver src/app/access.ts). */
setup("autenticarse como cliente", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("cliente");
  await page.getByLabel("Contraseña", { exact: true }).fill("Cli123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});
