import { defineConfig, devices } from "@playwright/test";

// e2e sobre el build estático (astro preview). Prioridad móvil: 80%+ del tráfico.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4330" },
  webServer: {
    command: "pnpm exec astro preview --port 4330",
    url: "http://localhost:4330",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"] } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
  ],
});
