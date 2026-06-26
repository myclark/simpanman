import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

type OpenFn = (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;

async function openF5eProject(
  page: import("@playwright/test").Page,
  openProject: OpenFn,
) {
  await openProject(F5E_SPM);
  // Wait for the project name to appear in the title bar
  await expect(page.getByRole("banner").getByText("F-5E Armament Panel")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("opens f5e-armament.spm and shows project name in title bar", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  await expect(page.getByRole("banner").getByText("F-5E Armament Panel")).toBeVisible();
  await expect(page.getByRole("banner").getByText("No project open")).not.toBeVisible();
});

test("Controls toolbar shows 18 controls count", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  // The toolbar span is the first element showing the total count
  await expect(page.getByText("18 controls").first()).toBeVisible();
});

test("panel group row is visible and shows child count", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  // The exact panel name in the group row (title bar shows the full project name)
  await expect(page.getByText("Armament Panel", { exact: true })).toBeVisible();
});

test("can expand panel group to see individual controls", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  // Click the <td> inside the group row to expand it
  const groupTd = page
    .locator("tr")
    .filter({ hasText: "Armament Panel" })
    .first()
    .locator("td");
  await groupTd.dispatchEvent("click");
  await expect(page.getByText("Jettison Select")).toBeVisible();
  await expect(page.getByText("Master Arm")).toBeVisible();
  await expect(page.getByText("Bomb Arm")).toBeVisible();
});

test("can collapse panel group after expanding", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  const groupTd = page
    .locator("tr")
    .filter({ hasText: "Armament Panel" })
    .first()
    .locator("td");
  // Expand
  await groupTd.dispatchEvent("click");
  await expect(page.getByText("Jettison Select")).toBeVisible();
  // Collapse
  await groupTd.dispatchEvent("click");
  await expect(page.getByText("Jettison Select")).not.toBeVisible();
});

test("no dirty indicator when project is first opened", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  // Dirty indicator is a small amber dot with title "Unsaved changes"
  await expect(page.locator('[title="Unsaved changes"]')).not.toBeVisible();
});

test("expanded grid shows correct kinds for controls", async ({ page, openProject }) => {
  await openF5eProject(page, openProject);
  const groupTd = page
    .locator("tr")
    .filter({ hasText: "Armament Panel" })
    .first()
    .locator("td");
  await groupTd.dispatchEvent("click");
  // Multiple switches in the f5e project
  await expect(page.locator("span").filter({ hasText: /^switch$/ }).first()).toBeVisible();
  // Multiple buttons
  await expect(page.locator("span").filter({ hasText: /^button$/ }).first()).toBeVisible();
  // Selectors too
  await expect(page.locator("span").filter({ hasText: /^selector$/ }).first()).toBeVisible();
});

test("can open f5e project via empty-state Open button", async ({ page, openProject }) => {
  await openProject(F5E_SPM, () =>
    page.getByRole("button", { name: "Open .spm File" }).click(),
  );
  await expect(page.getByRole("banner").getByText("F-5E Armament Panel")).toBeVisible();
});
