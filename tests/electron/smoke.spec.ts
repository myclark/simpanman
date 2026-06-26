import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAIN = path.join(root, "dist-electron", "main.cjs");

// Boots the actual Electron app (built renderer + bundled main/preload) and
// verifies the preload bridge is wired and the real main-process engine works.
test("app boots, preload bridge is exposed, and a project round-trips", async () => {
  const app = await electron.launch({ args: [MAIN] });
  try {
    const win = await app.firstWindow();
    await expect(
      win.getByRole("banner").getByText("Sim Panel Manager"),
    ).toBeVisible();

    // The contextBridge should have exposed window.api.
    const hasApi = await win.evaluate(
      () => typeof (window as unknown as { api?: { projectNew?: unknown } }).api?.projectNew === "function",
    );
    expect(hasApi).toBe(true);

    // Round-trip a project through the real engine in the main process.
    const result = await win.evaluate(async () => {
      const api = (window as unknown as { api: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;
      const project = (await api.projectNew("Smoke Test")) as {
        name: string;
        boards: unknown[];
      };
      const json = (await api.projectSerialize(project)) as string;
      const report = (await api.validate(project)) as { errors: unknown[] };
      return {
        name: project.name,
        boards: project.boards.length,
        jsonHasName: json.includes("Smoke Test"),
        errorCount: report.errors.length,
      };
    });

    expect(result.name).toBe("Smoke Test");
    expect(result.boards).toBe(1); // real engine seeds a default board
    expect(result.jsonHasName).toBe(true);
    expect(result.errorCount).toBe(0);
  } finally {
    await app.close();
  }
});
