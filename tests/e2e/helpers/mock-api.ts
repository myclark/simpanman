import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Project, SerialPort, ValidationReport } from "../../../src/types/index.js";
import { computePinMap } from "./project-fixtures.js";

// The renderer talks to the Electron main process over the preload bridge
// (window.api). In tests there is no main process, so we inject a stand-in
// window.api whose data behavior mirrors the real engine's command surface.
// State the tests need to drive/inspect (validation + port overrides, call
// counters, the project the open-dialog returns) lives in this Node fixture and
// is reached from the page via exposeFunction bindings.

/** Handle for pushing build log/status events the way the main process would. */
export interface WsHandle {
  sendLog(boardId: string, line: string, isErr?: boolean): Promise<void>;
  sendStatus(boardId: string, success: boolean, exitCode?: number): Promise<void>;
}

/** Test-side controls over the injected window.api. */
export interface MockControl {
  /** Prime the next openProjectDialog() to return this .spm file's contents. */
  primeOpen(absPath: string): void;
  /** Override the report validate() returns (defaults to clean). */
  setValidate(report: ValidationReport): void;
  /** Override the serial ports listSerialPorts() returns. */
  setPorts(ports: SerialPort[]): void;
  /** How many times listSerialPorts() has been invoked. */
  portListCalls(): number;
  /** How many times saveProject() has been invoked. */
  saveCalls(): number;
}

const DEFAULT_PORTS: SerialPort[] = [
  { name: "/dev/ttyACM0", description: "Arduino Leonardo" },
  { name: "/dev/ttyACM1", description: "Arduino Micro" },
];

type Fixtures = {
  mock: MockControl;
  ws: WsHandle;
  openProject: (absPath: string, opener?: () => Promise<unknown>) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  mock: [
    async ({ page }, use) => {
      // Node-side state the page reaches through exposeFunction.
      let pendingOpen: { project: Project; path: string } | null = null;
      let validateOverride: ValidationReport | null = null;
      let portsOverride: SerialPort[] | null = null;
      let portListCalls = 0;
      let saveCalls = 0;

      await page.exposeFunction("__spmOpen", () => {
        const r = pendingOpen;
        pendingOpen = null;
        return r;
      });
      await page.exposeFunction("__spmSave", (_project: Project, path: string | null) => {
        saveCalls += 1;
        return { path: path ?? "/mock/saved.spm" };
      });
      await page.exposeFunction(
        "__spmValidate",
        (): ValidationReport => validateOverride ?? { errors: [], warnings: [] },
      );
      await page.exposeFunction("__spmPorts", (): SerialPort[] => {
        portListCalls += 1;
        return portsOverride ?? DEFAULT_PORTS;
      });
      await page.exposeFunction("__spmPinmap", (project: Project, boardId: string) =>
        computePinMap(project, boardId),
      );

      // Install window.api before any page script runs.
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, (...a: unknown[]) => unknown>;
        const logCbs: ((e: unknown) => void)[] = [];
        const statusCbs: ((e: unknown) => void)[] = [];
        (window as unknown as Record<string, unknown>).__emitBuildLog = (e: unknown) =>
          logCbs.forEach((cb) => cb(e));
        (window as unknown as Record<string, unknown>).__emitBuildStatus = (e: unknown) =>
          statusCbs.forEach((cb) => cb(e));

        const sub = (arr: ((e: unknown) => void)[], cb: (e: unknown) => void) => {
          arr.push(cb);
          return () => {
            const i = arr.indexOf(cb);
            if (i >= 0) arr.splice(i, 1);
          };
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).api = {
          projectNew: (name: string) =>
            Promise.resolve({ schemaVersion: 1, name, panels: [], boards: [], controls: [] }),
          projectSerialize: (p: unknown) => Promise.resolve(JSON.stringify(p, null, 2)),
          openProjectDialog: () => w.__spmOpen(),
          saveProject: (p: unknown, path: unknown) => w.__spmSave(p, path),

          // Mutations echo the project back (the store holds the source of truth;
          // these UI tests don't assert on mutated content).
          panelUpsert: (p: unknown) => Promise.resolve(p),
          panelDelete: (p: unknown) => Promise.resolve(p),
          boardUpsert: (p: unknown) => Promise.resolve(p),
          boardDelete: (p: unknown) => Promise.resolve(p),
          controlUpsert: (p: unknown) => Promise.resolve(p),
          controlDelete: (p: unknown) => Promise.resolve(p),

          validate: (p: unknown) => w.__spmValidate(p),
          boardPinmap: (p: unknown, id: unknown) => w.__spmPinmap(p, id),
          allocateIdentity: (p: { boards: { id: string; identity: object }[] }, id: string) => {
            const boards = p.boards.map((b) =>
              b.id === id ? { ...b, identity: { ...b.identity, usbPid: 0x0010 } } : b,
            );
            const updated = { ...p, boards };
            const identity = boards.find((b) => b.id === id)!.identity;
            return Promise.resolve([updated, identity]);
          },
          generateBoard: () => Promise.resolve({ boardId: "", files: [] }),

          listSerialPorts: () => w.__spmPorts(),
          buildBoard: () => Promise.resolve(),

          onBuildLog: (cb: (e: unknown) => void) => sub(logCbs, cb),
          onBuildStatus: (cb: (e: unknown) => void) => sub(statusCbs, cb),
          onUpdateStatus: () => () => {},
          installUpdate: () => Promise.resolve(),
          appVersion: () => Promise.resolve("0.0.0-test"),
        };
      });

      const control: MockControl = {
        primeOpen(absPath) {
          pendingOpen = {
            project: JSON.parse(readFileSync(absPath, "utf8")) as Project,
            path: absPath,
          };
        },
        setValidate(report) {
          validateOverride = report;
        },
        setPorts(ports) {
          portsOverride = ports;
        },
        portListCalls: () => portListCalls,
        saveCalls: () => saveCalls,
      };

      await use(control);
    },
    { auto: true },
  ],

  ws: async ({ page }, use) => {
    const handle: WsHandle = {
      sendLog: (boardId, line, isErr = false) =>
        page.evaluate(
          ([b, l, e]) =>
            (window as unknown as { __emitBuildLog: (x: unknown) => void }).__emitBuildLog({
              boardId: b,
              line: l,
              isErr: e,
            }),
          [boardId, line, isErr] as [string, string, boolean],
        ),
      sendStatus: (boardId, success, exitCode = success ? 0 : 1) =>
        page.evaluate(
          ([b, s, c]) =>
            (window as unknown as { __emitBuildStatus: (x: unknown) => void }).__emitBuildStatus({
              boardId: b,
              success: s,
              exitCode: c,
            }),
          [boardId, success, exitCode] as [string, boolean, number],
        ),
    };
    await use(handle);
  },

  openProject: async ({ page, mock }, use) => {
    await use(async (absPath, opener) => {
      mock.primeOpen(absPath);
      if (opener) await opener();
      else await page.getByRole("button", { name: "Open", exact: true }).click();
    });
  },
});

export { expect };
