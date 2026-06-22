import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Save button is hidden when no project is open", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
});

test("Save button appears after New Project is created", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});

test("no dirty indicator when project first opened", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  await expect(page.locator('[title="Unsaved changes"]')).not.toBeVisible();
});

test("dirty indicator appears after a mutation (allocate identity)", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("button", { name: "Allocate Identity" }).click();

  await expect(page.locator('[title="Unsaved changes"]')).toBeVisible();
});

test("Save button is highlighted blue when project is dirty", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  // Make project dirty via identity allocation
  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("button", { name: "Allocate Identity" }).click();

  const saveBtn = page.getByRole("button", { name: "Save" });
  await expect(saveBtn).toHaveClass(/bg-\[#1f6feb\]/);
});

test("clicking Save calls project_serialize API", async ({ page }) => {
  let serializeCalled = false;
  await page.route("/api/project_serialize", async (route) => {
    serializeCalled = true;
    const body = (await route.request().postDataJSON()) as { project: unknown };
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: JSON.stringify(body.project),
    });
  });

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(serializeCalled).toBe(true);
});

test("dirty indicator disappears after saving", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const fc = await chooser;
  await fc.setFiles(F5E_SPM);
  await expect(page.getByText("F-5E Armament Panel")).toBeVisible();

  // Make dirty
  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("button", { name: "Allocate Identity" }).click();
  await expect(page.locator('[title="Unsaved changes"]')).toBeVisible();

  // Save
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator('[title="Unsaved changes"]')).not.toBeVisible();
});
