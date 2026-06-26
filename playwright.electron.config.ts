import { defineConfig } from "@playwright/test";

// Electron smoke test: launches the real packaged-style app (built dist/ +
// dist-electron/) and exercises the preload bridge end-to-end. Separate from the
// browser UI config (no webServer / baseURL). Run with `npm run test:smoke`.
export default defineConfig({
  testDir: "tests/electron",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
});
