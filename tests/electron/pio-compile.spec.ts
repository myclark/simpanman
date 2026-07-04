import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAIN = path.join(root, "dist-electron", "main.cjs");
const HELPER_BIN = path.join(root, "helper", "target", "release", "simpanman-helper");

function pioAvailable(): boolean {
  const pio = process.env.SIMPANMAN_PIO || "pio";
  try {
    execFileSync(pio, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Exercises the real compile pipeline end to end: renderer IPC call → main
// process → native helper binary → actual `pio run`. The mocked e2e suite
// (tests/e2e/build-view.spec.ts) never calls through the real preload bridge
// or spawns a real process, so it can't catch a wiring break between
// ipc.ts/helper.ts/main.rs. Requires a real PlatformIO install; skipped
// otherwise (e.g. CI runners that don't have `pio` and its toolchains).
test.skip(!pioAvailable(), "PlatformIO ('pio') not found on PATH — skipping real-compile test");

test("real pio:detect and build:compile against the f5e-armament example", async () => {
  test.setTimeout(180_000);

  // The Playwright electron harness launches main.cjs by absolute path rather
  // than `electron .` (as `make dev` does), which changes how Electron
  // resolves app.getAppPath() and breaks the helper binary's dev-path
  // auto-detection. Point it at the release build directly via the same
  // SIMPANMAN_HELPER override real users can use for a non-standard install.
  const app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, SIMPANMAN_HELPER: HELPER_BIN },
  });
  try {
    const win = await app.firstWindow();
    const projectJson = await fsp.readFile(
      path.join(root, "examples", "f5e-armament.spm"),
      "utf8",
    );

    const pio = await win.evaluate(() => {
      const api = (window as unknown as { api: { detectPio(): Promise<{ available: boolean }> } })
        .api;
      return api.detectPio();
    });
    expect(pio.available).toBe(true);

    const status = await win.evaluate(async (json) => {
      const api = (
        window as unknown as {
          api: {
            compileBoard(project: unknown, boardId: string): Promise<void>;
            onCompileStatus(
              cb: (e: { boardId: string; success: boolean; exitCode: number | null }) => void,
            ): () => void;
          };
        }
      ).api;
      const project = JSON.parse(json);
      return new Promise((resolve) => {
        const off = api.onCompileStatus((s) => {
          off();
          resolve(s);
        });
        void api.compileBoard(project, "board-arm");
      });
    }, projectJson);

    expect((status as { success: boolean }).success).toBe(true);
  } finally {
    await app.close();
  }
});

test("clicking Compile in the real UI drives a real pio run", async () => {
  test.setTimeout(180_000);

  const app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, SIMPANMAN_HELPER: HELPER_BIN },
  });
  try {
    // Playwright can't drive the native open-file dialog directly; patch
    // dialog.showOpenDialog in the main process (same technique real code
    // uses to resolve a path) to return the fixture path instead. The main
    // process still does the actual file read + parse — only the dialog
    // prompt itself is stubbed.
    const f5eSpmPath = path.join(root, "examples", "f5e-armament.spm");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [filePath] })) as typeof dialog.showOpenDialog;
    }, f5eSpmPath);

    const win = await app.firstWindow();
    await win.getByRole("banner").getByRole("button", { name: "Open" }).click();
    await expect(win.getByText("F-5E Armament Panel")).toBeVisible();

    await win.getByRole("navigation").getByRole("button", { name: "Build & Upload" }).click();
    await expect(win.getByText(/PlatformIO .* detected\./)).toBeVisible();

    await win.getByRole("button", { name: "Compile" }).click();
    await expect(win.getByText("Compiling…").first()).toBeVisible();
    // Not `exact: true` on a broader match — "Success" is a substring of the
    // "Requires a successful Build first." fallback text that's visible
    // before compiling too, so a loose match here would resolve immediately.
    await expect(win.getByText("Success", { exact: true }).first()).toBeVisible({
      timeout: 120_000,
    });

    // Generate & Export: clipboard copy and Arduino sketch export, both
    // through real IPC (clipboard-write permission granted below; folder
    // picker stubbed the same way as the project-open dialog above).
    await app.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await win.getByRole("button", { name: "Copy firmware to clipboard" }).click();
    await expect(win.getByText("Copied!")).toBeVisible();
    const clipboardText = await win.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("#include");

    const exportDir = path.join(root, "test-results", "pio-compile-arduino-export");
    await fsp.rm(exportDir, { recursive: true, force: true });
    await fsp.mkdir(exportDir, { recursive: true });
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog;
    }, exportDir);
    await win.getByRole("button", { name: "Export as Arduino sketch…" }).click();
    await expect
      .poll(async () => (await fsp.readdir(exportDir)).length > 0, { timeout: 10_000 })
      .toBe(true);
    const sketchDirs = await fsp.readdir(exportDir);
    const sketchFiles = await fsp.readdir(path.join(exportDir, sketchDirs[0]));
    expect(sketchFiles.some((f) => f.endsWith(".ino"))).toBe(true);
    expect(sketchFiles).toContain("README.txt");

    // Editing a control should mark the existing compile stale and re-gate Program.
    await win.getByRole("navigation").getByRole("button", { name: "Controls" }).click();
    await win.locator("tr").filter({ hasText: "Armament Panel" }).first().locator("td").click();
    await win.getByRole("button", { name: "Edit" }).first().click();
    const labelInput = win.getByLabel("Label");
    const newLabel = `${await labelInput.inputValue()} (edited)`;
    await labelInput.fill(newLabel);
    await win.locator("form").getByRole("button", { name: "Save" }).click();
    await expect(win.getByText(newLabel)).toBeVisible();

    await win.getByRole("navigation").getByRole("button", { name: "Build & Upload" }).click();
    await expect(
      win.getByText(/panel design changed since the last successful compile/),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});
