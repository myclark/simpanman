import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

type OpenFn = (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;

async function loadProjectAndGoToBuild(page: import("@playwright/test").Page, openProject: OpenFn) {
  await openProject(F5E_SPM);
  await expect(page.getByRole("banner").getByText("F-5E Armament Panel")).toBeVisible();
  // Scope to nav to avoid matching the board card "Build & Upload" button
  await page.getByRole("navigation").getByRole("button", { name: "Build & Upload" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows Build & Upload heading after project loaded", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByRole("heading", { name: "Build & Upload" })).toBeVisible();
});

test("Refresh Ports button is visible", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByRole("button", { name: "Refresh Ports" })).toBeVisible();
});

test("port dropdown is visible with auto-detect option", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByRole("combobox")).toBeVisible();
  // <option> elements inside a closed <select> are hidden; check text content instead
  await expect(page.getByRole("combobox")).toContainText("Let PlatformIO detect");
});

test("mock serial ports appear in port dropdown", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  // <option> elements inside a closed <select> are hidden; check text content instead
  await expect(page.getByRole("combobox")).toContainText("/dev/ttyACM0");
  await expect(page.getByRole("combobox")).toContainText("/dev/ttyACM1");
});

test("board card shows board name and identity", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  // "Armament" exact match avoids "F-5E Armament Panel" (title bar) and "F5E Armament" (USB product)
  await expect(page.getByText("Armament", { exact: true })).toBeVisible();
  await expect(page.getByText("F5E Armament")).toBeVisible();
});

test("board card shows Idle status badge initially", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByText("Idle")).toBeVisible();
});

test('"Build & Upload" button is enabled initially', async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  // Scope to main to avoid matching the nav tab button
  const buildBtn = page.getByRole("main").getByRole("button", { name: "Build & Upload" });
  await expect(buildBtn).toBeEnabled();
});

test("clicking Build & Upload changes status to Building", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await page.getByRole("main").getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByText("Building…").first()).toBeVisible();
});

test("Build & Upload button is disabled while building", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await page.getByRole("main").getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByRole("button", { name: "Building…" })).toBeDisabled();
});

test("WebSocket log messages appear in log pane", async ({ page, ws, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await page.getByRole("main").getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByText("Building…").first()).toBeVisible();

  ws.sendLog("board-arm", "Compiling firmware...");
  ws.sendLog("board-arm", "Linking...", false);
  ws.sendLog("board-arm", "Build error: missing header", true);

  await expect(page.getByText("Compiling firmware...")).toBeVisible();
  await expect(page.getByText("Linking...")).toBeVisible();
  await expect(page.getByText("Build error: missing header")).toBeVisible();
});

test("WebSocket success status changes badge to Success", async ({ page, ws, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await page.getByRole("main").getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByText("Building…").first()).toBeVisible();

  ws.sendLog("board-arm", "Upload complete.");
  ws.sendStatus("board-arm", true);

  await expect(page.getByText("Success")).toBeVisible();
  await expect(page.getByText("Building…")).not.toBeVisible();
});

test("WebSocket failure status changes badge to Failed", async ({ page, ws, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await page.getByRole("main").getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByText("Building…").first()).toBeVisible();

  ws.sendLog("board-arm", "Compilation failed.", true);
  ws.sendStatus("board-arm", false, 1);

  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
});

test("Refresh Ports re-queries the serial-port list", async ({ page, openProject, mock }) => {
  await loadProjectAndGoToBuild(page, openProject);
  const initialCount = mock.portListCalls();

  await page.getByRole("button", { name: "Refresh Ports" }).click();
  await expect.poll(() => mock.portListCalls()).toBe(initialCount + 1);
});

test("selecting a port from dropdown sets port value", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  const select = page.getByRole("combobox");
  await select.selectOption("/dev/ttyACM0");
  await expect(select).toHaveValue("/dev/ttyACM0");
});
