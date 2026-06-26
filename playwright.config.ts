import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:1420",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Allow pointing at a pre-installed Chromium (e.g. sandboxed CI images
        // whose cached build differs from this Playwright version). Unset in
        // normal CI, where `playwright install` provides the matching browser.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  // Browser-based UI tests run against the Vite renderer alone (window.api is
  // mocked); no Electron main process needed here.
  webServer: {
    command: "npm run dev:vite",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
