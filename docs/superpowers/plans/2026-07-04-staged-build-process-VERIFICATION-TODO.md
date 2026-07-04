# Staged Build Process — Deferred Verification

All 22 tasks in `2026-07-04-staged-build-process.md` are implemented and committed on
`claude/staged-build-process-q7huaz`. This doc is a handoff for whoever picks up the
branch next in an environment with a real Electron runtime, PlatformIO CLI, and
physical Arduino hardware — none of which were available in the sandbox this plan was
executed in.

## Environment this was built in (and why some things weren't run)

- No display/Electron runtime: `npm install` was run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`
  because the sandboxed network policy returned 403 for Electron's binary download.
  `node_modules/electron` has package metadata but no `dist/` binary.
- No PlatformIO: `pio` is not installed anywhere in the sandbox, and `SIMPANMAN_PIO` was
  never set.
- No physical hardware: no serial ports, no Arduino boards.
- `libudev-dev` was missing for the `serialport` crate's build script and had to be
  `apt-get install`ed to get `cargo test`/`cargo clippy` working at all — if a fresh
  clone hits the same `pkg-config` error, that's why.

## What *was* verified, and how

- `cargo test` / `cargo clippy -- -D warnings` / `cargo clippy --all-targets` — all pass.
  `cargo fmt --check` initially failed on one line in `main.rs`; fixed with `cargo fmt`
  (commit `eeea0d5`).
- `npx vitest run` — all 38 tests pass (9 files), including the 3 new suites
  (`portMatch.test.ts`, `emitter.test.ts` rewritten, `arduinoExport.test.ts`) and no
  regressions in the pre-existing ones.
- `npm run lint` (eslint) and `npm run typecheck` (`tsc --noEmit` for both renderer and
  `electron/tsconfig.json`) — both clean.
- `make build` (renderer via `tsc && vite build`, electron main/preload via
  `electron/build.mjs`, helper via `cargo build --release`) — all three succeed. This
  only proves the code compiles/bundles; it says nothing about runtime behavior since
  the Electron *binary* was never available to actually launch what got bundled.
- Full Playwright e2e suite (`npx playwright test`, pointed at the pre-installed
  Chromium via `PW_CHROMIUM_PATH`) — **96/96 pass**, including the rewritten
  `build-view.spec.ts` (15 tests). This suite runs against the Vite dev server with
  `window.api` fully mocked (`tests/e2e/helpers/mock-api.ts`) — it never touches real
  IPC, the real preload bridge, the Rust helper, or Electron itself.

## What was *not* run and needs a real environment

In priority order — start at the top, since the whole staged design depends on Build
and Program working correctly against a real PlatformIO + a real board:

1. **`make dev` manual walkthrough (plan Task 22, Step 6, items 1–4)** — never run.
   Load `examples/f5e-armament.spm`, go to the Build tab, and confirm:
   - The PlatformIO banner reflects the real `pio-version` detection result.
   - Generate & Export: "Copy firmware to clipboard" and "Export as Arduino sketch…"
     produce the expected `main.cpp` content and `<name>.ino` + `README.txt` files.
   - **If PlatformIO is installed:** click Compile, confirm the NDJSON log stream
     renders live in the `LogPane` and the badge flips to Success/Failed correctly;
     export a PlatformIO project and confirm `platformio.ini`/`src/main.cpp`/
     `boards/*.json` land in the target folder.
   - Edit a control's pin assignment (Controls tab), return to Build, confirm the
     Program section reports the build as stale (`compiledAtVersion !== projectVersion`
     in `src/store/index.ts`) and re-gates on a fresh Compile. This staleness logic
     (`isStale`/`canProgram` in `src/views/build/BoardBuildCard.tsx`) has no test
     coverage beyond what a human click-through would catch, since exercising the real
     store's `projectVersion` increments requires the whole app running.

2. **The persistent build-directory behavior (Tasks 6 and 9)** — the actual point of
   moving off `writeToTempDir` was so PlatformIO's `.pio` cache carries over between a
   Compile and a later Flash of the same board (directory:
   `<userData>/builds/<boardId>`, see `buildDirFor` in `electron/ipc.ts`). This was only
   unit-tested at the "does it write files to a given path" level
   (`tests/engine/emitter.test.ts`); the actual cache-reuse speedup and any file
   collision issues across repeated compiles need a real PlatformIO run to observe.

3. **Program stage device detection with a real board (Task 22 Step 6, item 5)** —
   plug in a real 32u4 board (Leonardo/Micro), click "Detect board" in the Program
   section, and confirm:
   - The polling loop in `BoardBuildCard.tsx`'s `startDetect()` actually notices the new
     port within its 1s interval and calls `classifyPort`.
   - `classifyDetectedPort` (`electron/engine/portMatch.ts`) correctly labels a genuinely
     unflashed board as `"stock"` and a board this project already flashed as `"self"` —
     unit tests only cover the classification logic against synthetic VID/PID values,
     never a real device's `serialport` enumeration output.
   - Flash actually invokes the 1200-baud bootloader touch (`helper/src/build/
     bootloader.rs::trigger_reset`, untouched by this plan but exercised through the new
     `upload_board`) and the board re-enumerates correctly afterward.
   - The "foreign identity" confirmation flow (a board already flashed for a *different*
     board slot in this project) triggers correctly — this is the one path that's
     structurally hardest to hit by accident, so it's worth deliberately testing with two
     boards from the same multi-board project.

4. **`npm run test:smoke` (`tests/electron/*`, `playwright.electron.config.ts`)** — never
   attempted. This is the one automated suite that launches the *real* built app
   (`dist/` + `dist-electron/`) through real Electron and exercises the real preload
   bridge end to end. Requires `make build` first (already verified to succeed) and a
   real Electron binary. This is likely the highest-value thing to run before trusting
   this branch, since it's the only automated check that would catch a wiring mistake
   between `ipc.ts` ⇄ `preload.ts` ⇄ `src/lib/api.ts` that the mocked e2e suite can't see
   (the mock reimplements the bridge rather than calling through it).

5. **Real serial port enumeration** (`helper/src/build/ports.rs::list_serial_ports`) —
   the unit tests construct a `serialport::UsbPortInfo` by hand and check the mapping
   logic; they don't exercise `serialport::available_ports()` against a real OS/USB
   stack. Worth plugging in a board and confirming `vid`/`pid`/`serialNumber`/`product`
   come through as expected end-to-end (helper CLI → `helper.ts` → IPC → renderer).

## Bugs found and fixed *in the plan's own example code* while executing it

These aren't scope creep — they're places where the plan's provided code failed its own
specified test. Worth a second look since they were fixed under a broken
`AskUserQuestion` tool (couldn't get live confirmation at the time; used best judgement
and proceeded):

- **`helper/src/build/runner.rs::parse_pio_version`** — `"".trim().rsplit(' ').next()`
  returns `Some("")`, not `None`, so the plan's own `returns_none_for_empty_output` test
  failed. Fixed by guarding on `trimmed.is_empty()`. (commit `f1415c9`)
- **`electron/engine/arduinoExport.ts`** README text — the plan's text wrapped "USB
  identity" across a line break, so `toContain("USB identity")` failed on the literal
  string. Reflowed the sentence; no content/meaning change. (commit `e073f48`)
- **`tests/e2e/build-view.spec.ts`** — the "detecting a foreign-identity board requires
  explicit confirmation" test never marked the compile as successful (missing `ws`
  fixture and `sendCompileStatus` call), so the Program section never rendered and
  "Detect board" was never clickable — the test timed out. Added `ws.sendCompileStatus
  ("board-arm", true)` after the Compile click, matching the pattern of every sibling
  test. (commit `21d3da7`)

None of these should be controversial, but flagging them explicitly in case there's a
reason the original text was written that way that isn't visible from the code alone.
