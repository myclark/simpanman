import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
});

test("Add Panel creates a new panel chip", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  // The Controls table now also shows every panel (even empty ones) as its
  // own group-header row, so "Untitled Panel" appears both there and in the
  // Panels strip chip; `.first()` targets the strip's chip.
  await expect(page.getByText("Untitled Panel").first()).toBeVisible();
});

test("clicking a panel chip name renames it inline", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  // `.first()`: the Panels strip's chip (the clickable rename target) comes
  // before the Controls table's own group-header row for the same
  // (still-empty) panel in DOM order.
  await page.getByText("Untitled Panel").first().click();
  const input = page.locator("input");
  await input.fill("Cockpit");
  await input.press("Enter");
  await expect(page.getByText("Cockpit", { exact: true }).first()).toBeVisible();
  // `.first()`: avoids a strict-mode violation if a stale duplicate briefly
  // remains during the async rename in flight (same reasoning as the delete
  // test below).
  await expect(page.getByText("Untitled Panel").first()).not.toBeVisible();
});

test("deleting an empty panel needs no confirmation content about controls but still confirms", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Untitled Panel");
    dialog.accept();
  });
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  // `.first()`: while the delete is in flight there can be a brief instant
  // where both the Panels strip chip and the table's group-header row still
  // match, which would otherwise throw a strict-mode violation instead of
  // letting the assertion's normal retry-until-gone behavior settle to zero.
  await expect(page.getByText("Untitled Panel").first()).not.toBeVisible();
});

test("canceling a panel delete confirmation keeps the panel", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  // The Controls table also shows this (still-empty) panel as its own
  // group-header row, so "Untitled Panel" appears twice; `.first()` targets
  // the Panels strip's chip.
  await expect(page.getByText("Untitled Panel").first()).toBeVisible();
});
