# Staged Build Process — Design

Status: approved, not yet implemented
Date: 2026-07-04

## Background

`src/views/BuildView.tsx` currently offers one action per board: "Build &
Upload," which always runs `pio run -e <env> -t upload` into a fresh temp
directory (`electron/engine/emitter.ts:writeToTempDir`, `electron/ipc.ts`
`build:run`, `helper/src/build/runner.rs:build_board`). This assumes
PlatformIO is already installed and reachable (via `SIMPANMAN_PIO` or `pio` on
`PATH`), gives no path for users who'd rather use the Arduino IDE, and
conflates "prove the firmware compiles" with "flash this specific physical
board" into a single irreversible step.

This was flagged as a known follow-up in
`2026-07-02-panel-board-control-editing-design.md` ("Build & Upload redesign
(three-stage: export template / PlatformIO build / program with device
detection) — independent, not covered by this spec"). This spec covers it.

The technical spec (`docs/TECHNICAL_SPEC.md` §2) originally described
PlatformIO Core as bundled inside the app ("Do not install at runtime"). That
isn't implemented — `SIMPANMAN_PIO` today just points dev builds at whatever
`pio` is on the developer's machine. This spec deliberately does *not* build
the bundling approach; see "Deferred ideas" below.

## Goals

- Split the build/upload flow into three independent, always-visible stages
  per board: **Generate & Export**, **Build**, **Program**.
- Let users without PlatformIO still get usable firmware source (copy to
  clipboard, or export an Arduino-IDE-compatible sketch folder) without any
  toolchain dependency.
- Detect whether PlatformIO is available once per `BuildView` session, and
  gate the Build/Program stages on it, with a way to recheck.
- Make "prove it compiles" (Build) and "flash a specific physical board"
  (Program) genuinely separate actions, with build-cache reuse between them.
- Handle physical board identification robustly: matching an already-flashed
  board, onboarding a fresh unflashed board, and warning (with a hard
  confirmation) when a connected board carries a *different* board's identity
  from this app.
- Reframe failure messaging appropriately: validation errors are
  user-actionable; template-render or compile failures are not (they're
  environment or app-bug issues), and should say so.

## Non-goals

- Bundling PlatformIO Core into the app (deferred; see below).
- Richer board-type catalog data (photos, 2D pinout diagrams, enumerating
  board types from a real source of truth instead of the current 3-item
  hardcoded dropdown in `BoardsView.tsx`) (deferred; see below).
- A working Arduino-IDE path for custom USB VID/PID/product identity. This
  would require generating and manually installing a custom Arduino hardware
  package (`boards.txt`/`platform.txt`, one board-menu entry per unique
  identity) — more setup friction than installing PlatformIO itself, for an
  audience whose reason to prefer Arduino IDE is avoiding exactly that. The
  `.ino` export ships with a README caveat instead.
- Detecting/special-casing specific compile-failure root causes (network
  failures, disk space, etc.) beyond showing the raw log. Out of scope for v1.

## UI structure

Each board card in `BuildView.tsx` gains three sections, all always rendered
(not a wizard that hides later steps):

1. **Generate & Export** — always available, no PlatformIO dependency.
2. **Build** — visible but disabled (with a one-line reason) until PlatformIO
   is detected.
3. **Program** — visible but disabled until Build has produced a successful,
   non-stale compile for this board.

A single status line/banner at the top of `BuildView` (not the app's global
nav/shell) shows PlatformIO detection state and gates Build/Program for every
board card beneath it — this is a machine-wide fact, not a per-board one.

### Stage 1: Generate & Export

- Reuses the store's existing `validationReport` (`src/store/index.ts`,
  already recomputed on every project mutation via `scheduleRevalidate`) —
  no new validation call. Filtered to errors relevant to this board:
  `error.boardId === board.id`, or (for errors keyed by `controlId`) the
  referenced control's `boardId === board.id`.
- If relevant errors exist, block generation and point at the existing
  validation summary (`ControlsView.tsx:359-371`) rather than duplicating it
  — these are genuinely user-actionable (pin conflicts, missing refs, etc.).
- If validation passes, render via the existing `renderBoard` engine
  function. This should never throw in practice; if it does, that's an app
  bug, not a user-fixable problem — show a plain "Internal error generating
  firmware — this is a bug, not a problem with your design" message with the
  raw error and a copy button, no "fix your input" framing.
- **Copy firmware to clipboard**: copies rendered `main.cpp` text directly.
- **Export as Arduino sketch**: native save-folder dialog (same pattern as
  the existing `.spm` save dialog). Writes `<BoardName>/<BoardName>.ino`
  (renamed `main.cpp`) + `README.txt` noting: install the `Joystick` library
  via Arduino Library Manager, and that the board will enumerate with the
  stock Arduino identity, not its assigned VID/PID/product, unless built via
  PlatformIO.

### PlatformIO detection

- On `BuildView` mount, call a new `pio:detect` IPC command (→
  `helper.detectPio()` → new `simpanman-helper pio-version` subcommand, which
  runs the resolved `pio` binary with `--version` using the same resolution
  logic `runner.rs`'s `pio_command()` already has). Returns
  `{ available: boolean, version: string | null }`.
- Store this once at the top level of the Zustand store:
  `pio: { checked: boolean; available: boolean; version: string | null }`.
- Banner: missing → install instructions (`pip install platformio` /
  `pipx install platformio`, link to platformio.org) + "Recheck" button.
  Present → quiet "PlatformIO vX.Y.Z detected" line.

### Stage 2: Build (compile only)

- Read-only confirmation line: board type, derived build variant
  (`board.type === "pro_micro" ? "sparkfun_promicro" : board.type`), and
  PlatformIO env name (`board.id` with dashes replaced by underscores) — so
  the user can sanity-check what codegen picked, without a new place to edit
  board type (that stays in `BoardsView.tsx`).
- Regenerates firmware into a **persistent per-board directory**
  (`app.getPath("userData")/builds/<boardId>/`, overwritten each run) instead
  of a fresh temp dir, so PlatformIO's `.pio` build cache carries forward
  into Stage 3.
- **Compile** button runs `pio run -e <env>` (build target only, no
  `-t upload`, no port required) against that directory. Streams the same
  NDJSON log pane as today.
- On success: records a "compiled at" marker for this board; Stage 3 enables.
  If the project model changes after that marker (compare against the
  existing debounced revalidation trigger), Stage 3 greys out again as
  "stale — recompile" until Stage 2 is re-run.
- On failure: compilation failing after validation passed is virtually never
  the user's fault. Message explicitly frames it as an environment/toolchain
  issue or an app bug, not a design problem. Shows the full raw log, a "Copy
  log" button, and a "File an issue" button that opens a pre-filled GitHub
  issue against `github.com/myclark/simpanman` (title + truncated log in the
  body).
- **Export PlatformIO Project**: native save-folder dialog, copies the
  persistent build directory's *source files* (not the `.pio` cache) to the
  chosen location.

### Stage 3: Program (flash)

- Disabled until Stage 2 has a fresh, non-stale successful compile.
- **Detect board** starts a plug-in-diffing flow (local component state in
  `BuildView.tsx`, not global store — it's a transient UI flow, not project
  state): snapshot `ports:list`, prompt "Connect the board for '<Board
  Name>' now," poll roughly every second, diff against the snapshot.
- Every newly-appeared port is classified against this board's identity and
  every other board's identity in the project, via a new pure engine
  function (e.g. `classifyDetectedPort(project, boardId, port)`):
  1. **Matches this board's own VID/PID** → auto-selected silently
     (re-flashing a board already assigned to this slot).
  2. **Matches the stock/default identity** for this board type (e.g.
     Arduino Leonardo's factory VID `0x2341`/PID `0x8036`) → auto-selected as
     a fresh, never-flashed board. Exact stock VID/PID per `BoardType` needs
     pinning down during implementation (Leonardo, Micro, and the common
     Pro Micro clone identity).
  3. **Matches our allocated VID range (`0x1209`) but a *different* board's
     identity** → likely a board already programmed for another
     board/project slot. Blocking confirmation dialog showing the detected
     product string/VID/PID, requiring explicit "Yes, overwrite it" before
     proceeding — never silently treated as fresh.
  4. **Anything else** (unrecognized device) → listed but not auto-suggested;
     the user can still pick it manually.
- Once confirmed, **Flash** runs `pio run -e <env> -t upload --upload-port
  <port>` against the same persistent directory from Stage 2 (reuses the
  build cache; only recompiles if something changed since Stage 2).
- Today's manual port dropdown remains available as a fallback/rescan option
  alongside the guided flow, not a replacement for it.

## Engine / IPC / helper changes

**`helper/src/`**
- `build/runner.rs`: split `build_board` into `compile_board(project_dir,
  env_name)` (`pio run -e <env>`) and `upload_board(project_dir, env_name,
  port)` (`pio run -e <env> -t upload --upload-port <port>`, keeping the
  existing 32u4 bootloader-touch logic). Both stream the existing NDJSON
  log/status shape.
- `main.rs`: new `pio-version` subcommand, reusing `pio_command()`'s
  resolution logic, returning `{available, version}` JSON.
- `build/ports.rs`: extend `SerialPort` with `vid: Option<u16>`, `pid:
  Option<u16>`, `serialNumber: Option<String>`, `product: Option<String>`
  (already present on `serialport::UsbPortInfo`, currently discarded into the
  `description` string; keep `description` for display, add raw fields for
  matching).

**`electron/engine/`**
- New pure function `classifyDetectedPort` (new module or added to
  `identity.ts`), covering the four cases above — unit-testable in
  `tests/engine/` without Electron.
- `emitter.ts`: add `writeToBuildDir(root, generated)`, a thin wrapper around
  the existing `writeProjectFiles` that skips `mkdtemp`, for the persistent
  per-board directory.

**`electron/ipc.ts` / `electron/helper.ts`**
- Replace `build:run` with `build:compile` (writes to persistent
  `userData/builds/<boardId>/`, calls `helper.compileBoard`) and
  `build:flash` (calls `helper.uploadBoard` against the same directory, port
  required).
- New `pio:detect` handler calling `helper.detectPio()`.
- New `export:arduino` and `export:platformio` handlers: open a save-folder
  dialog, write files (sketch + README, or source tree) to the chosen path.

**`src/store`, `src/views/BuildView.tsx`**
- Replace the flat `buildStatus`/`buildLogs` records with per-board,
  per-stage state, e.g. `boardBuild: Record<boardId, { compileStatus,
  compileLogs, compiledAt, flashStatus, flashLogs, isStale }>`.
- New top-level `pio: { checked, available, version }` state, populated on
  `BuildView` mount and by "Recheck."
- Stage 1 validation filtering reuses the existing `validationReport` (no
  new fetch).

## Testing

- `tests/engine/`: unit tests for `classifyDetectedPort` (all four cases)
  and the new emitter helper.
- `tests/e2e/` (mocked `window.api`): extend `tests/e2e/helpers/mock-api.ts`
  to support `pio:detect` (available/unavailable), `build:compile` /
  `build:flash` (success/failure), and a mocked evolving `ports:list`
  response to drive the plug-in-diffing flow deterministically. Cover: full
  3-stage happy path; PlatformIO-absent state disables stages 2/3; foreign-
  identity confirmation dialog blocks until confirmed.
- `tests/electron/` smoke test: real `pio-version` detection depends on
  whatever's on the local machine's PATH, which CI doesn't have — keep this
  manual/local-only, don't assert real PlatformIO detection in CI.

## Deferred ideas

Tracked in `docs/FUTURE_IDEAS.md`:

- Bundling PlatformIO Core into app resources (original `TECHNICAL_SPEC.md`
  direction) instead of detecting a system install.
- Richer board-type catalog: photos, 2D pinout diagrams, enumerating board
  types from a real source of truth (e.g. PlatformIO's board list) instead
  of the current 3-item hardcoded dropdown in `BoardsView.tsx`.
