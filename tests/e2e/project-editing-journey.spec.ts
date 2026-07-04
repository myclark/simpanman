import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("new project from scratch: add a panel, add a board, add an assigned control, save", async ({
  page,
  mock,
}) => {
  await page.getByRole("button", { name: "New Project" }).click();

  // Add a panel.
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  // `.first()`: the Panels strip (rendered above the table) has the
  // clickable rename span; the table now also shows "Untitled Panel" as its
  // own (empty) group-header text, which isn't clickable-to-rename, so an
  // unscoped locator would match both and be ambiguous.
  await page.getByText("Untitled Panel").first().click();
  // `input[value="Untitled Panel"]` would stop matching its own locator
  // string as soon as fill() changes the value (same class of issue Task 10
  // hit for panel rename, see boards-editing.spec.ts); only one input exists
  // in rename mode, so target it directly.
  const panelNameInput = page.locator("input");
  await panelNameInput.fill("Armament");
  await panelNameInput.press("Enter");
  await expect(page.getByText("Armament", { exact: true }).first()).toBeVisible();

  // Add a second board (the new project already seeds "Board 1").
  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("button", { name: "+ Add Board" }).click();
  // Board cards show the name, the (initially identical) USB product
  // string, and open a detail panel repeating the name in its heading, so
  // "Board 2" appears more than once (same as boards-editing.spec.ts);
  // `.first()` targets the card's name label.
  await expect(page.getByText("Board 2", { exact: true }).first()).toBeVisible();

  // Back to Controls: add a control to the new panel, assigned to Board 1.
  await page.getByRole("button", { name: "Controls" }).click();
  const panelRow = page.locator("tr", { hasText: "Armament" }).first();
  await panelRow.click();
  // Scoped to this panel's row: the seeded "Panel 1" (still empty at this
  // point) renders its own "+ Add control to this panel" button too, so an
  // unscoped page-level locator would match two buttons.
  await panelRow.locator("xpath=following-sibling::tr[1]").getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Master Arm");
  await page.getByLabel("Board").selectOption({ label: "Board 1" });
  // Scoped to the control form: the project title bar also has its own
  // "Save" button once the project is dirty (it already is, from the
  // panel rename/board add above), so an unscoped locator would match two
  // buttons.
  await page.locator("form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Master Arm")).toBeVisible();

  // Save the project.
  await page.getByRole("button", { name: "Save" }).click();
  expect(mock.saveCalls()).toBeGreaterThan(0);
});
