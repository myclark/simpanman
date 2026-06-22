import { test as base, expect } from "@playwright/test";
import type { WebSocketRoute } from "@playwright/test";
import type { Project } from "../../../src/types/index.js";
import { computePinMap } from "./project-fixtures.js";

export interface WsHandle {
  route: WebSocketRoute | null;
  sendLog(boardId: string, line: string, isErr?: boolean): void;
  sendStatus(boardId: string, success: boolean, exitCode?: number): void;
}

// Shared handle kept in module scope per test-worker. Safe because Playwright
// runs each test in its own context and resets state between tests.
function makeHandle(): WsHandle {
  return {
    route: null,
    sendLog(boardId, line, isErr = false) {
      this.route?.send(
        JSON.stringify({ event: "build://log", payload: { boardId, line, isErr } }),
      );
    },
    sendStatus(boardId, success, exitCode = success ? 0 : 1) {
      this.route?.send(
        JSON.stringify({ event: "build://status", payload: { boardId, success, exitCode } }),
      );
    },
  };
}

type Fixtures = {
  // Auto-applied: HTTP API mocks + WebSocket mock, every test.
  apiMocks: WsHandle;
  // Convenience alias so tests can write `{ ws }` to get the WS handle.
  ws: WsHandle;
};

export const test = base.extend<Fixtures>({
  // Both HTTP and WebSocket mocks run automatically for every test so that the
  // WebSocket route is registered before page.goto("/") fires in beforeEach.
  apiMocks: [
    async ({ page }, use) => {
      const handle = makeHandle();

      // WebSocket mock — always installed so the app never hits Vite's proxy.
      await page.routeWebSocket(/\/api\/events$/, (ws) => {
        handle.route = ws;
      });

      // HTTP API mock
      await page.route("**/api/**", async (route, request) => {
        const url = request.url();
        const endpoint = url.split("/api/")[1]?.split("?")[0] ?? "";
        let body: Record<string, unknown> = {};
        try {
          body = (await request.postDataJSON()) as Record<string, unknown>;
        } catch {
          // ignore non-JSON or empty bodies
        }

        switch (endpoint) {
          case "project_new": {
            const name = (body.name as string) ?? "New Project";
            const project: Project = {
              schemaVersion: 1,
              name,
              panels: [],
              boards: [],
              controls: [],
            };
            await route.fulfill({ json: project });
            break;
          }

          case "project_open": {
            const content = (body.content as string) ?? "{}";
            const project = JSON.parse(content) as Project;
            await route.fulfill({ json: project });
            break;
          }

          case "project_serialize": {
            const project = body.project as Project;
            await route.fulfill({
              status: 200,
              contentType: "text/plain",
              body: JSON.stringify(project, null, 2),
            });
            break;
          }

          case "validate": {
            await route.fulfill({ json: { errors: [], warnings: [] } });
            break;
          }

          case "board_pinmap": {
            const project = body.project as Project;
            const boardId = body.boardId as string;
            await route.fulfill({ json: computePinMap(project, boardId) });
            break;
          }

          case "allocate_identity": {
            const project = body.project as Project;
            const boardId = body.boardId as string;
            const updated: Project = {
              ...project,
              boards: project.boards.map((b) =>
                b.id === boardId
                  ? { ...b, identity: { ...b.identity, usbPid: 0x0010 } }
                  : b,
              ),
            };
            const newIdentity = updated.boards.find((b) => b.id === boardId)!.identity;
            await route.fulfill({ json: [updated, newIdentity] });
            break;
          }

          case "list_serial_ports": {
            await route.fulfill({
              json: [
                { name: "/dev/ttyACM0", description: "Arduino Leonardo" },
                { name: "/dev/ttyACM1", description: "Arduino Micro" },
              ],
            });
            break;
          }

          case "build_board": {
            await route.fulfill({ status: 200 });
            break;
          }

          case "panel_upsert":
          case "panel_delete":
          case "board_upsert":
          case "board_delete":
          case "control_upsert":
          case "control_delete": {
            const project = (body.project as Project) ?? {
              schemaVersion: 1,
              name: "Project",
              panels: [],
              boards: [],
              controls: [],
            };
            await route.fulfill({ json: project });
            break;
          }

          default:
            await route.fulfill({ status: 404, body: `Unknown endpoint: ${endpoint}` });
        }
      });

      await use(handle);
    },
    { auto: true },
  ],

  // Convenience fixture: just returns the WsHandle already created by apiMocks.
  ws: async ({ apiMocks }, use) => {
    await use(apiMocks);
  },
});

export { expect };
