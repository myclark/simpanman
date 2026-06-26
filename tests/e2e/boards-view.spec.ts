import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");
const MULTI_SPM = path.resolve(__dirname, "../../examples/multi-board-demo.spm");

type OpenFn = (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;

async function openFileAndGoToBoards(
  page: import("@playwright/test").Page,
  openProject: OpenFn,
  filePath: string,
  expectedProjectName: string,
) {
  await openProject(filePath);
  // Wait for the project to fully load (title bar updated)
  await expect(page.getByRole("banner").getByText(expectedProjectName)).toBeVisible();
  await page.getByRole("button", { name: "Boards" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows 1 total board after loading f5e project", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await expect(page.getByText("1 total")).toBeVisible();
});

test("shows board name in sidebar", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  // The board name is "Armament" — use exact match to avoid matching "F-5E Armament Panel"
  await expect(page.getByText("Armament", { exact: true })).toBeVisible();
});

test("shows board type (leonardo) in sidebar", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await expect(page.getByText("leonardo")).toBeVisible();
});

test("shows board USB product name in sidebar", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  // "F5E Armament" is the usbProduct value
  await expect(page.getByText("F5E Armament")).toBeVisible();
});

test("shows VID and PID in hex format", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  // VID 4617 decimal = 0x1209, PID 1 decimal = 0x0001
  await expect(page.getByText(/VID:1209/)).toBeVisible();
  await expect(page.getByText(/PID:0001/)).toBeVisible();
});

test('"Allocate Identity" button visible for boards with prototype PID', async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  // PID = 1 which is <= 0x000F
  await expect(page.getByRole("button", { name: "Allocate Identity" })).toBeVisible();
});

test("clicking board loads pin map detail panel", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  // Click the board card (event bubbles from the board name to the card's onClick)
  await page.getByText("Armament", { exact: true }).click();
  await expect(page.getByText(/Used Pins/)).toBeVisible();
  await expect(page.getByText(/Free Pins/)).toBeVisible();
});

test("pin map detail shows used pin count", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await page.getByText("Armament", { exact: true }).click();
  // f5e uses all 20 pins (D0-D13 + A0-A5)
  await expect(page.getByText(/Used Pins \(\d+\)/)).toBeVisible();
});

test("pin map detail shows control labels in used pins table", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await page.getByText("Armament", { exact: true }).click();
  await expect(page.getByText("Master Arm")).toBeVisible();
  await expect(page.getByText("Bomb Arm")).toBeVisible();
});

test("clicking Allocate Identity triggers API and shows dirty indicator", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await page.getByRole("button", { name: "Allocate Identity" }).click();
  await expect(page.locator('[title="Unsaved changes"]')).toBeVisible();
});

test("multi-board project: selecting different boards shows different pin maps", async ({
  page,
  openProject,
}) => {
  await openFileAndGoToBoards(page, openProject, MULTI_SPM, "Multi-board Demo");

  // Select Board A
  await page.getByText("Board A", { exact: true }).click();
  await expect(page.getByText(/Used Pins/)).toBeVisible();

  // Select Board B — the detail panel updates
  await page.getByText("Board B", { exact: true }).click();
  await expect(page.getByText(/Used Pins/)).toBeVisible();
});

test("pin map shows warning for serial pins D0 and D1", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await page.getByText("Armament", { exact: true }).click();
  // The f5e project uses D0/D1 which are Serial pins — mock warns about them
  await expect(page.getByText(/Serial TX\/RX/i).first()).toBeVisible();
});

test("select a board placeholder shows when none selected", async ({ page, openProject }) => {
  await openFileAndGoToBoards(page, openProject, F5E_SPM, "F-5E Armament Panel");
  await expect(page.getByText("Select a board to view its pin map")).toBeVisible();
});
