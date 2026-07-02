import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "Boards" }).click();
});

test("Add Board creates a new board card with an allocated identity", async ({ page }) => {
  // "New Project" already seeds one board ("Board 1"), so a second add is "Board 2".
  await page.getByRole("button", { name: "+ Add Board" }).click();
  // Board cards show the name and the (initially identical) USB product string,
  // so "Board 2" appears twice; .first() targets the name label.
  await expect(page.getByText("Board 2", { exact: true }).first()).toBeVisible();
});

test("renaming a board updates its name but keeps its identity", async ({ page }) => {
  await page.locator("text=Board 1").first().click();
  // `input[value="Board 1"]` would stop matching its own locator string as
  // soon as fill() changes the value (same class of issue Task 10 hit for
  // panel rename); only one input exists in rename mode, so target it directly.
  const input = page.locator("input");
  await input.fill("Main Panel Board");
  await input.press("Enter");
  // Selecting the board (clicking its name bubbles into onSelect too) opens
  // the detail panel, which repeats the name in its heading; .first() targets
  // the sidebar card label.
  await expect(page.getByText("Main Panel Board", { exact: true }).first()).toBeVisible();
});

test("deleting a board with no controls needs a confirmation and removes it", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Board" }).click();
  await expect(page.getByText("Board 2", { exact: true }).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete board Board 2" }).click();
  await expect(page.getByText("Board 2", { exact: true }).first()).not.toBeVisible();
});

test("canceling a board delete confirmation keeps the board", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete board Board 1" }).click();
  await expect(page.getByText("Board 1", { exact: true }).first()).toBeVisible();
});
