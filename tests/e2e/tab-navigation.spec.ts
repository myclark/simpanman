import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Controls tab is active by default", async ({ page }) => {
  const tab = page.getByRole("button", { name: "Controls" });
  await expect(tab).toHaveClass(/border-\[#58a6ff\]/);
});

test("clicking Boards tab activates it", async ({ page }) => {
  await page.getByRole("button", { name: "Boards" }).click();
  const boardsTab = page.getByRole("button", { name: "Boards" });
  await expect(boardsTab).toHaveClass(/border-\[#58a6ff\]/);
  // Controls should no longer be active
  const controlsTab = page.getByRole("button", { name: "Controls" });
  await expect(controlsTab).not.toHaveClass(/border-\[#58a6ff\]/);
});

test("clicking Build & Upload tab activates it", async ({ page }) => {
  await page.getByRole("button", { name: "Build & Upload" }).click();
  const buildTab = page.getByRole("button", { name: "Build & Upload" });
  await expect(buildTab).toHaveClass(/border-\[#58a6ff\]/);
});

test("clicking Test tab activates it", async ({ page }) => {
  await page.getByRole("button", { name: "Test" }).click();
  const testTab = page.getByRole("button", { name: "Test" });
  await expect(testTab).toHaveClass(/border-\[#58a6ff\]/);
});

test("switching tabs preserves project state", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  // Switch to Boards and back to Controls — dispatchEvent avoids coordinate-intercept hang
  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Controls" }).dispatchEvent("click");

  // Project is still loaded
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();
  await expect(page.getByText("18 controls").first()).toBeVisible();
});

test("Test tab shows stub content", async ({ page }) => {
  await page.getByRole("button", { name: "Test" }).click();
  // TestView is a Phase 3 stub showing an HID joystick placeholder
  await expect(page.getByText("Test View")).toBeVisible();
  await expect(page.getByText(/HID joystick/i)).toBeVisible();
});

test("all tab labels are visible", async ({ page }) => {
  const labels = ["Controls", "Boards", "Build & Upload", "Test"];
  for (const label of labels) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
});
