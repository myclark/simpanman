import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
});

test("Add Panel creates a new panel chip", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  await expect(page.getByText("Untitled Panel")).toBeVisible();
});

test("clicking a panel chip name renames it inline", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  await page.getByText("Untitled Panel").click();
  const input = page.locator("input");
  await input.fill("Cockpit");
  await input.press("Enter");
  await expect(page.getByText("Cockpit", { exact: true })).toBeVisible();
  await expect(page.getByText("Untitled Panel")).not.toBeVisible();
});

test("deleting an empty panel needs no confirmation content about controls but still confirms", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Untitled Panel");
    dialog.accept();
  });
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  await expect(page.getByText("Untitled Panel")).not.toBeVisible();
});

test("canceling a panel delete confirmation keeps the panel", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  await expect(page.getByText("Untitled Panel")).toBeVisible();
});
