import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";
import type { ValidationReport } from "../../src/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

type OpenFn = (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;

async function openF5e(page: import("@playwright/test").Page, openProject: OpenFn) {
  await openProject(F5E_SPM);
  await expect(page.getByText("18 controls").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows empty state with emoji and action buttons when no project", async ({ page }) => {
  await expect(page.getByText("Create or open a project to get started.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open .spm File" })).toBeVisible();
});

test("table header columns are present after loading a project", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByText("No controls yet.")).toBeVisible();
  const headers = ["Panel", "Label", "Kind", "Board", "Pin(s)", "Config", "Notes"];
  for (const header of headers) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }
});

test("toolbar shows an Add Panel button", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("button", { name: "+ Add Panel" })).toBeVisible();
});

test("panel group rows render with expand arrow", async ({ page, openProject }) => {
  await openF5e(page, openProject);
  // Collapsed group shows right-pointing arrow
  await expect(
    page.locator("tr").filter({ hasText: "Armament Panel" }).first().getByText("▶")
  ).toBeVisible();
});

test("expand arrow changes to down arrow after clicking panel group", async ({ page, openProject }) => {
  await openF5e(page, openProject);
  const groupTd = page
    .locator("tr")
    .filter({ hasText: "Armament Panel" })
    .first()
    .locator("td");
  await groupTd.click();
  await expect(
    page.locator("tr").filter({ hasText: "Armament Panel" }).first().getByText("▼")
  ).toBeVisible();
});

test("shows error badge when validation returns errors", async ({ page, openProject, mock }) => {
  const report: ValidationReport = {
    errors: [
      {
        kind: "PinDoubleBooked",
        boardId: "board-arm",
        pin: "D2",
        controlIds: ["ctl-master-arm", "ctl-other"],
      },
    ],
    warnings: [],
  };
  await mock.setValidate(report);

  await openF5e(page, openProject);
  await expect(page.getByText("1 error")).toBeVisible();
});

test("shows warning badge when validation returns warnings", async ({ page, openProject, mock }) => {
  const report: ValidationReport = {
    errors: [],
    warnings: [
      { kind: "SerialPinUsed", controlId: "ctl-eng-start-l", pin: "D0" },
      { kind: "SerialPinUsed", controlId: "ctl-eng-start-r", pin: "D1" },
    ],
  };
  await mock.setValidate(report);

  await openF5e(page, openProject);
  await expect(page.getByText("2 warnings")).toBeVisible();
});

test("validation summary panel shows error and warning details", async ({ page, openProject, mock }) => {
  const report: ValidationReport = {
    errors: [{ kind: "PinDoubleBooked", boardId: "board-arm", pin: "D2" }],
    warnings: [{ kind: "SerialPinUsed", controlId: "ctl-eng-start-l", pin: "D0" }],
  };
  await mock.setValidate(report);

  await openF5e(page, openProject);
  // Validation summary shows formatted messages
  await expect(page.getByText(/Pin D2.*used by multiple/)).toBeVisible();
  await expect(page.getByText(/Serial pin D0/)).toBeVisible();
});

test("no error or warning badge when validation is clean", async ({ page, openProject }) => {
  await openF5e(page, openProject);
  // Toolbar should only show count badge, no error/warning chips
  await expect(page.getByText(/\d+ error/)).not.toBeVisible();
  await expect(page.getByText(/\d+ warning/)).not.toBeVisible();
});
