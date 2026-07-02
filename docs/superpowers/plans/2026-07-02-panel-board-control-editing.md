# Panel/Board/Control Editing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Controls grid and Boards view fully editable (add/edit/delete panels, boards, and controls of all five kinds), including a control's board+pin recommendation and safe delete confirmations, per `docs/superpowers/specs/2026-07-02-panel-board-control-editing-design.md`.

**Architecture:** Almost entirely a UI layer over an already-complete store/IPC/engine CRUD surface (`upsertPanel`/`deletePanel`/`upsertBoard`/`deleteBoard`/`upsertControl`/`deleteControl` in `src/store/index.ts` already round-trip through real IPC). Three small, contained engine changes unlock it: optional `boardId`/pin fields on `Control` (so a control can exist "unassigned"), a richer `PinMap.free` shape (interrupt-capability, for pin recommendation), and `boardDelete` auto-unassigning instead of hard-deleting affected controls. The editing UI reuses the row-expand interaction already in `ControlsView.tsx` via new, separate local component state (not the TanStack `expanded`/grouping state hardened by the earlier renderer-freeze fix).

**Tech Stack:** React 18 + TypeScript + Vite (renderer), Zustand (store), `@tanstack/react-table` (grid), Electron main-process engine (`electron/engine/`), Vitest (engine tests, Node env, `tests/engine/**/*.test.ts` only), Playwright (`tests/e2e/`, real `.click()` — see Global Constraints).

## Global Constraints

- Use real `.click()` in all new/modified Playwright specs, never `.dispatchEvent("click")` — a prior renderer-freeze bug shipped undetected specifically because existing tests used the synthetic event, which happens to dodge React's synchronous discrete-event path. The one existing exception (`tests/e2e/tab-navigation.spec.ts:44`) has its own unrelated, documented reason and must not be changed.
- No IPC channel signature changes — every mutation flows through the six existing store actions (`upsertPanel`, `deletePanel`, `upsertBoard`, `deleteBoard`, `upsertControl`, `deleteControl`). Only their *payload shapes* change (optional fields), never the channel names or the `ElectronApi` interface's method signatures beyond that.
- New entity IDs are generated in the renderer with the built-in `crypto.randomUUID()` (Web Crypto, available per `tsconfig.json`'s `"lib": ["ES2022", "DOM", "DOM.Iterable"]`) — do not add the unused `uuid` package dependency to any new renderer code.
- Destructive actions (delete panel/board) always show a native `window.confirm(...)` dialog stating how many controls will be deleted/unassigned, when the deletion affects any control. Do not build a custom modal component for this — `window.confirm` is sufficient, themeless-but-adequate, and trivially testable in Playwright via `page.once("dialog", d => d.accept())` / `d.dismiss()`.
- Follow existing Tailwind color tokens throughout (dark theme): background `#0d1117`/`#161b22`/`#1c2333`, borders `#30363d`/`#21262d`, text `#e6edf3`/`#8b949e`/`#484f58`, accent blue `#1f6feb`/`#388bfd`/`#58a6ff`, red `#f85149`/`#3d1a1a`, green `#3fb950`/`#1e3a2e`, amber `#d29922`/`#2d2000`.
- `noUnusedLocals`/`noUnusedParameters`/`strict` are all on in `tsconfig.json` — every step's code must typecheck cleanly under `npm run typecheck`.

---

### Task 1: Make board/pin fields optional in the data model

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/engine/validation.ts:113-129` (`collectPins`)
- Modify: `electron/engine/validation.ts:32-70` (kind-specific switch in `validate`)
- Modify: `electron/engine/pins.ts:74-82` (encoder interrupt-check block)
- Test: `tests/engine/validation.test.ts`, `tests/engine/pins.test.ts` (existing — must still pass unmodified after this task; no new tests needed here, this task only loosens types and adds defensive guards with no behavior change for fully-populated fixtures)

**Interfaces:**
- Produces: `Base.boardId?: string`, `ButtonControl.pin?: PinRef`, `SwitchControl.pin?: PinRef`, `EncoderControl.encoder?: EncoderConfig`, `AnalogControl.analog?: AnalogConfig`. `SelectorControl.positions: SelectorPosition[]` is unchanged in type (already just an array, can already be empty at runtime).
- Consumes: nothing new.

- [ ] **Step 1: Change the type declarations**

In `src/types/index.ts`, change:

```ts
type Base = {
  id: string;
  panelId: string;
  boardId: string;
  label: string;
  notes?: string;
};

export type ButtonControl = Base & { kind: "button"; pin: PinRef };
export type SwitchControl = Base & { kind: "switch"; pin: PinRef; onLabel: string; offLabel: string };
export type SelectorControl = Base & { kind: "selector"; positions: SelectorPosition[] };
export type EncoderControl = Base & { kind: "encoder"; encoder: EncoderConfig };
export type AnalogControl = Base & { kind: "analog"; analog: AnalogConfig };
```

to:

```ts
type Base = {
  id: string;
  panelId: string;
  boardId?: string;
  label: string;
  notes?: string;
};

export type ButtonControl = Base & { kind: "button"; pin?: PinRef };
export type SwitchControl = Base & { kind: "switch"; pin?: PinRef; onLabel: string; offLabel: string };
export type SelectorControl = Base & { kind: "selector"; positions: SelectorPosition[] };
export type EncoderControl = Base & { kind: "encoder"; encoder?: EncoderConfig };
export type AnalogControl = Base & { kind: "analog"; analog?: AnalogConfig };
```

- [ ] **Step 2: Run typecheck to see everywhere this breaks**

Run: `npm run typecheck`
Expected: FAILS in `electron/engine/validation.ts` and `electron/engine/pins.ts` (accessing `.pin`, `.encoder`, `.analog` on now-possibly-undefined fields) and possibly `electron/engine/render.ts`/`electron/engine/buttonIndex.ts` — note every file it flags, you'll fix each below. (If `render.ts`/`buttonIndex.ts` are flagged: guard the same way as `collectPins` below — skip/return empty for a control missing its kind-specific config, since an unassigned control is never included in `generateBoard`'s per-board filter anyway, but these functions must still typecheck.)

- [ ] **Step 3: Fix `collectPins` in `electron/engine/validation.ts`**

Change:

```ts
export function collectPins(control: Control): string[] {
  switch (control.kind) {
    case "button":
      return [control.pin.pin];
    case "switch":
      return [control.pin.pin];
    case "selector":
      return [
        ...new Set(control.positions.flatMap((p) => p.pins.map((pr) => pr.pin))),
      ];
    case "encoder":
      return [control.encoder.pinA, control.encoder.pinB];
    case "analog":
      return [control.analog.pin];
  }
}
```

to:

```ts
export function collectPins(control: Control): string[] {
  switch (control.kind) {
    case "button":
      return control.pin ? [control.pin.pin] : [];
    case "switch":
      return control.pin ? [control.pin.pin] : [];
    case "selector":
      return [
        ...new Set(control.positions.flatMap((p) => p.pins.map((pr) => pr.pin))),
      ];
    case "encoder":
      return control.encoder ? [control.encoder.pinA, control.encoder.pinB] : [];
    case "analog":
      return control.analog ? [control.analog.pin] : [];
  }
}
```

- [ ] **Step 4: Guard the kind-specific checks in `validate()` in `electron/engine/validation.ts`**

Change the `switch (control.kind)` block inside `validate()`:

```ts
    switch (control.kind) {
      case "selector":
        for (const pos of control.positions) {
          if (pos.pins.length === 0) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
          if (pos.pins.length > 1 && pos.op == null) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
        }
        break;
      case "encoder":
        if (control.encoder.mode === "axis") {
          if (control.encoder.axis == null) {
            errors.push({ kind: "EncoderMissingAxisConfig", controlId });
          }
        } else {
          if (control.encoder.buttonCw == null || control.encoder.buttonCcw == null) {
            errors.push({ kind: "EncoderMissingButtonConfig", controlId });
          }
        }
        break;
      case "analog": {
        const board = project.boards.find((b) => b.id === control.boardId);
        if (board) {
          const profile = profileFor(board.type);
          if (!profile.analogPins.includes(control.analog.pin)) {
            errors.push({
              kind: "AnalogPinNotCapable",
              controlId,
              pin: control.analog.pin,
            });
          }
        }
        break;
      }
      default:
        break;
    }
```

to:

```ts
    switch (control.kind) {
      case "selector":
        for (const pos of control.positions) {
          if (pos.pins.length === 0) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
          if (pos.pins.length > 1 && pos.op == null) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
        }
        break;
      case "encoder":
        if (control.encoder == null) break;
        if (control.encoder.mode === "axis") {
          if (control.encoder.axis == null) {
            errors.push({ kind: "EncoderMissingAxisConfig", controlId });
          }
        } else {
          if (control.encoder.buttonCw == null || control.encoder.buttonCcw == null) {
            errors.push({ kind: "EncoderMissingButtonConfig", controlId });
          }
        }
        break;
      case "analog": {
        if (control.analog == null) break;
        const board = project.boards.find((b) => b.id === control.boardId);
        if (board) {
          const profile = profileFor(board.type);
          if (!profile.analogPins.includes(control.analog.pin)) {
            errors.push({
              kind: "AnalogPinNotCapable",
              controlId,
              pin: control.analog.pin,
            });
          }
        }
        break;
      }
      default:
        break;
    }
```

- [ ] **Step 5: Guard the encoder interrupt-check in `electron/engine/pins.ts`**

Change:

```ts
    if (control.kind === "encoder") {
      for (const pin of [control.encoder.pinA, control.encoder.pinB]) {
        if (!profile.interruptPins.includes(pin)) {
          warnings.push(
            `Encoder '${control.label}' uses pin ${pin} which is not interrupt-capable — falling back to polling`,
          );
        }
      }
    }
```

to:

```ts
    if (control.kind === "encoder" && control.encoder != null) {
      for (const pin of [control.encoder.pinA, control.encoder.pinB]) {
        if (!profile.interruptPins.includes(pin)) {
          warnings.push(
            `Encoder '${control.label}' uses pin ${pin} which is not interrupt-capable — falling back to polling`,
          );
        }
      }
    }
```

- [ ] **Step 6: Run typecheck again, fixing any remaining flagged file the same way**

Run: `npm run typecheck`
Expected: PASS. If `electron/engine/render.ts` or `electron/engine/buttonIndex.ts` were flagged in Step 2, apply the same `control.pin`/`control.encoder`/`control.analog` existence guard pattern there (return/skip early for a control missing its kind-specific config — codegen never needs to handle an unassigned control, since `generateBoard` filters controls by `boardId === board.id` before rendering, so an unassigned control is already excluded by the time these functions run; the guard only needs to satisfy the type checker, not add new business logic).

- [ ] **Step 7: Run the existing engine test suite to confirm no behavior changed**

Run: `npm run test`
Expected: PASS — all 16 existing tests (`tests/engine/identity.test.ts`, `tests/engine/pins.test.ts`, `tests/engine/validation.test.ts`, `tests/engine/codegen.test.ts`), unmodified.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts electron/engine/validation.ts electron/engine/pins.ts
git commit -m "Make control board/pin fields optional in the data model"
```

---

### Task 2: PinMap free-pin capability info

**Files:**
- Modify: `src/types/index.ts` (add `FreePin`, change `PinMap.free`)
- Modify: `electron/engine/types.ts` (re-export `FreePin`)
- Modify: `electron/engine/pins.ts:85-86` (`computePinMap`'s free-pin computation)
- Modify: `src/views/boards/PinMapDisplay.tsx:66-79` (free-pin rendering)
- Modify: `tests/e2e/helpers/project-fixtures.ts:430-449` (`computePinMap` mock)
- Test: `tests/engine/pins.test.ts` (add one test)

**Interfaces:**
- Produces: `FreePin = { pin: string; interruptCapable: boolean }`, `PinMap.free: FreePin[]`.
- Consumes: `BoardProfile.interruptPins: string[]` (already exists, `electron/engine/types.ts`).

- [ ] **Step 1: Add the failing test**

In `tests/engine/pins.test.ts`, add a new `it` inside the existing `describe("pin allocator", ...)` block:

```ts
  it("flags interrupt-capable free pins on board-a (D0-D3, D7 minus used D2/D10/D11)", () => {
    const project = loadFixture("multi-board-demo.spm");
    const map = boardPinmap(project, "board-a");
    const d0 = map.free.find((p) => p.pin === "D0");
    expect(d0?.interruptCapable).toBe(true);
    const d4 = map.free.find((p) => p.pin === "D4");
    expect(d4?.interruptCapable).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/pins.test.ts -t "interrupt-capable free pins"`
Expected: FAIL — `map.free.find` doesn't work yet the way the test expects, because `free` is currently `string[]` (`d0` would be `undefined` since `.find(p => p.pin === "D0")` on an array of strings never matches; TypeScript would actually also refuse to compile this test file first — that compile error IS the "fails" signal here).

- [ ] **Step 3: Add the `FreePin` type in `src/types/index.ts`**

Change:

```ts
export type PinMap = {
  boardId: string;
  used: UsedPin[];
  free: string[];
  warnings: string[];
};
```

to:

```ts
export type FreePin = {
  pin: string;
  interruptCapable: boolean;
};

export type PinMap = {
  boardId: string;
  used: UsedPin[];
  free: FreePin[];
  warnings: string[];
};
```

- [ ] **Step 4: Re-export `FreePin` from `electron/engine/types.ts`**

In the `export type { ... } from "../../src/types/index";` block, add `FreePin` to the list (alphabetically near `Panel`/`PinRef` is fine, exact position doesn't matter — just add it anywhere in that list):

```ts
export type {
  Panel,
  BoardType,
  BoardIdentity,
  Board,
  PinRef,
  FreePin,
  ControlKind,
  ...
```

- [ ] **Step 5: Update `computePinMap` in `electron/engine/pins.ts`**

Change:

```ts
  const usedPinNames = new Set(used.map((u) => u.pin));
  const free = profile.allUsablePins.filter((p) => !usedPinNames.has(p));
```

to:

```ts
  const usedPinNames = new Set(used.map((u) => u.pin));
  const free = profile.allUsablePins
    .filter((p) => !usedPinNames.has(p))
    .map((pin) => ({ pin, interruptCapable: profile.interruptPins.includes(pin) }));
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/engine/pins.test.ts`
Expected: PASS (all 4 tests in the file now, including the new one).

- [ ] **Step 7: Fix the now-broken existing pins test assertion shape**

The existing test `"uses all 20 pins on the F-5E board"` asserts `expect(map.free).toHaveLength(0)` — this still works unchanged (`free` is still an array, just of richer objects; length-0 assertion is unaffected). No change needed there. Confirm by re-running:

Run: `npx vitest run tests/engine/pins.test.ts`
Expected: PASS (already confirmed in Step 6, this step is just documenting why no further fix was needed).

- [ ] **Step 8: Update the renderer consumer `src/views/boards/PinMapDisplay.tsx`**

Change:

```tsx
          {pinMap.free.length === 0 ? (
            <p className="text-xs text-[#484f58]">All pins are assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {pinMap.free.map((pin) => (
                <span
                  key={pin}
                  className="font-mono text-xs px-2 py-0.5 rounded bg-[#1e3a2e] text-[#3fb950]"
                >
                  {pin}
                </span>
              ))}
            </div>
          )}
```

to:

```tsx
          {pinMap.free.length === 0 ? (
            <p className="text-xs text-[#484f58]">All pins are assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {pinMap.free.map(({ pin, interruptCapable }) => (
                <span
                  key={pin}
                  title={interruptCapable ? "Interrupt-capable" : undefined}
                  className="font-mono text-xs px-2 py-0.5 rounded bg-[#1e3a2e] text-[#3fb950]"
                >
                  {pin}
                  {interruptCapable ? " ⚡" : ""}
                </span>
              ))}
            </div>
          )}
```

- [ ] **Step 9: Update the e2e mock `computePinMap` in `tests/e2e/helpers/project-fixtures.ts`**

Change:

```ts
const LEONARDO_PINS = [
  "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7",
  "D8", "D9", "D10", "D11", "D12", "D13",
  "A0", "A1", "A2", "A3", "A4", "A5",
];
const SERIAL_PINS = new Set(["D0", "D1"]);
```

to:

```ts
const LEONARDO_PINS = [
  "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7",
  "D8", "D9", "D10", "D11", "D12", "D13",
  "A0", "A1", "A2", "A3", "A4", "A5",
];
const SERIAL_PINS = new Set(["D0", "D1"]);
const INTERRUPT_PINS = new Set(["D0", "D1", "D2", "D3", "D7"]);
```

and change:

```ts
  return { boardId, used, free: LEONARDO_PINS.filter((p) => !usedSet.has(p)), warnings };
```

to:

```ts
  return {
    boardId,
    used,
    free: LEONARDO_PINS.filter((p) => !usedSet.has(p)).map((pin) => ({
      pin,
      interruptCapable: INTERRUPT_PINS.has(pin),
    })),
    warnings,
  };
```

- [ ] **Step 10: Run typecheck and the full e2e suite**

Run: `npm run typecheck && npx playwright test`
Expected: PASS — in particular `tests/e2e/boards-view.spec.ts` (the existing pin-map display tests) must still pass unchanged.

- [ ] **Step 11: Commit**

```bash
git add src/types/index.ts electron/engine/types.ts electron/engine/pins.ts src/views/boards/PinMapDisplay.tsx tests/e2e/helpers/project-fixtures.ts tests/engine/pins.test.ts
git commit -m "Surface interrupt-capability on PinMap free pins"
```

---

### Task 3: `ControlUnassigned` validation warning

**Files:**
- Modify: `electron/engine/validation.ts:22-30` (the `boardIds.has` check)
- Modify: `src/views/ControlsView.tsx` (`formatWarning`, `formatError` — add display text)
- Test: `tests/engine/validation.test.ts`

**Interfaces:**
- Produces: `ValidationWarning { kind: "ControlUnassigned"; controlId: string }`.
- Consumes: nothing new (uses existing `ValidationWarning`/`ValidationError` shapes, both already loosely typed as `{ kind: string; ... }`).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/validation.test.ts`, inside `describe("validation", ...)`, add:

```ts
  it("flags an unassigned control with a warning, not an error", () => {
    let project = projectNew("T");
    const panelId = project.panels[0].id;
    const unassigned: Control = {
      id: "u1",
      panelId,
      label: "未 Draft Button",
      kind: "button",
    };
    project = controlUpsert(project, unassigned);
    const report = validateProject(project);
    expect(report.errors.some((e) => e.kind === "MissingBoardRef")).toBe(false);
    expect(report.warnings.some((w) => w.kind === "ControlUnassigned" && w.controlId === "u1")).toBe(true);
  });

  it("still flags a genuinely dangling boardId as an error", () => {
    let project = projectNew("T");
    const panelId = project.panels[0].id;
    const dangling: Control = {
      id: "d1",
      panelId,
      boardId: "no-such-board",
      label: "Dangling Button",
      kind: "button",
      pin: { pin: "D5", inverted: false },
    };
    project = controlUpsert(project, dangling);
    const report = validateProject(project);
    expect(report.errors.some((e) => e.kind === "MissingBoardRef" && e.controlId === "d1")).toBe(true);
    expect(report.warnings.some((w) => w.kind === "ControlUnassigned")).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/validation.test.ts -t "unassigned control"`
Expected: FAIL — currently `!boardIds.has(control.boardId)` is `true` for `boardId: undefined` too, so the first test gets a `MissingBoardRef` error instead of a `ControlUnassigned` warning.

- [ ] **Step 3: Implement the fix**

In `electron/engine/validation.ts`, change:

```ts
    if (!boardIds.has(control.boardId)) {
      errors.push({ kind: "MissingBoardRef", controlId, boardId: control.boardId });
    }
```

to:

```ts
    if (control.boardId == null) {
      warnings.push({ kind: "ControlUnassigned", controlId });
    } else if (!boardIds.has(control.boardId)) {
      errors.push({ kind: "MissingBoardRef", controlId, boardId: control.boardId });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/validation.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Add display text for the new warning kind in the renderer**

In `src/views/ControlsView.tsx`, in `formatWarning`, change:

```ts
function formatWarning(w: { kind: string; [k: string]: unknown }): string {
  switch (w.kind) {
    case "SerialPinUsed":
      return `Control ${w.controlId} uses Serial pin ${w.pin} — may conflict with USB`;
    case "EncoderOnNonInterruptPin":
      return `Encoder ${w.controlId}: pin ${w.pin} is not interrupt-capable (falling back to polling)`;
    default:
      return JSON.stringify(w);
  }
}
```

to:

```ts
function formatWarning(w: { kind: string; [k: string]: unknown }): string {
  switch (w.kind) {
    case "SerialPinUsed":
      return `Control ${w.controlId} uses Serial pin ${w.pin} — may conflict with USB`;
    case "EncoderOnNonInterruptPin":
      return `Encoder ${w.controlId}: pin ${w.pin} is not interrupt-capable (falling back to polling)`;
    case "ControlUnassigned":
      return `Control ${w.controlId} has no board/pin assigned yet`;
    default:
      return JSON.stringify(w);
  }
}
```

- [ ] **Step 6: Run typecheck and the full engine + e2e suite**

Run: `npm run typecheck && npm run test && npx playwright test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/engine/validation.ts src/views/ControlsView.tsx tests/engine/validation.test.ts
git commit -m "Add ControlUnassigned validation warning for controls with no board yet"
```

---

### Task 4: `boardDelete` auto-unassigns instead of deleting controls

**Files:**
- Modify: `electron/engine/commands.ts:56-61`
- Create: `tests/engine/commands.test.ts`

**Interfaces:**
- Produces: `boardDelete(project, boardId): Project` — same signature, changed behavior (controls survive, unassigned, instead of being removed).
- Consumes: `Control`, `ButtonControl`, `SwitchControl`, `SelectorControl`, `EncoderControl`, `AnalogControl` types from `./types`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/commands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectNew, controlUpsert, boardUpsert, boardDelete } from "../../electron/engine";
import type { Control } from "../../electron/engine";

describe("boardDelete", () => {
  it("unassigns controls on the deleted board instead of deleting them", () => {
    let project = projectNew("T");
    const panelId = project.panels[0].id;
    const keepBoardId = project.boards[0].id;
    const doomedBoardId = "doomed-board";
    project = boardUpsert(project, {
      id: doomedBoardId,
      name: "Doomed",
      type: "leonardo",
      identity: { usbProduct: "Doomed", usbVid: 0x1209, usbPid: 1 },
    });
    const button: Control = {
      id: "ctl-1",
      panelId,
      boardId: doomedBoardId,
      label: "Button",
      kind: "button",
      pin: { pin: "D5", inverted: false },
    };
    project = controlUpsert(project, button);

    const next = boardDelete(project, doomedBoardId);

    expect(next.boards.some((b) => b.id === doomedBoardId)).toBe(false);
    expect(next.controls).toHaveLength(1);
    const survivor = next.controls[0] as Control & { kind: "button" };
    expect(survivor.id).toBe("ctl-1");
    expect(survivor.boardId).toBeUndefined();
    expect(survivor.pin).toBeUndefined();
    // Sanity: deleting an unrelated board leaves other controls' boardId alone.
    expect(project.boards[0].id).toBe(keepBoardId);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/commands.test.ts`
Expected: FAIL — `next.controls` has length 0 today (the control is deleted, not unassigned).

- [ ] **Step 3: Implement the fix**

In `electron/engine/commands.ts`, add these types to the existing import:

```ts
import type {
  Board,
  BoardIdentity,
  ButtonControl,
  Control,
  EncoderControl,
  GeneratedProject,
  Panel,
  PinMap,
  Project,
  SelectorControl,
  SwitchControl,
  AnalogControl,
  ValidationReport,
} from "./types";
```

Then change:

```ts
export function boardDelete(project: Project, boardId: string): Project {
  const next = clone(project);
  next.boards = next.boards.filter((b) => b.id !== boardId);
  next.controls = next.controls.filter((c) => c.boardId !== boardId);
  return next;
}
```

to:

```ts
export function boardDelete(project: Project, boardId: string): Project {
  const next = clone(project);
  next.boards = next.boards.filter((b) => b.id !== boardId);
  next.controls = next.controls.map((c) => (c.boardId === boardId ? unassign(c) : c));
  return next;
}

/** Clear a control's board + kind-specific pin config, leaving it "unassigned". */
function unassign(control: Control): Control {
  const base = { ...control, boardId: undefined };
  switch (control.kind) {
    case "button":
      return { ...base, pin: undefined } as ButtonControl;
    case "switch":
      return { ...base, pin: undefined } as SwitchControl;
    case "selector":
      return { ...base, positions: [] } as SelectorControl;
    case "encoder":
      return { ...base, encoder: undefined } as EncoderControl;
    case "analog":
      return { ...base, analog: undefined } as AnalogControl;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/engine/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck and the full engine test suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/engine/commands.ts tests/engine/commands.test.ts
git commit -m "boardDelete auto-unassigns controls instead of deleting them"
```

---

### Task 5: Pin recommendation helper

**Files:**
- Modify: `vitest.config.ts` (broaden `include` so a renderer-side pure-function test can live next to its source)
- Create: `src/lib/pinRecommendation.ts`
- Test: `src/lib/pinRecommendation.test.ts`

**Interfaces:**
- Produces: `recommendPin(pinMap: PinMap | undefined, opts?: { interruptCapable?: boolean }): string | null`.
- Consumes: `PinMap`, `FreePin` from `@/types` (Task 2).

- [ ] **Step 1: Broaden the vitest include so a colocated test can run**

In `vitest.config.ts`, change:

```ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/engine/**/*.test.ts"],
  },
});
```

to:

```ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/engine/**/*.test.ts", "src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/pinRecommendation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { recommendPin } from "./pinRecommendation";
import type { PinMap } from "@/types";

const pinMap: PinMap = {
  boardId: "b1",
  used: [],
  free: [
    { pin: "D5", interruptCapable: false },
    { pin: "D2", interruptCapable: true },
  ],
  warnings: [],
};

describe("recommendPin", () => {
  it("returns the first free pin by default", () => {
    expect(recommendPin(pinMap)).toBe("D5");
  });

  it("prefers an interrupt-capable pin when requested", () => {
    expect(recommendPin(pinMap, { interruptCapable: true })).toBe("D2");
  });

  it("returns null when there is no pin map", () => {
    expect(recommendPin(undefined)).toBeNull();
  });

  it("returns null when there are no free pins", () => {
    expect(recommendPin({ ...pinMap, free: [] })).toBeNull();
  });

  it("falls back to the first free pin if none is interrupt-capable", () => {
    const noInterrupt: PinMap = { ...pinMap, free: [{ pin: "D5", interruptCapable: false }] };
    expect(recommendPin(noInterrupt, { interruptCapable: true })).toBe("D5");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/pinRecommendation.test.ts`
Expected: FAIL with "Cannot find module './pinRecommendation'".

- [ ] **Step 4: Implement `recommendPin`**

Create `src/lib/pinRecommendation.ts`:

```ts
import type { PinMap } from "@/types";

/**
 * Pick a pin to default a new/edited control to: prefers an interrupt-capable
 * free pin when requested (encoders), otherwise the first free pin in
 * PinMap.free order. Returns null when there's no board selected yet (no
 * PinMap) or no free pins left.
 */
export function recommendPin(
  pinMap: PinMap | undefined,
  opts: { interruptCapable?: boolean } = {},
): string | null {
  if (!pinMap || pinMap.free.length === 0) return null;
  if (opts.interruptCapable) {
    const interrupt = pinMap.free.find((p) => p.interruptCapable);
    if (interrupt) return interrupt.pin;
  }
  return pinMap.free[0].pin;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/pinRecommendation.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Run the full test command to confirm nothing else broke**

Run: `npm run test`
Expected: PASS — this now runs both `tests/engine/**/*.test.ts` and `src/**/*.test.ts` per the config change.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/pinRecommendation.ts src/lib/pinRecommendation.test.ts
git commit -m "Add recommendPin helper for control creation/editing"
```

---

### Task 6: `upsertControl` refreshes the pin map of a control's *previous* board too

**Files:**
- Modify: `src/store/index.ts:164-175` (`upsertControl`)

**Interfaces:**
- Consumes: `get().refreshPinMap(boardId: string): Promise<void>` (existing).
- Produces: no signature change to `upsertControl`; behavior only.

**Why this task exists:** once controls can be edited (Task 8+), a control's `boardId` can change. `upsertControl` currently only refreshes the *new* board's pin map — the *old* board's map would keep showing a pin as used after the control moved off it, until something else happens to refresh it. This is a one-line-of-logic fix best done now, before any UI depends on it.

- [ ] **Step 1: Write the failing test**

There's no existing renderer store test file. Since this is a Zustand store (needs a DOM-ish/React-free unit test, and the store imports `@/lib/api` which wraps `window.api` — not available under Node), covering this via a full unit test would require mocking `window.api`, which is more machinery than the fix warrants. Instead, this will be verified by an e2e test in Task 12 ("editing a control's board frees the old board's pin"), and by manual reasoning here. Skip to Step 2.

- [ ] **Step 2: Implement the fix**

In `src/store/index.ts`, change:

```ts
  upsertControl: async (control) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.controlUpsert(project, control);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
      await get().refreshPinMap(control.boardId);
    } catch (e) {
      set({ error: String(e) });
    }
  },
```

to:

```ts
  upsertControl: async (control) => {
    const { project } = get();
    if (!project) return;
    const previous = project.controls.find((c) => c.id === control.id);
    try {
      const updated = await api.controlUpsert(project, control);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
      if (control.boardId) await get().refreshPinMap(control.boardId);
      if (previous?.boardId && previous.boardId !== control.boardId) {
        await get().refreshPinMap(previous.boardId);
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full e2e suite as a smoke check**

Run: `npx playwright test`
Expected: PASS (this change is additive/defensive; no existing test exercises editing a control yet, so nothing should behave differently today).

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "Refresh previous board's pin map when a control's board changes"
```

---

### Task 7: `ControlForm` component (all five control kinds)

**Files:**
- Create: `src/views/controls/SelectorPositionsEditor.tsx`
- Create: `src/views/controls/ControlForm.tsx`

**Interfaces:**
- Produces:
  - `SelectorPositionsEditor(props: { positions: SelectorPosition[]; onChange: (positions: SelectorPosition[]) => void }): JSX.Element`
  - `ControlForm(props: ControlFormProps): JSX.Element` where
    ```ts
    export interface ControlFormProps {
      project: Project;
      panelId: string;
      initial: Control | null; // null = creating a new control
      onSave: (control: Control) => void;
      onCancel: () => void;
    }
    ```
- Consumes: `useProjectStore` (`pinMaps: Record<string, PinMap>` — for the board dropdown's per-board free-pin list), `recommendPin` (Task 5), types from `@/types`.

This is a single larger task because a form that only supports 3 of 5 control kinds isn't an independently shippable/testable deliverable — the "Kind" dropdown would let you pick e.g. "encoder" and produce nothing.

- [ ] **Step 1: Create `SelectorPositionsEditor.tsx`**

```tsx
import type { PinRef, SelectorOp, SelectorPosition } from "@/types";

interface Props {
  positions: SelectorPosition[];
  onChange: (positions: SelectorPosition[]) => void;
}

export default function SelectorPositionsEditor({ positions, onChange }: Props) {
  const updatePosition = (index: number, next: SelectorPosition) => {
    onChange(positions.map((p, i) => (i === index ? next : p)));
  };

  const addPosition = () => {
    onChange([...positions, { label: `Position ${positions.length + 1}`, pins: [], op: null }]);
  };

  const removePosition = (index: number) => {
    onChange(positions.filter((_, i) => i !== index));
  };

  const addPin = (index: number) => {
    const pos = positions[index];
    updatePosition(index, { ...pos, pins: [...pos.pins, { pin: "D0", inverted: false }] });
  };

  const updatePin = (posIndex: number, pinIndex: number, next: PinRef) => {
    const pos = positions[posIndex];
    updatePosition(posIndex, {
      ...pos,
      pins: pos.pins.map((p, i) => (i === pinIndex ? next : p)),
    });
  };

  const removePin = (posIndex: number, pinIndex: number) => {
    const pos = positions[posIndex];
    updatePosition(posIndex, { ...pos, pins: pos.pins.filter((_, i) => i !== pinIndex) });
  };

  return (
    <div className="space-y-2">
      {positions.map((pos, posIndex) => (
        <div key={posIndex} className="border border-[#30363d] rounded p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              value={pos.label}
              onChange={(e) => updatePosition(posIndex, { ...pos, label: e.target.value })}
              placeholder="Position label"
              className="flex-1 text-xs bg-[#0d1117] border border-[#30363d] rounded px-2 py-1"
            />
            <button
              type="button"
              onClick={() => removePosition(posIndex)}
              className="text-xs text-[#f85149] px-1.5"
              aria-label={`Remove position ${pos.label}`}
            >
              ✕
            </button>
          </div>
          {pos.pins.map((pinRef, pinIndex) => (
            <div key={pinIndex} className="flex items-center gap-2 pl-2">
              <input
                value={pinRef.pin}
                onChange={(e) => updatePin(posIndex, pinIndex, { ...pinRef, pin: e.target.value })}
                placeholder="Pin (e.g. D5)"
                className="w-20 text-xs font-mono bg-[#0d1117] border border-[#30363d] rounded px-2 py-1"
              />
              <label className="text-xs text-[#8b949e] flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={pinRef.inverted}
                  onChange={(e) => updatePin(posIndex, pinIndex, { ...pinRef, inverted: e.target.checked })}
                />
                inverted
              </label>
              <button
                type="button"
                onClick={() => removePin(posIndex, pinIndex)}
                className="text-xs text-[#f85149]"
                aria-label="Remove pin"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addPin(posIndex)} className="text-xs text-[#58a6ff] pl-2">
            + Add pin
          </button>
          {pos.pins.length > 1 && (
            <label className="text-xs text-[#8b949e] flex items-center gap-2 pl-2">
              Combine with:
              <select
                value={pos.op ?? ""}
                onChange={(e) =>
                  updatePosition(posIndex, { ...pos, op: (e.target.value || null) as SelectorOp | null })
                }
                className="text-xs bg-[#0d1117] border border-[#30363d] rounded px-1 py-0.5"
              >
                <option value="">— choose —</option>
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            </label>
          )}
        </div>
      ))}
      <button type="button" onClick={addPosition} className="text-xs text-[#58a6ff]">
        + Add position
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `ControlForm.tsx`**

```tsx
import { useState } from "react";
import { useProjectStore } from "@/store";
import { recommendPin } from "@/lib/pinRecommendation";
import type {
  Control,
  ControlKind,
  EncoderMode,
  JoystickAxis,
  Project,
  SelectorPosition,
} from "@/types";
import SelectorPositionsEditor from "./SelectorPositionsEditor";

export interface ControlFormProps {
  project: Project;
  panelId: string;
  initial: Control | null;
  onSave: (control: Control) => void;
  onCancel: () => void;
}

const AXES: JoystickAxis[] = ["X", "Y", "Z", "Rx", "Ry", "Rz", "Slider1", "Slider2"];

type Draft = {
  id: string;
  kind: ControlKind;
  label: string;
  notes: string;
  boardId: string; // "" = unassigned
  pin: string;
  inverted: boolean;
  onLabel: string;
  offLabel: string;
  pinA: string;
  pinB: string;
  countsPerDetent: 1 | 2 | 4;
  mode: EncoderMode;
  buttonCwLabel: string;
  buttonCcwLabel: string;
  pressesPerDetent: number;
  axis: JoystickAxis;
  deltaPerStep: number;
  analogPin: string;
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  invert: boolean;
  positions: SelectorPosition[];
};

function initDraft(initial: Control | null): Draft {
  const base: Draft = {
    id: initial?.id ?? crypto.randomUUID(),
    kind: initial?.kind ?? "button",
    label: initial?.label ?? "",
    notes: initial?.notes ?? "",
    boardId: initial?.boardId ?? "",
    pin: "",
    inverted: false,
    onLabel: "On",
    offLabel: "Off",
    pinA: "",
    pinB: "",
    countsPerDetent: 4,
    mode: "buttons",
    buttonCwLabel: "",
    buttonCcwLabel: "",
    pressesPerDetent: 1,
    axis: "X",
    deltaPerStep: 1,
    analogPin: "",
    inMin: 0,
    inMax: 1023,
    outMin: 0,
    outMax: 1023,
    invert: false,
    positions: [],
  };
  if (!initial) return base;
  switch (initial.kind) {
    case "button":
      return { ...base, pin: initial.pin?.pin ?? "", inverted: initial.pin?.inverted ?? false };
    case "switch":
      return {
        ...base,
        pin: initial.pin?.pin ?? "",
        inverted: initial.pin?.inverted ?? false,
        onLabel: initial.onLabel,
        offLabel: initial.offLabel,
      };
    case "selector":
      return { ...base, positions: initial.positions };
    case "encoder":
      return {
        ...base,
        pinA: initial.encoder?.pinA ?? "",
        pinB: initial.encoder?.pinB ?? "",
        countsPerDetent: initial.encoder?.countsPerDetent ?? 4,
        mode: initial.encoder?.mode ?? "buttons",
        buttonCwLabel: initial.encoder?.buttonCw?.label ?? "",
        buttonCcwLabel: initial.encoder?.buttonCcw?.label ?? "",
        pressesPerDetent: initial.encoder?.pressesPerDetent ?? 1,
        axis: initial.encoder?.axis ?? "X",
        deltaPerStep: initial.encoder?.deltaPerStep ?? 1,
      };
    case "analog":
      return {
        ...base,
        analogPin: initial.analog?.pin ?? "",
        axis: initial.analog?.axis ?? "X",
        inMin: initial.analog?.inMin ?? 0,
        inMax: initial.analog?.inMax ?? 1023,
        outMin: initial.analog?.outMin ?? 0,
        outMax: initial.analog?.outMax ?? 1023,
        invert: initial.analog?.invert ?? false,
      };
  }
}

function buildControl(draft: Draft, panelId: string): Control {
  const base = {
    id: draft.id,
    panelId,
    boardId: draft.boardId || undefined,
    label: draft.label,
    notes: draft.notes || undefined,
  };
  switch (draft.kind) {
    case "button":
      return {
        ...base,
        kind: "button",
        pin: draft.pin ? { pin: draft.pin, inverted: draft.inverted } : undefined,
      };
    case "switch":
      return {
        ...base,
        kind: "switch",
        pin: draft.pin ? { pin: draft.pin, inverted: draft.inverted } : undefined,
        onLabel: draft.onLabel,
        offLabel: draft.offLabel,
      };
    case "selector":
      return { ...base, kind: "selector", positions: draft.positions };
    case "encoder":
      return {
        ...base,
        kind: "encoder",
        encoder:
          draft.pinA && draft.pinB
            ? {
                pinA: draft.pinA,
                pinB: draft.pinB,
                countsPerDetent: draft.countsPerDetent,
                mode: draft.mode,
                buttonCw: draft.mode === "buttons" ? { label: draft.buttonCwLabel } : undefined,
                buttonCcw: draft.mode === "buttons" ? { label: draft.buttonCcwLabel } : undefined,
                pressesPerDetent: draft.mode === "buttons" ? draft.pressesPerDetent : undefined,
                axis: draft.mode === "axis" ? draft.axis : undefined,
                deltaPerStep: draft.mode === "axis" ? draft.deltaPerStep : undefined,
              }
            : undefined,
      };
    case "analog":
      return {
        ...base,
        kind: "analog",
        analog: draft.analogPin
          ? {
              pin: draft.analogPin,
              axis: draft.axis,
              inMin: draft.inMin,
              inMax: draft.inMax,
              outMin: draft.outMin,
              outMax: draft.outMax,
              invert: draft.invert,
            }
          : undefined,
      };
  }
}

export default function ControlForm({ project, panelId, initial, onSave, onCancel }: ControlFormProps) {
  const pinMaps = useProjectStore((s) => s.pinMaps);
  const [draft, setDraft] = useState<Draft>(() => initDraft(initial));

  const pinMap = draft.boardId ? pinMaps[draft.boardId] : undefined;

  const setKind = (kind: ControlKind) => {
    setDraft((d) => {
      const next = { ...d, kind };
      if (kind === "button" || kind === "switch") {
        next.pin = next.pin || recommendPin(pinMap) || "";
      } else if (kind === "encoder" && !next.pinA) {
        next.pinA = recommendPin(pinMap, { interruptCapable: true }) || "";
      } else if (kind === "analog" && !next.analogPin) {
        next.analogPin = recommendPin(pinMap) || "";
      }
      return next;
    });
  };

  const setBoardId = (boardId: string) => {
    const map = boardId ? pinMaps[boardId] : undefined;
    setDraft((d) => {
      const next = { ...d, boardId };
      if (d.kind === "button" || d.kind === "switch") next.pin = recommendPin(map) || "";
      if (d.kind === "encoder") next.pinA = recommendPin(map, { interruptCapable: true }) || "";
      if (d.kind === "analog") next.analogPin = recommendPin(map) || "";
      return next;
    });
  };

  const freePinOptions = (currentValue: string) => {
    const options = pinMap?.free.map((f) => f.pin) ?? [];
    return currentValue && !options.includes(currentValue) ? [currentValue, ...options] : options;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(buildControl(draft, panelId));
      }}
      className="p-3 space-y-2 bg-[#0d1117] border border-[#30363d] rounded"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[#8b949e]">
          Kind
          <select
            value={draft.kind}
            onChange={(e) => setKind(e.target.value as ControlKind)}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            <option value="button">Button</option>
            <option value="switch">Switch</option>
            <option value="selector">Selector</option>
            <option value="encoder">Encoder</option>
            <option value="analog">Analog</option>
          </select>
        </label>
        <label className="text-xs text-[#8b949e]">
          Label
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          />
        </label>
        <label className="text-xs text-[#8b949e]">
          Board
          <select
            value={draft.boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            <option value="">— Unassigned —</option>
            {project.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(draft.kind === "button" || draft.kind === "switch") && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            Pin
            <select
              value={draft.pin}
              onChange={(e) => setDraft((d) => ({ ...d, pin: e.target.value }))}
              disabled={!draft.boardId}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="">— none —</option>
              {freePinOptions(draft.pin).map((pin) => (
                <option key={pin} value={pin}>
                  {pin}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#8b949e] flex items-end gap-1 pb-1.5">
            <input
              type="checkbox"
              checked={draft.inverted}
              onChange={(e) => setDraft((d) => ({ ...d, inverted: e.target.checked }))}
            />
            Inverted (wired NC)
          </label>
        </div>
      )}

      {draft.kind === "switch" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            On label
            <input
              value={draft.onLabel}
              onChange={(e) => setDraft((d) => ({ ...d, onLabel: e.target.value }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            />
          </label>
          <label className="text-xs text-[#8b949e]">
            Off label
            <input
              value={draft.offLabel}
              onChange={(e) => setDraft((d) => ({ ...d, offLabel: e.target.value }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            />
          </label>
        </div>
      )}

      {draft.kind === "selector" && (
        <SelectorPositionsEditor
          positions={draft.positions}
          onChange={(positions) => setDraft((d) => ({ ...d, positions }))}
        />
      )}

      {draft.kind === "encoder" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[#8b949e]">
              Pin A (recommended interrupt-capable)
              <select
                value={draft.pinA}
                onChange={(e) => setDraft((d) => ({ ...d, pinA: e.target.value }))}
                disabled={!draft.boardId}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                <option value="">— none —</option>
                {freePinOptions(draft.pinA).map((pin) => (
                  <option key={pin} value={pin}>
                    {pin}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#8b949e]">
              Pin B
              <select
                value={draft.pinB}
                onChange={(e) => setDraft((d) => ({ ...d, pinB: e.target.value }))}
                disabled={!draft.boardId}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                <option value="">— none —</option>
                {freePinOptions(draft.pinB).map((pin) => (
                  <option key={pin} value={pin}>
                    {pin}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-[#8b949e]">
            Mode
            <select
              value={draft.mode}
              onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value as EncoderMode }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="buttons">Buttons</option>
              <option value="axis">Axis</option>
            </select>
          </label>
          {draft.mode === "buttons" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-[#8b949e]">
                CW button label
                <input
                  value={draft.buttonCwLabel}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonCwLabel: e.target.value }))}
                  className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
                />
              </label>
              <label className="text-xs text-[#8b949e]">
                CCW button label
                <input
                  value={draft.buttonCcwLabel}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonCcwLabel: e.target.value }))}
                  className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
                />
              </label>
            </div>
          ) : (
            <label className="text-xs text-[#8b949e]">
              Axis
              <select
                value={draft.axis}
                onChange={(e) => setDraft((d) => ({ ...d, axis: e.target.value as JoystickAxis }))}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                {AXES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {draft.kind === "analog" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            Pin
            <select
              value={draft.analogPin}
              onChange={(e) => setDraft((d) => ({ ...d, analogPin: e.target.value }))}
              disabled={!draft.boardId}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="">— none —</option>
              {freePinOptions(draft.analogPin).map((pin) => (
                <option key={pin} value={pin}>
                  {pin}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#8b949e]">
            Axis
            <select
              value={draft.axis}
              onChange={(e) => setDraft((d) => ({ ...d, axis: e.target.value as JoystickAxis }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              {AXES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1 text-xs rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white font-medium"
        >
          Save
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. `ControlForm.tsx` is not yet wired into `ControlsView.tsx`, so this only checks the new files compile standalone.

- [ ] **Step 4: Commit**

```bash
git add src/views/controls/ControlForm.tsx src/views/controls/SelectorPositionsEditor.tsx
git commit -m "Add ControlForm component for all five control kinds"
```

(This task has no runnable behavior until Task 8 wires it in — e2e coverage lands in Task 12.)

---

### Task 8: Wire control add/edit/delete into `ControlsView.tsx`

**Files:**
- Modify: `src/views/controls/columns.tsx` (add an actions column)
- Modify: `src/views/ControlsView.tsx`

**Interfaces:**
- Consumes: `ControlForm` (Task 7), `useProjectStore().upsertControl/deleteControl` (existing).
- Produces: no new exports — this is the integration point.

- [ ] **Step 1: Add an Actions column to `columns.tsx`**

In `src/views/controls/columns.tsx`, change the `ControlRow` type and add a display column plumbed with callbacks via `meta` (TanStack Table's per-table `meta` object is the standard way to pass callbacks into column defs without prop-drilling through every cell):

Change the top of the file:

```ts
import { createColumnHelper } from "@tanstack/react-table";
import type { Control, Board, Panel } from "@/types";

export type ControlRow = {
  control: Control;
  panel: Panel | undefined;
  board: Board | undefined;
};

const helper = createColumnHelper<ControlRow>();
```

to:

```ts
import { createColumnHelper } from "@tanstack/react-table";
import type { Control, Board, Panel } from "@/types";

export type ControlRow = {
  control: Control;
  panel: Panel | undefined;
  board: Board | undefined;
};

export interface ControlsTableMeta {
  onEdit: (controlId: string) => void;
  onDelete: (control: Control) => void;
}

const helper = createColumnHelper<ControlRow>();
```

Then, right before the closing `];` of the exported `columns` array (after the `notes` column, before `];`), add a new column:

```ts
  helper.display({
    id: "actions",
    header: "",
    size: 90,
    cell: (info) => {
      const meta = info.table.options.meta as ControlsTableMeta | undefined;
      const control = info.row.original.control;
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => meta?.onEdit(control.id)}
            className="text-xs text-[#58a6ff] hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => meta?.onDelete(control)}
            className="text-xs text-[#f85149] hover:underline"
          >
            Delete
          </button>
        </div>
      );
    },
  }),
```

- [ ] **Step 2: Rewrite `ControlsView.tsx`'s render body to support add/edit and the Panels strip**

Replace the entire file with:

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type GroupingState,
  type ExpandedState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useProjectStore } from "@/store";
import { columns, type ControlRow, type ControlsTableMeta } from "./controls/columns";
import ControlForm from "./controls/ControlForm";
import type { Control, Panel } from "@/types";

export default function ControlsView() {
  const { project, validationReport, upsertControl, deleteControl, upsertPanel, deletePanel } =
    useProjectStore();
  const [grouping] = useState<GroupingState>(["panel"]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [editingControlId, setEditingControlId] = useState<string | null>(null);
  const [addingToPanelId, setAddingToPanelId] = useState<string | null>(null);
  const [renamingPanelId, setRenamingPanelId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // All hooks must run unconditionally (Rules of Hooks). When there's no
  // project the table is built over an empty row set, then we bail out below.
  const rows: ControlRow[] = useMemo(
    () =>
      project
        ? project.controls.map((control) => ({
            control,
            panel: project.panels.find((p) => p.id === control.panelId),
            board: project.boards.find((b) => b.id === control.boardId),
          }))
        : [],
    [project],
  );

  const meta: ControlsTableMeta = {
    onEdit: (controlId) => {
      setAddingToPanelId(null);
      setEditingControlId(controlId);
    },
    onDelete: (control) => {
      if (window.confirm(`Delete control "${control.label}"?`)) {
        deleteControl(control.id);
      }
    },
  };

  const table = useReactTable({
    data: rows,
    columns,
    state: { grouping, expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    meta,
  });

  if (!project) {
    return <EmptyState />;
  }

  const errorCount = validationReport?.errors.length ?? 0;
  const warnCount = validationReport?.warnings.length ?? 0;

  const addPanel = () => {
    const order = project.panels.length === 0 ? 0 : Math.max(...project.panels.map((p) => p.order)) + 1;
    const panel: Panel = { id: crypto.randomUUID(), name: "Untitled Panel", order };
    upsertPanel(panel);
  };

  const startRenamingPanel = (panel: Panel) => {
    setRenamingPanelId(panel.id);
    setRenameDraft(panel.name);
  };

  const commitRenamePanel = (panel: Panel) => {
    if (renameDraft.trim()) upsertPanel({ ...panel, name: renameDraft.trim() });
    setRenamingPanelId(null);
  };

  const deletePanelWithConfirm = (panel: Panel) => {
    const count = project.controls.filter((c) => c.panelId === panel.id).length;
    const message =
      count > 0
        ? `Delete panel "${panel.name}"? This will also delete ${count} control${count === 1 ? "" : "s"}.`
        : `Delete panel "${panel.name}"?`;
    if (window.confirm(message)) deletePanel(panel.id);
  };

  const handleSaveControl = (control: Control) => {
    upsertControl(control);
    setEditingControlId(null);
    setAddingToPanelId(null);
  };

  // Build the table body as a flat list of <tr>s, interleaving the edit form
  // (for the row currently being edited) and the "add control" row (at the
  // end of the panel group currently adding one) alongside the grouped rows
  // TanStack Table already produces. This state (editingControlId /
  // addingToPanelId) is intentionally separate from the table's own
  // `expanded` state above.
  const bodyRows: React.ReactNode[] = [];
  for (const row of table.getRowModel().rows) {
    if (row.getIsGrouped()) {
      const panel = project.panels.find((p) => p.name === String(row.getValue("panel")));
      const panelName = String(row.getValue("panel"));
      const childCount = row.subRows.length;
      bodyRows.push(
        <tr
          key={row.id}
          className="bg-[#1c2333] border-y border-[#30363d] cursor-pointer hover:bg-[#21262d]"
          onClick={() => row.toggleExpanded()}
        >
          <td colSpan={columns.length} className="px-3 py-2">
            <span className="text-xs mr-2 text-[#484f58]">{row.getIsExpanded() ? "▼" : "▶"}</span>
            <span className="font-semibold text-[#e6edf3]">{panelName}</span>
            <span className="ml-2 text-xs text-[#484f58]">
              {childCount} control{childCount !== 1 ? "s" : ""}
            </span>
          </td>
        </tr>,
      );
      if (row.getIsExpanded() && panel) {
        bodyRows.push(
          <tr key={`${row.id}-add`} className="bg-[#0d1117]">
            <td colSpan={columns.length} className="px-3 py-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingControlId(null);
                  setAddingToPanelId(panel.id);
                }}
                className="text-xs text-[#58a6ff] hover:underline"
              >
                + Add control to this panel
              </button>
            </td>
          </tr>,
        );
        if (addingToPanelId === panel.id) {
          bodyRows.push(
            <tr key={`${row.id}-form`}>
              <td colSpan={columns.length} className="px-3 py-2">
                <ControlForm
                  project={project}
                  panelId={panel.id}
                  initial={null}
                  onSave={handleSaveControl}
                  onCancel={() => setAddingToPanelId(null)}
                />
              </td>
            </tr>,
          );
        }
      }
      continue;
    }

    bodyRows.push(
      <tr key={row.id} className="border-b border-[#21262d] hover:bg-[#161b22] transition-colors">
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id} style={{ width: cell.column.getSize() }} className="px-3 py-2">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>,
    );
    if (editingControlId === row.original.control.id) {
      bodyRows.push(
        <tr key={`${row.id}-form`}>
          <td colSpan={columns.length} className="px-3 py-2">
            <ControlForm
              project={project}
              panelId={row.original.control.panelId}
              initial={row.original.control}
              onSave={handleSaveControl}
              onCancel={() => setEditingControlId(null)}
            />
          </td>
        </tr>,
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22] shrink-0">
        <span className="text-sm font-medium">
          {project.controls.length} control{project.controls.length !== 1 ? "s" : ""}
        </span>
        {errorCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-[#3d1a1a] text-[#f85149]">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        {warnCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-[#2d2000] text-[#d29922]">
            {warnCount} warning{warnCount !== 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={addPanel}
            className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
          >
            + Add Panel
          </button>
        </div>
      </div>

      {/* Panels strip — always shows every panel, even ones with no controls yet */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#30363d] bg-[#0d1117] shrink-0 flex-wrap">
        {project.panels.map((panel) => (
          <div
            key={panel.id}
            className="flex items-center gap-1.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            {renamingPanelId === panel.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRenamePanel(panel)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRenamePanel(panel);
                  if (e.key === "Escape") setRenamingPanelId(null);
                }}
                className="bg-[#0d1117] border border-[#30363d] rounded px-1 text-xs w-28"
              />
            ) : (
              <span className="cursor-pointer" onClick={() => startRenamingPanel(panel)}>
                {panel.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => deletePanelWithConfirm(panel)}
              aria-label={`Delete panel ${panel.name}`}
              className="text-[#f85149]"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#161b22] border-b border-[#30363d]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>{bodyRows}</tbody>
        </table>

        {project.controls.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-[#484f58]">
            <p className="text-lg mb-2">No controls yet.</p>
            <p className="text-sm">Use "+ Add Panel" above, then expand it to add a control.</p>
          </div>
        )}
      </div>

      {/* Validation summary */}
      {validationReport && (errorCount > 0 || warnCount > 0) && (
        <div className="border-t border-[#30363d] bg-[#161b22] px-4 py-2 shrink-0 max-h-32 overflow-y-auto">
          {validationReport.errors.map((e, i) => (
            <div key={i} className="text-xs text-[#f85149] py-0.5">
              ✕ {formatError(e)}
            </div>
          ))}
          {validationReport.warnings.map((w, i) => (
            <div key={i} className="text-xs text-[#d29922] py-0.5">
              ⚠ {formatWarning(w)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const { newProject, openProject } = useProjectStore();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#8b949e]">
      <div className="text-5xl mb-2">🎛</div>
      <p className="text-xl font-semibold text-[#e6edf3]">Sim Panel Manager</p>
      <p className="text-sm">Create or open a project to get started.</p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => newProject("New Project")}
          className="px-4 py-2 rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm font-medium transition-colors"
        >
          New Project
        </button>
        <button
          onClick={() => openProject()}
          className="px-4 py-2 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm transition-colors"
        >
          Open .spm File
        </button>
      </div>
    </div>
  );
}

function formatError(e: { kind: string; [k: string]: unknown }): string {
  switch (e.kind) {
    case "PinDoubleBooked":
      return `Pin ${e.pin} on board ${e.boardId} is used by multiple controls`;
    case "MissingBoardRef":
      return `Control ${e.controlId} references unknown board ${e.boardId}`;
    case "MissingPanelRef":
      return `Control ${e.controlId} references unknown panel ${e.panelId}`;
    case "AnalogPinNotCapable":
      return `Control ${e.controlId}: pin ${e.pin} is not analog-capable`;
    case "SelectorNoPins":
      return `Selector ${e.controlId}, position "${e.positionLabel}": no pins configured`;
    default:
      return JSON.stringify(e);
  }
}

function formatWarning(w: { kind: string; [k: string]: unknown }): string {
  switch (w.kind) {
    case "SerialPinUsed":
      return `Control ${w.controlId} uses Serial pin ${w.pin} — may conflict with USB`;
    case "EncoderOnNonInterruptPin":
      return `Encoder ${w.controlId}: pin ${w.pin} is not interrupt-capable (falling back to polling)`;
    case "ControlUnassigned":
      return `Control ${w.controlId} has no board/pin assigned yet`;
    default:
      return JSON.stringify(w);
  }
}
```

Note this removes the old toolbar hint text ("Grid editing coming soon…") since it's no longer true, and removes the now-unnecessary `columns.length` reference bug potential by keeping it (used correctly for `colSpan`).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any TS errors that come up around `React.ReactNode[]` (add `import type { ReactNode } from "react";` and use `ReactNode[]` instead of `React.ReactNode[]` if the bare `React` namespace isn't imported — since this file only imports named exports from `"react"`, use `ReactNode[]` directly with that import added).

- [ ] **Step 4: Run the existing e2e suite to check nothing existing broke**

Run: `npx playwright test`
Expected: Likely some failures — the toolbar hint text test (`"toolbar hint text mentions Boards tab"` in `tests/e2e/controls-view.spec.ts`) will now fail since that text was removed. Update that test in this step: change its assertion from checking for the old hint text to checking for the new "+ Add Panel" button:

In `tests/e2e/controls-view.spec.ts`, change:

```ts
test("toolbar hint text mentions Boards tab", async ({ page, openProject }) => {
  await openF5e(page, openProject);
  await expect(page.getByText("Grid editing coming soon")).toBeVisible();
});
```

(or the equivalent test using `New Project` per the file's actual content) to assert on the add-panel affordance instead:

```ts
test("toolbar shows an Add Panel button", async ({ page }) => {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("button", { name: "+ Add Panel" })).toBeVisible();
});
```

Also update the empty-state message assertion if it referenced the old wording (`"Add controls via the project file or the editor (coming soon)."` in the very first `EmptyState`-adjacent no-controls block was already changed above to `'Use "+ Add Panel" above, then expand it to add a control.'` in Step 2's rewrite — search `tests/e2e/` for the old string and update any assertion that expects it).

Run: `grep -rn "coming soon\|Add controls via the project file" tests/e2e/` to find every place that needs updating, and fix each the same way (assert on the new, real UI instead of the old placeholder text).

- [ ] **Step 5: Re-run the full e2e suite until green**

Run: `npx playwright test`
Expected: PASS (all specs, including the ones just updated).

- [ ] **Step 6: Commit**

```bash
git add src/views/controls/columns.tsx src/views/ControlsView.tsx tests/e2e/controls-view.spec.ts
git commit -m "Wire panel/control add-edit-delete into ControlsView"
```

---

### Task 9: Add/rename/delete boards in `BoardsView.tsx`

**Files:**
- Modify: `src/views/BoardsView.tsx`

**Interfaces:**
- Consumes: `useProjectStore().upsertBoard/deleteBoard/allocateIdentity` (existing).

- [ ] **Step 1: Rewrite `BoardsView.tsx`**

Replace the file with:

```tsx
import { useState } from "react";
import { useProjectStore } from "@/store";
import type { Board, BoardType } from "@/types";
import PinMapDisplay from "./boards/PinMapDisplay";

const BOARD_TYPES: { value: BoardType; label: string }[] = [
  { value: "leonardo", label: "Leonardo" },
  { value: "micro", label: "Micro" },
  { value: "pro_micro", label: "Pro Micro" },
];

export default function BoardsView() {
  const { project, pinMaps, upsertBoard, deleteBoard, allocateIdentity, refreshPinMap } =
    useProjectStore();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[#484f58]">
        No project open
      </div>
    );
  }

  const selectedBoard = project.boards.find((b) => b.id === selectedBoardId);
  const pinMap = selectedBoardId ? pinMaps[selectedBoardId] : null;

  const addBoard = async () => {
    const id = crypto.randomUUID();
    const name = `Board ${project.boards.length + 1}`;
    const board: Board = {
      id,
      name,
      type: "leonardo",
      identity: { usbProduct: name, usbVid: 0x1209, usbPid: 1 },
    };
    await upsertBoard(board);
    await allocateIdentity(id);
    setSelectedBoardId(id);
    await refreshPinMap(id);
  };

  const startRenaming = (board: Board) => {
    setRenamingBoardId(board.id);
    setRenameDraft(board.name);
  };

  const commitRename = (board: Board) => {
    if (renameDraft.trim()) upsertBoard({ ...board, name: renameDraft.trim() });
    setRenamingBoardId(null);
  };

  const deleteWithConfirm = (board: Board) => {
    const count = project.controls.filter((c) => c.boardId === board.id).length;
    const message =
      count > 0
        ? `Delete board "${board.name}"? ${count} control${count === 1 ? "" : "s"} will become unassigned (their pin assignments will be cleared).`
        : `Delete board "${board.name}"?`;
    if (window.confirm(message)) {
      deleteBoard(board.id);
      if (selectedBoardId === board.id) setSelectedBoardId(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Board list */}
      <aside className="w-72 border-r border-[#30363d] bg-[#161b22] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <span className="text-sm font-semibold">Boards</span>
          <span className="text-xs text-[#484f58]">{project.boards.length} total</span>
        </div>
        <div className="px-4 py-2 border-b border-[#30363d]">
          <button
            type="button"
            onClick={addBoard}
            className="w-full text-xs px-2 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
          >
            + Add Board
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {project.boards.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#484f58] text-sm">
              No boards in project
            </div>
          ) : (
            project.boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                selected={board.id === selectedBoardId}
                renaming={renamingBoardId === board.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onSelect={() => {
                  setSelectedBoardId(board.id);
                  refreshPinMap(board.id);
                }}
                onStartRename={() => startRenaming(board)}
                onCommitRename={() => commitRename(board)}
                onCancelRename={() => setRenamingBoardId(null)}
                onDelete={() => deleteWithConfirm(board)}
                onAllocateIdentity={() => allocateIdentity(board.id)}
                boardTypeLabel={BOARD_TYPES.find((t) => t.value === board.type)?.label ?? board.type}
              />
            ))
          )}
        </div>
      </aside>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedBoard && pinMap ? (
          <PinMapDisplay board={selectedBoard} pinMap={pinMap} />
        ) : selectedBoard ? (
          <div className="text-[#484f58] text-sm">Loading pin map…</div>
        ) : (
          <div className="flex items-center justify-center h-full text-[#484f58]">
            Select a board to view its pin map
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCard({
  board,
  selected,
  renaming,
  renameDraft,
  onRenameDraftChange,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onAllocateIdentity,
  boardTypeLabel,
}: {
  board: Board;
  selected: boolean;
  renaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onAllocateIdentity: () => void;
  boardTypeLabel: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`px-4 py-3 cursor-pointer border-b border-[#21262d] transition-colors ${
        selected ? "bg-[#1c2333] border-l-2 border-l-[#58a6ff]" : "hover:bg-[#1c2333]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className="text-sm font-medium bg-[#0d1117] border border-[#30363d] rounded px-1 w-full"
            />
          ) : (
            <div
              className="text-sm font-medium truncate"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
            >
              {board.name}
            </div>
          )}
          <div className="text-xs text-[#8b949e] mt-0.5">{boardTypeLabel}</div>
          <div className="text-xs text-[#58a6ff] font-mono mt-1">
            {board.identity.usbProduct}
          </div>
          <div className="text-xs text-[#484f58] font-mono">
            VID:{board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")}{" "}
            PID:{board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete board ${board.name}`}
          className="text-[#f85149] text-xs shrink-0"
        >
          ✕
        </button>
      </div>
      {board.identity.usbPid <= 0x000f && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAllocateIdentity();
          }}
          className="mt-2 text-xs px-2 py-1 rounded bg-[#1f3a5f] text-[#79c0ff] hover:bg-[#1f6feb] transition-colors"
          title="Allocate a permanent USB PID for this board"
        >
          Allocate Identity
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the existing e2e suite**

Run: `npx playwright test`
Expected: PASS — `tests/e2e/boards-view.spec.ts` exercises board selection/identity allocation, which are unchanged (only additive UI was added).

- [ ] **Step 4: Commit**

```bash
git add src/views/BoardsView.tsx
git commit -m "Wire board add-rename-delete into BoardsView"
```

---

### Task 10: e2e tests — panel CRUD

**Files:**
- Create: `tests/e2e/panels-editing.spec.ts`

- [ ] **Step 1: Write the tests**

Create `tests/e2e/panels-editing.spec.ts`:

```ts
import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
});

test("Add Panel creates a new panel chip", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  await expect(page.getByText("Untitled Panel")).toBeVisible();
});

test("clicking a panel chip name renames it inline", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  await page.getByText("Untitled Panel").click();
  const input = page.locator('input[value="Untitled Panel"]');
  await input.fill("Cockpit");
  await input.press("Enter");
  await expect(page.getByText("Cockpit", { exact: true })).toBeVisible();
  await expect(page.getByText("Untitled Panel")).not.toBeVisible();
});

test("deleting an empty panel needs no confirmation content about controls but still confirms", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Untitled Panel");
    dialog.accept();
  });
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  await expect(page.getByText("Untitled Panel")).not.toBeVisible();
});

test("canceling a panel delete confirmation keeps the panel", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Panel" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete panel Untitled Panel" }).click();
  await expect(page.getByText("Untitled Panel")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/panels-editing.spec.ts`
Expected: PASS (Tasks 8's `ControlsView.tsx` rewrite already implements all of this).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/panels-editing.spec.ts
git commit -m "Add e2e coverage for panel add/rename/delete"
```

---

### Task 11: e2e tests — board CRUD

**Files:**
- Create: `tests/e2e/boards-editing.spec.ts`

- [ ] **Step 1: Write the tests**

Create `tests/e2e/boards-editing.spec.ts`:

```ts
import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "Boards" }).click();
});

test("Add Board creates a new board card with an allocated identity", async ({ page }) => {
  // "New Project" already seeds one board ("Board 1"), so a second add is "Board 2".
  await page.getByRole("button", { name: "+ Add Board" }).click();
  await expect(page.getByText("Board 2", { exact: true })).toBeVisible();
});

test("renaming a board updates its name but keeps its identity", async ({ page }) => {
  await page.locator("text=Board 1").click();
  const input = page.locator('input[value="Board 1"]');
  await input.fill("Main Panel Board");
  await input.press("Enter");
  await expect(page.getByText("Main Panel Board", { exact: true })).toBeVisible();
});

test("deleting a board with no controls needs a confirmation and removes it", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add Board" }).click();
  await expect(page.getByText("Board 2", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete board Board 2" }).click();
  await expect(page.getByText("Board 2", { exact: true })).not.toBeVisible();
});

test("canceling a board delete confirmation keeps the board", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete board Board 1" }).click();
  await expect(page.getByText("Board 1", { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/boards-editing.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/boards-editing.spec.ts
git commit -m "Add e2e coverage for board add/rename/delete"
```

---

### Task 12: e2e tests — control CRUD, recommendation, and the full new-project journey

**Files:**
- Create: `tests/e2e/controls-editing.spec.ts`
- Create: `tests/e2e/project-editing-journey.spec.ts`

- [ ] **Step 1: Write `tests/e2e/controls-editing.spec.ts`**

```ts
import { test, expect } from "./helpers/mock-api.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await page.getByRole("button", { name: "+ Add Panel" }).click();
});

test("adding a control with a board selected pre-fills a recommended pin", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  await page.getByText("+ Add control to this panel").click();

  await page.getByLabel("Label").fill("Master Arm");
  await page.getByLabel("Board").selectOption({ label: "Board 1" });

  const pinSelect = page.getByLabel("Pin");
  await expect(pinSelect).not.toHaveValue("");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Master Arm")).toBeVisible();
  await expect(page.getByText("1 controls")).not.toBeVisible(); // sanity: toolbar pluralizes correctly
  await expect(page.getByText("1 control", { exact: true })).toBeVisible();
});

test("adding a control with no board yet leaves it unassigned with a warning", async ({ page, mock }) => {
  await mock.setValidate({
    errors: [],
    warnings: [{ kind: "ControlUnassigned", controlId: "will-not-match-but-fine" }],
  });

  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  await page.getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Future Switch");
  // Leave Board as "— Unassigned —" (default).
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Future Switch")).toBeVisible();
  await expect(page.getByText(/has no board\/pin assigned yet/)).toBeVisible();
});

test("editing a control changes its label", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  await page.getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Original Label");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Original Label")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Label").fill("Renamed Label");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Renamed Label")).toBeVisible();
  await expect(page.getByText("Original Label")).not.toBeVisible();
});

test("deleting a control needs confirmation and removes it", async ({ page }) => {
  const panelRow = page.locator("tr", { hasText: "Untitled Panel" }).first();
  await panelRow.click();
  await page.getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Disposable Button");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Disposable Button")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Disposable Button")).not.toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/controls-editing.spec.ts`
Expected: PASS. If `page.getByLabel("Label")`/`page.getByLabel("Board")`/`page.getByLabel("Pin")` don't resolve (Playwright's accessible-name matching for a `<label>` wrapping a nested `<select>`/`<input>` should work, since that's a standard implicit label association) — if any of these fail to locate, fall back to `page.locator('select, input').filter(...)` scoped near the visible text, but the implicit-label pattern used in `ControlForm.tsx` (Task 7) should resolve correctly first-try.

- [ ] **Step 3: Write `tests/e2e/project-editing-journey.spec.ts`**

```ts
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
  await page.getByText("Untitled Panel").click();
  const panelNameInput = page.locator('input[value="Untitled Panel"]');
  await panelNameInput.fill("Armament");
  await panelNameInput.press("Enter");
  await expect(page.getByText("Armament", { exact: true })).toBeVisible();

  // Add a second board (the new project already seeds "Board 1").
  await page.getByRole("button", { name: "Boards" }).click();
  await page.getByRole("button", { name: "+ Add Board" }).click();
  await expect(page.getByText("Board 2", { exact: true })).toBeVisible();

  // Back to Controls: add a control to the new panel, assigned to Board 1.
  await page.getByRole("button", { name: "Controls" }).click();
  const panelRow = page.locator("tr", { hasText: "Armament" }).first();
  await panelRow.click();
  await page.getByText("+ Add control to this panel").click();
  await page.getByLabel("Label").fill("Master Arm");
  await page.getByLabel("Board").selectOption({ label: "Board 1" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Master Arm")).toBeVisible();

  // Save the project.
  await page.getByRole("button", { name: "Save" }).click();
  expect(mock.saveCalls()).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/e2e/project-editing-journey.spec.ts`
Expected: PASS. Note the "Save" button name collides with the ControlForm's "Save" button while the form is open — the test explicitly clicks the ControlForm's Save first (closing the form), so by the time it clicks "Save" again for the project, only the title-bar Save button remains; if this is ambiguous in practice, scope the project-level Save click with `page.getByRole("banner").getByRole("button", { name: "Save" })` instead (check `src/components/TitleBar.tsx` for whether the title bar Save button is inside the `banner` landmark — it should be, since `project-save.spec.ts`'s existing tests already scope similarly).

- [ ] **Step 5: Run the entire test suite (engine, e2e, smoke, typecheck, lint) end to end**

Run:
```bash
npm run typecheck
npm run test
npx playwright test
npm run build
npm run test:smoke
npm run lint
```
Expected: PASS on every command. `npm run build` must succeed before `test:smoke` (it needs `dist/`/`dist-electron/`); `make build && make test-smoke` is the equivalent Makefile path if preferred.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/controls-editing.spec.ts tests/e2e/project-editing-journey.spec.ts
git commit -m "Add e2e coverage for control CRUD, pin recommendation, and the full new-project journey"
```

---

## Self-Review Notes (from writing this plan)

- **Spec coverage:** every "Goals" bullet in the spec has a task — full CRUD (Tasks 7-9), unassigned controls (Tasks 1, 3, 7), all five kinds (Task 7), pin recommendation (Tasks 2, 5, 7), reusing expand-in-place via separate local state (Task 8), confirmation dialogs (Tasks 8-9, tested in 10-11), `boardDelete` auto-unassign (Task 4). "Non-goals" are respected — no cell-by-cell spreadsheet editing, no Build view changes, no dedicated "assign pin to existing unassigned control from Boards tab" flow (editing the control itself, wired in Task 8, is how that's done, per the spec's stated non-goal).
- **Design refinement beyond the spec, made explicit here:** the spec's `ControlsView.tsx` section described renaming/deleting a panel from its group-row header. Investigating the actual render logic surfaced a gap the spec didn't account for: the grouped table only shows a panel once it has ≥1 control, so a newly-added empty panel would be invisible in that table. Task 8 instead adds a dedicated "Panels strip" (a chip list above the table, driven directly by `project.panels`, independent of which panels currently have controls) for add/rename/delete, and leaves the grouped-by-panel table's own rendering behavior (group-by-controls) unchanged. The "Panel" dropdown inside `ControlForm` (Task 7) also reads from `project.panels` directly, so an empty panel is selectable there from the moment it's created.
- **Type consistency check:** `ControlForm`'s `onSave: (control: Control) => void` (Task 7) matches `ControlsView.tsx`'s `handleSaveControl(control: Control)` (Task 8), which calls the store's `upsertControl` (existing signature, unchanged). `ControlsTableMeta` (Task 8, `columns.tsx`) fields (`onEdit`, `onDelete`) match exactly what `ControlsView.tsx`'s `meta` object provides. `recommendPin(pinMap, opts)` (Task 5) signature matches every call site in `ControlForm.tsx` (Task 7).
- **Placeholder scan:** no TBD/TODO in any step; every code block is complete, runnable code, not a description of code.
