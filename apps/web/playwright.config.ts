import { defineConfig, devices } from "@playwright/test";

// Single-target chromium config. The CI step spins up the full docker stack via
// docker compose and points Playwright at the host-mapped ports (web 5173, api 4000).
// Locally: `pnpm dev` in the repo root, then `pnpm --filter @chorechampz/web test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // golden-path is a single sequenced flow; keep deterministic
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
