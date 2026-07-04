import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "./helpers/mock-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F5E_SPM = path.resolve(__dirname, "../../examples/f5e-armament.spm");

type OpenFn = (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;

async function loadProjectAndGoToBuild(page: import("@playwright/test").Page, openProject: OpenFn) {
  await openProject(F5E_SPM);
  await expect(page.getByRole("banner").getByText("F-5E Armament Panel")).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Build & Upload" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows Build & Upload heading after project loaded", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByRole("heading", { name: "Build & Upload" })).toBeVisible();
});

test("board card shows board name and identity", async ({ page, openProject }) => {
  await loadProjectAndGoToBuild(page, openProject);
  await expect(page.getByText("Armament", { exact: true })).toBeVisible();
  await expect(page.getByText("F5E Armament")).toBeVisible();
});

test.describe("PlatformIO available", () => {
  test.beforeEach(async ({ mock }) => {
    mock.setPio({ available: true, version: "6.1.13" });
  });

  test("shows the detected version banner", async ({ page, openProject }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await expect(page.getByText("PlatformIO 6.1.13 detected.")).toBeVisible();
  });

  test("Build stage shows board type/variant/env and a Compile button", async ({
    page,
    openProject,
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await expect(page.getByText(/Board type: Leonardo/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Compile" })).toBeEnabled();
  });

  test("clicking Compile calls compileBoard and shows Compiling…", async ({
    page,
    openProject,
    mock,
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    await expect(page.getByText("Compiling…").first()).toBeVisible();
    await expect.poll(() => mock.compileCalls()).toBe(1);
  });

  test("compile log lines appear and success sets Success badge", async ({
    page,
    openProject,
    ws,
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();

    ws.sendCompileLog("board-arm", "Compiling firmware...");
    ws.sendCompileLog("board-arm", "Linking...");
    await expect(page.getByText("Compiling firmware...")).toBeVisible();
    await expect(page.getByText("Linking...")).toBeVisible();

    ws.sendCompileStatus("board-arm", true);
    await expect(page.getByText("Success").first()).toBeVisible();
  });

  test("compile failure shows the reframed message and Copy log / File an issue actions", async ({
    page,
    openProject,
    ws,
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    ws.sendCompileLog("board-arm", "collect2: error: ld returned 1 exit status", true);
    ws.sendCompileStatus("board-arm", false, 1);

    await expect(page.getByText(/wasn't caused by your panel design/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy log" })).toBeVisible();
    await expect(page.getByRole("link", { name: "File an issue" })).toHaveAttribute(
      "href",
      /github\.com\/myclark\/simpanman\/issues\/new/,
    );
  });

  test("Program stage is disabled until a successful compile", async ({ page, openProject }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await expect(page.getByText("Requires a successful Build first.")).toBeVisible();
  });

  test("Program stage enables after a successful compile", async ({ page, openProject, ws }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    ws.sendCompileStatus("board-arm", true);

    await expect(page.getByRole("button", { name: "Flash" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Detect board" })).toBeEnabled();
  });

  test("manual port selection enables Flash", async ({ page, openProject, ws }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    ws.sendCompileStatus("board-arm", true);

    const select = page.getByRole("combobox");
    await select.selectOption("/dev/ttyACM0");
    await expect(page.getByRole("button", { name: "Flash" })).toBeEnabled();
  });

  test("clicking Flash calls flashBoard", async ({ page, openProject, ws, mock }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    ws.sendCompileStatus("board-arm", true);

    await page.getByRole("combobox").selectOption("/dev/ttyACM0");
    await page.getByRole("button", { name: "Flash" }).click();
    await expect(page.getByText("Flashing…").first()).toBeVisible();
    await expect.poll(() => mock.flashCalls()).toBe(1);
  });

  test("detecting a foreign-identity board requires explicit confirmation", async ({
    page,
    openProject,
    mock,
    ws,
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    ws.sendCompileStatus("board-arm", true);
    mock.setClassification("foreign");
    mock.setPorts([
      { name: "/dev/ttyACM0", description: "Arduino Leonardo" },
      { name: "/dev/ttyACM1", description: "Arduino Leonardo", vid: 0x1209, pid: 2 },
    ]);

    await page.getByRole("button", { name: "Detect board" }).click();
    mock.setPorts([
      { name: "/dev/ttyACM0", description: "Arduino Leonardo" },
      { name: "/dev/ttyACM1", description: "Arduino Leonardo", vid: 0x1209, pid: 2 },
      { name: "/dev/ttyACM2", description: "Arduino Leonardo", vid: 0x1209, pid: 3 },
    ]);

    await expect(page.getByText(/reports a Sim Panel Manager identity from another/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, overwrite it" })).toBeVisible();
  });
});

test.describe("PlatformIO unavailable", () => {
  test.beforeEach(async ({ mock }) => {
    mock.setPio({ available: false, version: null });
  });

  test("shows install instructions and disables Build", async ({ page, openProject }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await expect(page.getByText(/PlatformIO not found/)).toBeVisible();
    await expect(page.getByText("pip install platformio")).toBeVisible();
    await expect(page.getByText("Requires PlatformIO — see the banner above.")).toBeVisible();
  });

  test("Generate & Export still works without PlatformIO", async ({ page, openProject }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await expect(page.getByRole("button", { name: "Copy firmware to clipboard" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Export as Arduino sketch…" })).toBeEnabled();
  });

  test("Recheck re-queries PlatformIO detection", async ({ page, openProject, mock }) => {
    await loadProjectAndGoToBuild(page, openProject);
    mock.setPio({ available: true, version: "6.1.13" });
    await page.getByRole("button", { name: "Recheck" }).click();
    await expect(page.getByText("PlatformIO 6.1.13 detected.")).toBeVisible();
  });
});
