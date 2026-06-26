# Sim Panel Manager — Technical Specification

**Status:** Build spec for implementation by a coding agent.
**Version:** 0.1 (2026-06-21)

This document is self-contained. It specifies a desktop application that lets a user
describe custom simulator control panels, assign their controls to Arduino boards and
pins, generate per-board firmware, give each board a stable USB identity, and upload it.

---

## 1. Goals & non-goals

**Goals (v1)**
- Describe **panels** (logical groupings) and their **controls**.
- Describe **boards** (Arduinos) and track **pin usage** per board.
- Assign each control to a board + pin(s), independent of its panel. Prevent double-booking; surface free pins.
- Generate, build, and upload firmware **per board** from the model. No hand-written code.
- Give each board a **permanent, unique USB identity** so the sim never confuses them.
- Excel-like, row/column editing as the primary UI.

**Non-goals (v1)** — design data model so these slot in later, but do not build:
- 2D graphical panel layout (store `x`/`y`/visual metadata fields now; no canvas UI yet).
- Driving LEDs/displays from sim telemetry (panels are VR-side / bare).
- Writing or repairing DCS binding files. The user maps controls in the sim manually.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron** (native window) | A real desktop app — no system browser, no user-visible web server. `contextIsolation` on, `nodeIntegration` off; the renderer talks to the main process over a `contextBridge` preload (`window.api`). |
| Frontend | **React + TypeScript + Vite** | **TanStack Table** (+ optional TanStack Virtual) for the grid; state via Zustand; styling Tailwind. Loaded from `dist/` over `file://` in the packaged app. |
| Engine | **TypeScript in the Electron main process** | The former Rust backend, ported 1:1: model validation, codegen, pin allocation, identity/PID registry, project parse/serialize/migrate. Invoked over IPC. |
| Native helper | **Rust CLI sidecar** (`helper/`) | A small `simpanman-helper` binary for the genuinely-hard native bits: serial-port enumeration, the 32u4 1200-baud bootloader touch, and PlatformIO build/upload. Spawned per-operation; build progress streamed back as NDJSON. Keeping serial/HID in a standalone binary avoids Electron native-module rebuild pain. |
| Templating | **nunjucks** (JS, Jinja2-compatible) | Firmware templates inlined as string constants in the engine so they bundle cleanly. |
| Toolchain | **PlatformIO Core** bundled in app resources | Pin a version; the helper resolves it via `SIMPANMAN_PIO` (the app sets it to the bundled binary). Do not install at runtime. |
| Auto-update | **electron-updater + GitHub Releases** | Background download, install-on-quit; update status surfaced to the renderer. |
| Device read (test view) | **hidapi** crate (helper) | Read HID joystick reports to reflect live control state (Phase 3, behind the `hid` feature). |

Targets: **Windows** (required — the sim PC), **macOS**, and **Linux**. Keep all
platform-specific code (serial port enumeration, sidecar paths) behind small abstractions.

---

## 3. Architecture

```
React UI (grid-first, Electron renderer)
  │  window.api.<command>   (contextBridge preload → ipcRenderer.invoke)
  ▼
Electron main process (TypeScript)
  ├─ Engine (ported from Rust):
  │    ├─ Model store        (parse/serialize project, validation, migrations)
  │    ├─ Pin allocator      (per-board pin map, conflict detection)
  │    ├─ Codegen            (nunjucks → main.cpp + platformio.ini + board.json)
  │    └─ Identity registry  (board → assigned PID + USB product string)
  ├─ Native dialogs          (open/save .spm via OS file pickers)
  └─ Helper bridge → spawns the Rust CLI sidecar:
       ├─ list-ports         (serial enumeration)
       ├─ build              (1200-baud touch + pio build/upload, NDJSON stream)
       └─ read-device        (HID read for live test view — Phase 3)
  │
  ▼
PlatformIO Core (bundled binary)  →  avr toolchain  →  board over USB
```

Build progress (`build:log`, `build:status`) is pushed from the main process back to
the renderer over IPC; the helper streams its own NDJSON events to the main process,
which forwards them. Auto-update status (`update:status`) is broadcast the same way.

---

## 4. Domain model

Single project file, JSON, versioned. Suggested extension `.spm` (JSON inside).

```jsonc
{
  "schemaVersion": 1,
  "name": "F-5E Pit",
  "panels":   [ /* Panel[] */ ],
  "boards":   [ /* Board[] */ ],
  "controls": [ /* Control[] */ ]
}
```

IDs are UUID strings. Relationships: a `Control` references exactly one `panelId` and one
`boardId`; pins are referenced by name within that board. **Panels↔Boards is many-to-many
through controls.**

```ts
type Panel = {
  id: string;
  name: string;
  order: number;
  // Reserved for future 2D view; unused in v1 UI:
  layout?: { x: number; y: number; w: number; h: number };
};

type BoardType = "leonardo" | "micro" | "pro_micro"; // ATmega32u4 family in v1
type Board = {
  id: string;
  name: string;            // friendly, e.g. "Left Console"
  type: BoardType;
  identity: {
    usbProduct: string;    // unique; shown to the sim
    usbVid: number;        // private/default VID (see §6)
    usbPid: number;        // allocated, unique per board
    serial?: string;       // optional; may be unsupported on AVR
  };
  // Cached/derived view of pin usage is computed by the Rust pin allocator,
  // not stored authoritatively here.
};

type ControlKind = "button" | "switch" | "selector" | "encoder" | "analog";

// active = inverted ? (digitalRead == LOW) : (digitalRead == HIGH)
// With INPUT_PULLUP + switch-to-ground (the usual wiring), use inverted: true.
// The UI may offer NO/NC as a convenience that just sets `inverted` (NO → true, NC → false).
type PinRef = { pin: string; inverted: boolean }; // pin name e.g. "D7", "A0"

type Control =
  | (Base & { kind: "button";   pin: PinRef })                        // momentary → 1 button
  | (Base & { kind: "switch";   pin: PinRef; onLabel: string; offLabel: string }) // SPDT → 2 buttons (ON = pin active, OFF = inverse)
  | (Base & { kind: "selector"; positions: SelectorPosition[] })      // n-position → n buttons
  | (Base & { kind: "encoder";  encoder: EncoderConfig })
  | (Base & { kind: "analog";   analog: AnalogConfig });

type Base = {
  id: string;
  panelId: string;
  boardId: string;
  label: string;            // human label, e.g. "Master Arm"
  notes?: string;
};

// Selector: each position = one logical joystick button, defined by a pin
// expression (one or more pins combined with AND/OR, each optionally inverted).
type SelectorPosition = {
  label: string;            // "ON" / "OFF" / "STBY"
  pins: PinRef[];
  op: "and" | "or" | null;  // null when single pin
};

// Encoder supports BOTH output modes; user picks per encoder.
type EncoderConfig = {
  pinA: string;
  pinB: string;
  countsPerDetent: 1 | 2 | 4;   // quadrature resolution of the encoder
  mode: "buttons" | "axis";

  // mode === "buttons": (matches the proven board-2 firmware, which pulses a
  // CW/CCW button `button_mult` times per detent to register reliably in DCS)
  buttonCw?:  { label: string };  // logical button on clockwise detent(s)
  buttonCcw?: { label: string };  // logical button on counter-clockwise detent(s)
  pressesPerDetent?: number;      // presses emitted per detent (sensitivity), default 1
  pulseMs?: number;               // press pulse length, default 20

  // mode === "axis":
  axis?: "X" | "Y" | "Z" | "Rx" | "Ry" | "Rz" | "Slider1" | "Slider2";
  deltaPerStep?: number;        // axis units moved per detent
  min?: number; max?: number;   // clamp range
  wrap?: boolean;               // wrap vs clamp at ends
};

type AnalogConfig = {
  pin: string;                  // analog-capable pin, e.g. "A0"
  axis: "X" | "Y" | "Z" | "Rx" | "Ry" | "Rz" | "Slider1" | "Slider2";
  inMin: number; inMax: number; // raw ADC range (0..1023), supports calibration
  outMin: number; outMax: number;
  invert: boolean;
  deadzone?: number;
  smoothing?: number;           // 0..1 EMA factor, optional
};
```

Each emitted **logical joystick button** is assigned a stable index per board at codegen
time (selectors expand to one button per position; encoder button-mode emits two). Keep
button-index assignment deterministic and stable across regenerations where possible.

---

## 5. Pins & allocation

ATmega32u4 usable pins (Leonardo/Micro). The allocator must own a per-type pin table:

- **Digital I/O:** `D0`–`D13`, plus `A0`–`A5` (usable as digital).
- **Analog in:** `A0`–`A5` (and A6–A11 on some pins; restrict to A0–A5 in v1).
- **Interrupt-capable (preferred for encoders):** `D0, D1, D2, D3, D7`.
- **Avoid by default / warn:** `D0`/`D1` (Serial), onboard-LED pin if relevant.

Rules:
- A pin may be used by at most one control (encoders consume two pins).
- Encoders **should** use interrupt-capable pins; warn (don't block) otherwise.
- Analog controls require an analog-capable pin.
- The allocator exposes, per board: `{ used: PinRef[], free: string[], warnings: [] }`.
- Validation runs on every edit and before build; build is blocked on hard conflicts.

Provide a Rust board-profile abstraction so other MCUs can be added later.

---

## 6. Board identity (core feature)

**Problem:** identical Leonardos share VID `0x2341`/PID `0x8036` and no serial, so the sim
keys bindings to an enumeration-dependent identity → bindings drift on replug/reboot.

**Solution:** bake a unique USB descriptor per board at build time.

- Maintain an **identity registry** in the project: each board gets a unique `usbPid` from a
  private range and a distinctive `usbProduct` string (default to the board `name`).
- Use the **pid.codes** open-source VID `0x1209` by default (configurable); allocate PIDs
  locally per board. PIDs `0x0001`–`0x000F` are reserved for prototyping/testing — the example
  projects use these. **Do not impersonate real vendors.**
- Implementation: prefer generating a **custom PlatformIO board definition** (JSON) per board
  with `vid`/`pid`/`product` baked in; fall back to `build_flags` USB overrides if simpler on
  atmelavr. (`build_flags` USB overrides are known finicky on some platforms — test on AVR early.)
- A unique **serial** on AVR is hard (stock core doesn't expose it); product name + PID is the
  pragmatic target. Persist assignments so re-flashing reproduces the same identity.
- Surface the resulting sim-visible device name in the UI so the user can recognise each board.

---

## 7. Firmware generation

Per board, collect all controls with that `boardId` (across panels) and render:

1. `platformio.ini` (env per board, `lib_deps = mheironimus/Joystick`, USB identity).
2. `src/main.cpp` (`.ino`-style) via minijinja from a template.
3. Optional generated `boards/<board>.json` for custom identity.

Firmware behaviour:
- Declare `Joystick_` with enough buttons/axes for the board's assignments
  (`JOYSTICK_TYPE_GAMEPAD`; enable only axes that are used).
- `setup()`: `pinMode(..., INPUT_PULLUP)` for digital inputs; init joystick.
- `loop()`:
  - **Buttons/switches:** read pin, apply `NO/NC` + invert, debounce, send only on change.
  - **Selectors:** evaluate each position's pin expression (AND/OR + invert) → its button.
  - **Encoders (buttons mode):** quadrature decode; every `stepsPerPress` detents, pulse the
    CW or CCW button for `pulseMs`. Decode in ISR where interrupt pins are used.
  - **Encoders (axis mode):** accumulate detents × `deltaPerStep`, clamp/wrap to `[min,max]`,
    write to chosen axis.
  - **Analog:** read ADC, map `[inMin,inMax]→[outMin,outMax]`, invert/deadzone/smoothing, write axis.
  - `Joystick.sendState()` once per loop.
- Software debounce for all digital reads (default ~5 ms); encoder logic robust to bounce.

Keep templates small and composable (a base template + per-control-kind macros). Reuse the
existing `JoystickBoard.ino.tmpl` logic as the starting point (port Jinja → minijinja).

---

## 8. Build & upload pipeline

- Spawn the **pio sidecar**: `pio run -e <board> -t upload` in a generated temp/project dir.
- Stream stdout/stderr to the UI via events; parse exit code for success/failure.
- **32u4 upload:** trigger bootloader with a **1200-baud touch** on the board's port, then
  detect the newly-appeared bootloader port before invoking the uploader (or let PlatformIO
  handle it, but implement detection as fallback — this is the classic Leonardo gotcha).
- Port selection UI: list serial ports; let the user pick/confirm which port is which board
  (pre-identity, ordering is ambiguous — guide the user to flash one board at a time).
- Provide **"Build all"** and **"Build this board"**. Report per-board success/failure.
- Surface clear, plain-language errors (toolchain missing, port busy, compile error → first
  error line shown, full log expandable).

---

## 9. UI

Grid-first, designed for a heavy Excel user. Minimum views:

1. **Controls grid (primary).** Group/filter by panel. One row per control. Columns:
   Panel, Label, Kind, Wiring (NO/NC), Board, Pin(s), per-kind config (inline editors via
   dropdowns/number fields), Validation. Inline add/edit/duplicate/delete rows. Keyboard
   navigation, copy/paste of rows, fill-down. This is where most work happens.
2. **Boards view.** List of boards; per board show identity (name, product, PID) and a
   **pin map** (free vs used, with the control occupying each pin). Add/rename/remove boards.
3. **Build view.** Per-board build/upload buttons, live log, status, sim-visible device name.
4. **Test view (Phase 3).** Read the connected HID device(s) and light up controls live so the
   user can verify wiring before opening the sim.

All editing is driven by the model; validation errors shown inline and aggregated before build.

---

## 10. Persistence

- Single project file (`.spm`, JSON, `schemaVersion`). Open/Save/Save As; recent files.
- Migrations keyed on `schemaVersion`.
- Identity assignments live in the project so they are reproducible.
- Autosave/dirty-state indicator recommended.

---

## 11. Repository layout

```
/                       (project root)
  src/                  React + TS renderer (grid, boards, build, test views)
    lib/api.ts          thin wrapper over the window.api preload bridge
    lib/events.ts       build log/status IPC subscriptions
    types/index.ts      shared domain + ElectronApi types (renderer ↔ preload)
  electron/             Electron main process (TypeScript)
    main.ts             app lifecycle + BrowserWindow
    preload.ts          contextBridge → window.api
    ipc.ts              IPC handlers (engine + native dialogs + build)
    helper.ts           bridge to the Rust helper (spawn + NDJSON parse)
    updater.ts          electron-updater wiring
    build.mjs           esbuild bundler for main/preload
    engine/             ported pure logic
      model.ts          new/parse/serialize/migrate
      validation.ts     validation report
      pins.ts           board profiles + allocator
      buttonIndex.ts    stable joystick-button assignment
      render.ts         nunjucks context + render
      emitter.ts        GeneratedProject files + temp-dir emission
      identity.ts       PID/product registry
      templates.ts      inlined firmware templates (nunjucks)
  helper/               Rust CLI sidecar crate
    src/main.rs         list-ports / build subcommands
    src/build/          ports, bootloader (1200-baud), pio runner
  electron-builder.yml  packaging + GitHub Releases publish config
  tests/engine/         vitest engine unit/snapshot tests
  tests/e2e/            Playwright UI tests (window.api mocked)
  docs/                 this spec, schema docs
```

---

## 12. Command surface (indicative)

Each command is an IPC channel exposed on `window.api` by the preload bridge and
handled in the main process (`ipcMain.handle`), taking/returning structured-clone
JSON. The build stream is pushed back over the `build:log` / `build:status` channels.

```
project_new(name) -> Project
project_open(content) -> Project       # parses uploaded .spm file contents
project_serialize(project) -> string   # canonical JSON for browser download
panel_upsert / panel_delete
board_upsert / board_delete
control_upsert / control_delete
validate(project) -> ValidationReport          // pin conflicts, missing config, warnings
board_pinmap(project, boardId) -> PinMap        // used/free/warnings
allocate_identity(project, boardId) -> Identity // assign unique PID/product
generate_board(project, boardId) -> GeneratedProject   // files, no upload
list_serial_ports() -> Port[]
build_board(project, boardId, port) -> (streams events)   // build + upload
read_device_state(filter) -> (streams device://state)
```

---

## 13. Milestones (map to proposal phases)

1. **Codegen + identity (headless).** Model → per-board `platformio.ini` + firmware for
   buttons/switches/selectors, with unique identity. CLI/test harness; flash a board manually.
2. **App MVP.** Controls grid + boards view + build view. End-to-end for switch panels, no code.
3. **Encoders + analog + test view.** Both encoder modes (configurable presses-per-rotation and
   axis delta-per-step); analog axes; live HID test screen.
4. **Polish.** Save/load, multi-board "build all", robust errors, port-to-board guidance.

Later (not v1): 2D canvas over the existing layout metadata; more MCUs; more sims.

---

## 14. Acceptance criteria

- From a project with ≥3 panels whose controls are split across ≥2 boards, the app generates
  and uploads correct firmware **per board** (controls grouped by board, not panel).
- Each board enumerates with a **unique, stable** USB product/PID; identities persist across
  rebuilds and survive replug/reboot (verify by inspecting OS device list).
- Pin allocator prevents double-assignment and reports free pins; build blocked on conflicts.
- A switch wired NO vs NC produces correct active-state logic; a 3-position selector yields 3
  stable buttons.
- An encoder in **buttons mode** emits the configured number of presses per rotation; in **axis
  mode** moves the axis by the configured delta per detent; sensitivity is tunable without code.
- An analog control maps its calibrated range to the chosen axis with invert/deadzone honoured.

---

## 15. Testing

- **Rust unit tests:** pin allocation/conflicts, identity uniqueness, model validation, codegen
  output (snapshot tests of rendered firmware per control kind).
- **Codegen compile test:** rendered projects must compile under PlatformIO in CI (`pio run`,
  no upload) for representative configs.
- **Schema/migration tests:** round-trip load/save; version migration.
- **Manual hardware checklist:** flash, confirm unique enumeration, verify each control in the
  test view and in DCS.

---

## 16. Assumptions & open items

- Boards are ATmega32u4-family (Leonardo/Micro/Pro Micro) in v1; abstraction allows others later.
- Default private USB VID/PID range to be chosen at implementation; must not collide with real
  vendors. Document the chosen range.
- The app does not edit sim config files; mapping is manual in the sim.
- Confirm whether multiple distinct **panels' encoders** ever need shared/linked behaviour
  (assumed independent).
```
