import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("New button in title bar creates a project", async ({ page }) => {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("banner").getByText("New Project")).toBeVisible();
  await expect(page.getByRole("banner").getByText("No project open")).not.toBeVisible();
});

test('"New Project" button in empty state creates a project', async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByText("New Project")).toBeVisible();
});

test("Controls view shows 0 controls count after new project", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  // The seeded panel's own (empty) group-header row also reads "0 controls",
  // so an unscoped locator would match two elements; `.first()` targets the
  // toolbar's overall count.
  await expect(page.getByText("0 controls").first()).toBeVisible();
});

test("Controls view shows seeded panel with add-control affordance after new project", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New Project" }).click();
  // "Panel 1" appears both in the Panels strip chip and the table's own
  // group-header row for the same panel; `.first()` targets the chip.
  await expect(page.getByText("Panel 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("+ Add control to this panel")).toBeVisible();
});

test("Boards tab shows 1 total after new project", async ({ page }) => {
  // A fresh project seeds one default board ("Board 1"), mirroring
  // electron/engine/model.ts newProject() — so the list isn't empty.
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "Boards" }).click();
  await expect(page.getByText("1 total")).toBeVisible();
  await expect(page.getByText("Board 1", { exact: true }).first()).toBeVisible();
});

test("Build tab shows the seeded board after new project", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "Build & Upload" }).click();
  await expect(page.getByText("No boards in project", { exact: false })).not.toBeVisible();
  await expect(page.getByText("Board 1", { exact: true }).first()).toBeVisible();
});

test("Save button appears after new project is created", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});
