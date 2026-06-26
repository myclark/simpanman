import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MULTI_SPM = path.resolve(__dirname, "../../examples/multi-board-demo.spm");

async function openMultiboardProject(page: import("@playwright/test").Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(MULTI_SPM);
  await expect(page.getByRole("banner").getByText("Multi-board Demo")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("opens multi-board-demo.spm and shows project name", async ({ page }) => {
  await openMultiboardProject(page);
  await expect(page.getByRole("banner").getByText("Multi-board Demo")).toBeVisible();
});

test("Controls toolbar shows total controls count", async ({ page }) => {
  await openMultiboardProject(page);
  // multi-board-demo.spm has 10 controls
  await expect(page.getByText("10 controls").first()).toBeVisible();
});

test("three panel group rows are present", async ({ page }) => {
  await openMultiboardProject(page);
  // Each panel appears as a group row heading (exact match to avoid title-bar collision)
  await expect(page.getByText("Armament", { exact: true })).toBeVisible();
  await expect(page.getByText("Sight", { exact: true })).toBeVisible();
  await expect(page.getByText("Systems", { exact: true })).toBeVisible();
});

test("Boards tab shows 3 total boards", async ({ page }) => {
  await openMultiboardProject(page);
  await page.getByRole("button", { name: "Boards" }).click();
  await expect(page.getByText("3 total")).toBeVisible();
});

test("Boards tab lists all three boards", async ({ page }) => {
  await openMultiboardProject(page);
  await page.getByRole("button", { name: "Boards" }).click();
  await expect(page.getByText("Board A", { exact: true })).toBeVisible();
  await expect(page.getByText("Board B", { exact: true })).toBeVisible();
  await expect(page.getByText("Board C", { exact: true })).toBeVisible();
});

test("each board card shows its type and identity", async ({ page }) => {
  await openMultiboardProject(page);
  await page.getByRole("button", { name: "Boards" }).click();
  await expect(page.getByText("Demo Board A")).toBeVisible();
  await expect(page.getByText("Demo Board B")).toBeVisible();
  await expect(page.getByText("Demo Board C")).toBeVisible();
});

test("encoder controls visible in Sight panel group", async ({ page }) => {
  await openMultiboardProject(page);
  const sightTd = page
    .locator("tr")
    .filter({ hasText: "Sight" })
    .first()
    .locator("td");
  await sightTd.dispatchEvent("click");
  await expect(page.getByText("Sight Brightness")).toBeVisible();
  await expect(page.getByText("Sight Depression")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^encoder$/ }).first()).toBeVisible();
});

test("analog controls visible in Systems panel group", async ({ page }) => {
  await openMultiboardProject(page);
  const systemsTd = page
    .locator("tr")
    .filter({ hasText: "Systems" })
    .first()
    .locator("td");
  await systemsTd.dispatchEvent("click");
  await expect(page.getByText("Cabin Pressure")).toBeVisible();
  await expect(page.getByText("Rudder Trim")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^analog$/ }).first()).toBeVisible();
});
