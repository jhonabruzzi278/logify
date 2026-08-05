import { defineConfig, devices } from "@playwright/test";

/**
 * El frontend (Vite) y el landing (Next.js) compiten por el puerto 3000 en
 * dev, asi que Vite termina en 3001 casi siempre. Se puede sobreescribir con
 * PLAYWRIGHT_BASE_URL si tu entorno usa otro puerto.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  // El dev server ya suele estar corriendo (ver .claude/launch.json); no lo
  // levantamos automaticamente porque el puerto real depende de si Landing
  // ya tomo el 3000. Arranca `npm run dev` en Frontend antes de testear.
});
