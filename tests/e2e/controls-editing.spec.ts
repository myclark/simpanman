import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "+ Add Panel" }).click();
});

test("adding a control with a board selected pre-fills a recommended pin", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  // Scoped to this panel's row: the seeded "Panel 1" (also empty) renders its
  // own "+ Add control to this panel" button too, so an unscoped page-level
  // locator would match two buttons.
  await panelRow.locator("xpath=following-sibling::tr[1]").getByText("+ Add control to this panel").click();

  await page.getByLabel("Label").fill("Master Arm");
  await page.getByLabel("Board").selectOption({ label: "Board 1" });

  const pinSelect = page.getByLabel("Pin");
  await expect(pinSelect).not.toHaveValue("");

  // Scoped to the control form: the project title bar also has its own
  // "Save" button once the project is dirty (it already is, from the
  // "+ Add Panel" click in beforeEach), so an unscoped locator would match
  // two buttons.
  await page.locator("form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Master Arm")).toBeVisible();
  await expect(page.getByText("1 controls")).not.toBeVisible(); // sanity: toolbar pluralizes correctly
  // Scoped to the toolbar's count span specifically: the panel group header
  // also reads "1 control" once it has exactly one control (as it now does),
  // so an unscoped exact-text locator would match two elements.
  await expect(page.locator("span.text-sm.font-medium", { hasText: "1 control" })).toBeVisible();
});

test("adding a control with no board yet leaves it unassigned with a warning", async ({ page, mock }) => {
  await mock.setValidate({
    errors: [],
    warnings: [{ kind: "ControlUnassigned", controlId: "will-not-match-but-fine" }],
  });

  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  // Scoped to this panel's row: the seeded "Panel 1" (also empty) renders its
  // own "+ Add control to this panel" button too, so an unscoped page-level
  // locator would match two buttons.
  await panelRow.locator("xpath=following-sibling::tr[1]").getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Future Switch");
  // Leave Board as "— Unassigned —" (default).
  // Scoped to the control form: the project title bar also has its own
  // "Save" button once the project is dirty (it already is, from the
  // "+ Add Panel" click in beforeEach), so an unscoped locator would match
  // two buttons.
  await page.locator("form").getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Future Switch")).toBeVisible();
  await expect(page.getByText(/has no board\/pin assigned yet/)).toBeVisible();
});

test("editing a control changes its label", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  // Scoped to this panel's row: the seeded "Panel 1" (also empty) renders its
  // own "+ Add control to this panel" button too, so an unscoped page-level
  // locator would match two buttons.
  await panelRow.locator("xpath=following-sibling::tr[1]").getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Original Label");
  // Scoped to the control form: the project title bar also has its own
  // "Save" button once the project is dirty (it already is, from the
  // "+ Add Panel" click in beforeEach), so an unscoped locator would match
  // two buttons.
  await page.locator("form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Original Label")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Label").fill("Renamed Label");
  await page.locator("form").getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Renamed Label")).toBeVisible();
  await expect(page.getByText("Original Label")).not.toBeVisible();
});

test("deleting a control needs confirmation and removes it", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  // Scoped to this panel's row: the seeded "Panel 1" (also empty) renders its
  // own "+ Add control to this panel" button too, so an unscoped page-level
  // locator would match two buttons.
  await panelRow.locator("xpath=following-sibling::tr[1]").getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Disposable Button");
  // Scoped to the control form: the project title bar also has its own
  // "Save" button once the project is dirty (it already is, from the
  // "+ Add Panel" click in beforeEach), so an unscoped locator would match
  // two buttons.
  await page.locator("form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Disposable Button")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  // `exact: true` matters here: Playwright's default name matching is a
  // substring match, and the Panels strip's own "Delete panel <name>"
  // buttons (always rendered, one per panel) also contain "Delete" — an
  // unscoped/non-exact locator would match those too and `.first()` would
  // hit the wrong button (deleting a panel instead of the control).
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Disposable Button")).not.toBeVisible();
});
