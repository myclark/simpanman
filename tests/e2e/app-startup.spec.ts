import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("renders the title bar with app name", async ({ page }) => {
  // "Sim Panel Manager" appears in both the title bar and the empty state heading;
  // specifically check the header/banner region.
  await expect(page.getByRole("banner").getByText("Sim Panel Manager")).toBeVisible();
});

test('shows "No project open" in title bar when no project is loaded', async ({ page }) => {
  await expect(page.getByRole("banner").getByText("No project open")).toBeVisible();
});

test("displays all four navigation tabs", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Boards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build & Upload" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test" })).toBeVisible();
});

test("Controls tab is active by default", async ({ page }) => {
  const controlsTab = page.getByRole("button", { name: "Controls" });
  await expect(controlsTab).toHaveClass(/border-\[#58a6ff\]/);
});

test("shows empty state with action buttons on Controls view", async ({ page }) => {
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open .spm File" })).toBeVisible();
});

test("Boards tab shows no project message", async ({ page }) => {
  await page.getByRole("button", { name: "Boards" }).click();
  await expect(page.getByRole("main").getByText("No project open")).toBeVisible();
});

test("Build & Upload tab shows no project message", async ({ page }) => {
  await page.getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByRole("main").getByText("No project open")).toBeVisible();
});

test("Save button is hidden when no project is open", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
});
