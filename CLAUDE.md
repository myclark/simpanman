# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sim Panel Manager: an Electron desktop app for describing custom simulator control
panels, assigning controls to Arduino boards/pins, generating per-board firmware, and
building/uploading it. Full domain spec (data model, pin rules, USB identity scheme,
firmware behavior) lives in `docs/TECHNICAL_SPEC.md` — read it before touching
`electron/engine/` or firmware codegen, it's the source of truth for *why*, not just
the code.

## Commands

Prefer `make <target>` (see `make help`); it wraps npm scripts and the Rust helper build.

```
make install         # npm install + playwright chromium + cargo fetch
make dev             # Vite + Electron together (builds helper first)
make build           # renderer + electron main/preload + helper, all three
make test            # vitest engine tests (alias: make test-engine)
make test-e2e        # Playwright, renderer-only (window.api mocked)
npm run test:smoke   # Playwright against the real packaged-style Electron app
make lint            # eslint + tsc --noEmit (renderer & electron) + cargo clippy
make typecheck       # tsc --noEmit only (renderer & electron/tsconfig.json)
make fmt             # cargo fmt (helper only; no Rust formatter runs in lint)
make clean           # remove dist, dist-electron, release, cargo target
```

Single test / focused run:
```
npx vitest run tests/engine/pins.test.ts        # one engine test file
npx vitest run -t "conflict"                    # by test name
npx playwright test tests/e2e/boards-view.spec.ts
npx playwright test -c playwright.electron.config.ts   # smoke test config
cargo test --manifest-path helper/Cargo.toml
```

`SIMPANMAN_PIO` env var points the helper at a local PlatformIO CLI for firmware
build/upload in dev (unset otherwise; the packaged app sets it to the bundled binary).

Node is pinned to 20.x (`.nvmrc`, `package.json#engines`) — CI and `make install` both
assume it.

## Architecture

Three processes/layers, not one:

1. **Renderer** (`src/`) — React + TypeScript + Vite, TanStack Table for the
   Excel-like controls grid, Zustand for state, Tailwind for styling. Never touches
   Node/Electron APIs directly; everything goes through `window.api`
   (`src/lib/api.ts` is a thin typed wrapper over the preload bridge, `src/lib/events.ts`
   subscribes to pushed build/update events). Views live in `src/views/` (Controls,
   Boards, Build, Test) and mirror the "grid-first" UI in the spec.

2. **Electron main process** (`electron/`) — owns the window (`main.ts`), registers
   all IPC handlers (`ipc.ts`), and hosts the **engine**: pure, synchronous project
   logic ported 1:1 from an earlier Rust backend (see recent git history —
   "convert app from Rust-server-in-browser to Electron"). The engine
   (`electron/engine/`) has no Electron dependency and is exercised directly by the
   vitest suite (`tests/engine/`) without spinning up Electron:
   - `model.ts` — new/parse/serialize/migrate a `Project` (schema-versioned JSON, `.spm`)
   - `pins.ts` — per-board-type pin tables + allocator (conflict detection, free pins)
   - `validation.ts` — validation report (errors block builds; warnings don't)
   - `buttonIndex.ts` — deterministic joystick-button-index assignment across controls
   - `identity.ts` — USB VID/PID/product allocation so identical boards enumerate uniquely
   - `render.ts` + `templates.ts` — nunjucks firmware templates → per-board `main.cpp`/`platformio.ini`
   - `emitter.ts` — writes a `GeneratedProject` to a persistent per-board build dir
   - `portMatch.ts` — classifies a detected serial port against a board's identity
   - `arduinoExport.ts` — transforms a generated project into an Arduino-IDE sketch
   - `commands.ts` — the command surface IPC calls into (project/panel/board/control CRUD, validate, generate, allocate identity); re-exported wholesale from `index.ts`

   `ipc.ts` is the only place that wires engine commands to `ipcMain.handle` channels
   and does non-pure work: native file dialogs (open/save `.spm`, export), and
   orchestrating a compile/flash (validate → `generateBoard` → `writeToBuildDir` →
   spawn the helper, streaming `build:compileLog`/`build:compileStatus` or
   `build:flashLog`/`build:flashStatus` events back to the renderer that invoked it).

3. **Native helper** (`helper/`, Rust) — a one-shot CLI sidecar, `simpanman-helper`,
   spawned per-operation by `electron/helper.ts` (never long-running). Four
   subcommands: `list-ports` (serial enumeration → JSON, including raw vid/pid/
   serialNumber/product), `pio-version` (`pio --version` detection → JSON), `compile
   --project-dir --env` (build only, no upload), and `upload --project-dir --env
   --port` (the 32u4 1200-baud bootloader touch + `pio run -t upload`). Compile/
   upload stream NDJSON `{type: "log"|"status", ...}` lines on stdout that
   `helper.ts` parses back into the callback shape `ipc.ts` forwards to the
   renderer. Kept separate from the main process specifically to avoid Electron
   native-module rebuild pain around serialport/HID — do not pull serial/HID logic
   into `electron/` or `src/`.

Data flow for a build: renderer calls `window.api.compileBoard(...)` or `.flashBoard(...)`
→ IPC `build:compile`/`build:flash` → validate → codegen (engine, pure) → write into a
persistent per-board directory (`userData/builds/<boardId>`, not a fresh temp dir — lets
PlatformIO's `.pio` cache carry over between a compile and a later flash) → spawn helper →
NDJSON parsed → `build:compileLog`/`build:compileStatus` or `build:flashLog`/
`build:flashStatus` pushed to renderer. See
`docs/superpowers/specs/2026-07-04-staged-build-process-design.md` for the full three-stage
(Generate & Export / Build / Program) design.

### Cross-boundary types

`Project` and friends are defined once in the engine (`electron/engine/types.ts`) and
imported by both `electron/` and `src/types/index.ts`/`src/lib/api.ts` — keep these in
sync manually; there's no shared package, `src/types` mirrors the engine's IPC-facing
shapes for the renderer. Panels↔boards is many-to-many *through controls* (a `Control`
has exactly one `panelId` and one `boardId`); don't assume a board belongs to one panel
or vice versa when writing UI or validation logic.

### Test structure

- `tests/engine/` (vitest, Node env) — engine logic directly, no Electron. Includes
  codegen snapshot tests (`__snapshots__/`) rendered from `examples/*.spm` fixtures.
- `tests/e2e/` (Playwright, `playwright.config.ts`) — runs against the Vite dev
  server only; `window.api` is fully mocked (`tests/e2e/helpers/mock-api.ts`), no real
  Electron/IPC/helper involved.
- `tests/electron/` (Playwright, `playwright.electron.config.ts`, `npm run
  test:smoke`) — launches the actual built app (`dist/` + `dist-electron/`) through
  real Electron and exercises the real preload bridge. Requires `make build` first;
  serial, single-worker, longer timeout.
- `examples/*.spm` — hand-authored fixture projects (`f5e-armament.spm`,
  `multi-board-demo.spm`) documented in `examples/README.md`; used as both manual
  sanity-check files and codegen snapshot fixtures. If you change the domain model or
  codegen output shape, check whether these need regenerating/updating too.

### CI (`.github/workflows/ci.yml`)

Four independent jobs per PR: Rust helper (cargo check + clippy), engine (vitest),
frontend (eslint + typecheck + renderer/electron build), e2e (Playwright, installs
Chromium). Electron smoke test builds everything (renderer, electron, helper) and runs
under `xvfb-run`. Mirror these when validating a change locally instead of guessing
which subset applies.

### USB identity range

Boards use VID `0x1209` (pid.codes open-source range) with locally-allocated PIDs.
PIDs `0x0001`–`0x000F` are reserved for prototyping/example projects — see
`examples/README.md`. Never allocate/hardcode a real vendor's VID/PID.

### Deferred ideas

`docs/FUTURE_IDEAS.md` holds ideas explicitly scoped out of a targeted feature/upgrade
during design — check it before assuming something was simply forgotten, and add to it
when you scope something out of the current work.
