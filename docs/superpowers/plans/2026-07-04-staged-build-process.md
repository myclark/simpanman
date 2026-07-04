# Staged Build Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BuildView`'s single "Build & Upload" button with three per-board stages (Generate & Export, Build, Program) per `docs/superpowers/specs/2026-07-04-staged-build-process-design.md`.

**Architecture:** Rust helper gains `pio-version`/`compile`/`upload` subcommands (replacing `build`) and richer `SerialPort` fields. A new pure engine module classifies a detected serial port against a board's identity. Electron main gets new IPC channels for detect/compile/flash/export/classify, writing generated firmware into a persistent per-board directory (not a fresh temp dir) so PlatformIO's build cache carries over. The renderer store tracks per-board compile/flash state plus a `projectVersion` counter used to detect staleness; `BuildView` is split into a thin top-level view and a `BoardBuildCard` component per board.

**Tech Stack:** Rust (helper), TypeScript engine (Electron main, no Electron dep), Electron IPC, React/TypeScript/Zustand (renderer), Vitest, Playwright.

## Global Constraints

- Node pinned to 20.x; Rust `rust-version = "1.77"` (`helper/Cargo.toml`).
- `SIMPANMAN_PIO` env var overrides the `pio` binary path; otherwise resolve next to the helper executable, then `pio` on `PATH` (existing `pio_command()` behavior — preserve exactly).
- USB VID `0x1209` is this app's allocated range; PIDs `0x0001`–`0x000F` reserved for prototyping (`examples/README.md`). Never hardcode a real vendor's VID/PID as if it were ours.
- `git commit` messages: subject line ≤72 characters; put detail in the body if needed.
- Run `make typecheck` and `make lint` before considering any renderer/electron task done; run `cargo check --manifest-path helper/Cargo.toml` (or `make lint`, which includes clippy) after any Rust change.

---

## Task 1: Rust — richer `SerialPort` (vid/pid/serialNumber/product)

**Files:**
- Modify: `helper/src/build/ports.rs`

**Interfaces:**
- Produces: `SerialPort { name: String, description: Option<String>, vid: Option<u16>, pid: Option<u16>, serial_number: Option<String>, product: Option<String> }` (serialized camelCase). `pub fn list_serial_ports() -> Vec<SerialPort>` (signature unchanged).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `helper/src/build/ports.rs` with:

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerialPort {
    pub name: String,
    pub description: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub product: Option<String>,
}

pub fn list_serial_ports() -> Vec<SerialPort> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| serial_port_from_info(p.port_name, &p.port_type))
        .collect()
}

fn serial_port_from_info(name: String, port_type: &serialport::SerialPortType) -> SerialPort {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => SerialPort {
            name,
            description: usb_description(info),
            vid: Some(info.vid),
            pid: Some(info.pid),
            serial_number: info.serial_number.clone(),
            product: info.product.clone(),
        },
        serialport::SerialPortType::BluetoothPort => SerialPort {
            name,
            description: Some("Bluetooth".to_string()),
            vid: None,
            pid: None,
            serial_number: None,
            product: None,
        },
        _ => SerialPort {
            name,
            description: None,
            vid: None,
            pid: None,
            serial_number: None,
            product: None,
        },
    }
}

fn usb_description(info: &serialport::UsbPortInfo) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(mfr) = &info.manufacturer {
        parts.push(mfr.clone());
    }
    if let Some(prod) = &info.product {
        parts.push(prod.clone());
    }
    if parts.is_empty() {
        Some(format!("USB {:04X}:{:04X}", info.vid, info.pid))
    } else {
        Some(parts.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serialport::UsbPortInfo;

    #[test]
    fn usb_port_includes_raw_vid_pid_and_product() {
        let info = UsbPortInfo {
            vid: 0x2341,
            pid: 0x8036,
            serial_number: Some("ABC123".to_string()),
            manufacturer: Some("Arduino".to_string()),
            product: Some("Leonardo".to_string()),
        };
        let port = serial_port_from_info(
            "/dev/ttyACM0".to_string(),
            &serialport::SerialPortType::UsbPort(info),
        );
        assert_eq!(port.vid, Some(0x2341));
        assert_eq!(port.pid, Some(0x8036));
        assert_eq!(port.serial_number.as_deref(), Some("ABC123"));
        assert_eq!(port.product.as_deref(), Some("Leonardo"));
        assert_eq!(port.description.as_deref(), Some("Arduino Leonardo"));
    }

    #[test]
    fn non_usb_port_has_no_vid_pid() {
        let port = serial_port_from_info(
            "/dev/rfcomm0".to_string(),
            &serialport::SerialPortType::BluetoothPort,
        );
        assert_eq!(port.vid, None);
        assert_eq!(port.pid, None);
        assert_eq!(port.description.as_deref(), Some("Bluetooth"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cargo test --manifest-path helper/Cargo.toml build::ports`
Expected: both tests pass (this is new code plus new tests together — there's no separate "red" phase for a data-shape change like this; verify by temporarily checking the test would fail against the *old* struct shape is unnecessary since the old struct didn't have these fields at all, so compilation itself is the first signal).

- [ ] **Step 3: Lint**

Run: `cargo clippy --manifest-path helper/Cargo.toml -- -D warnings`
Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add helper/src/build/ports.rs
git commit -m "$(cat <<'EOF'
Add raw vid/pid/serial/product fields to SerialPort

Needed to match a connected board's USB identity against a project
board's assigned identity for the Program stage's device detection.
EOF
)"
```

---

## Task 2: Rust — split `build_board` into `compile_board` / `upload_board`, add `detect_pio`

**Files:**
- Modify: `helper/src/build/runner.rs`

**Interfaces:**
- Consumes: `bootloader::trigger_reset(port: &str) -> anyhow::Result<()>` (unchanged, from Task 1's sibling module).
- Produces: `pub fn compile_board(project_dir: &str, env_name: &str) -> anyhow::Result<bool>`, `pub fn upload_board(project_dir: &str, env_name: &str, port: &str) -> anyhow::Result<bool>`, `pub struct PioInfo { pub available: bool, pub version: Option<String> }` (serde camelCase), `pub fn detect_pio() -> PioInfo`.

- [ ] **Step 1: Write the failing test for version parsing**

Add to the bottom of `helper/src/build/runner.rs` (after the existing functions, before nothing — it's the last thing in the file):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_platformio_version_string() {
        assert_eq!(
            parse_pio_version("PlatformIO Core, version 6.1.13\n"),
            Some("6.1.13".to_string())
        );
    }

    #[test]
    fn returns_none_for_empty_output() {
        assert_eq!(parse_pio_version(""), None);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path helper/Cargo.toml build::runner`
Expected: compile error — `parse_pio_version` doesn't exist yet.

- [ ] **Step 3: Replace the runner implementation**

Replace the full contents of `helper/src/build/runner.rs` above the `#[cfg(test)]` block added in Step 1 with:

```rust
//! PlatformIO build/upload runner. Takes an already-generated project directory
//! (codegen happens in the TypeScript engine) and streams progress to stdout as
//! line-delimited JSON (NDJSON) the Electron main process parses.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use anyhow::Context;
use serde::Serialize;

use super::bootloader;

/// Emit one `{"type":"log",...}` NDJSON line. `println!` locks stdout, so lines
/// from the stdout/stderr reader threads never interleave mid-line.
fn emit_log(line: &str, is_err: bool) {
    let v = serde_json::json!({ "type": "log", "line": line, "isErr": is_err });
    println!("{v}");
}

fn emit_status(success: bool, exit_code: i32) {
    let v = serde_json::json!({ "type": "status", "success": success, "exitCode": exit_code });
    println!("{v}");
}

/// Run `pio run -e <env>` (compile only, no upload) for a generated project
/// directory. Returns whether the compile succeeded; also emits a terminal
/// status event.
pub fn compile_board(project_dir: &str, env_name: &str) -> anyhow::Result<bool> {
    emit_log("Running PlatformIO build...", false);

    let args: Vec<String> = vec![
        "run".into(),
        "-e".into(),
        env_name.into(),
        "--project-dir".into(),
        project_dir.into(),
    ];

    run_pio(&args, "Build complete.", "Build failed.")
}

/// Run `pio run -e <env> -t upload --upload-port <port>` for a generated
/// project directory, touching the 32u4 bootloader first. Returns whether the
/// upload succeeded; also emits a terminal status event.
pub fn upload_board(project_dir: &str, env_name: &str, port: &str) -> anyhow::Result<bool> {
    emit_log(&format!("Triggering bootloader on {port}..."), false);
    match bootloader::trigger_reset(port) {
        Ok(()) => thread::sleep(Duration::from_millis(500)),
        Err(e) => emit_log(&format!("Warning: bootloader reset failed: {e}"), true),
    }

    emit_log("Running PlatformIO upload...", false);

    let args: Vec<String> = vec![
        "run".into(),
        "-e".into(),
        env_name.into(),
        "-t".into(),
        "upload".into(),
        "--project-dir".into(),
        project_dir.into(),
        "--upload-port".into(),
        port.into(),
    ];

    run_pio(&args, "Upload complete.", "Upload failed.")
}

/// Spawn `pio` with the given args, streaming stdout/stderr as NDJSON log
/// events, then emit a terminal status event. Shared by compile and upload.
fn run_pio(args: &[String], success_msg: &str, failure_msg: &str) -> anyhow::Result<bool> {
    let mut child = pio_command()
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawning PlatformIO process")?;

    let stdout = child.stdout.take().context("capturing PlatformIO stdout")?;
    let stderr = child.stderr.take().context("capturing PlatformIO stderr")?;

    let out_task = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            emit_log(&line, false);
        }
    });
    let err_task = thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            emit_log(&line, true);
        }
    });

    let status = child.wait().context("waiting for PlatformIO process")?;
    let _ = out_task.join();
    let _ = err_task.join();

    let exit_code = status.code().unwrap_or(-1);
    let success = exit_code == 0;
    emit_log(if success { success_msg } else { failure_msg }, !success);
    emit_status(success, exit_code);

    Ok(success)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PioInfo {
    pub available: bool,
    pub version: Option<String>,
}

/// Run `pio --version` to detect whether PlatformIO is reachable, using the
/// same resolution order as `pio_command()`.
pub fn detect_pio() -> PioInfo {
    match pio_command().arg("--version").output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            PioInfo {
                available: true,
                version: parse_pio_version(&text),
            }
        }
        _ => PioInfo {
            available: false,
            version: None,
        },
    }
}

/// Parse the version out of `pio --version` output, e.g.
/// "PlatformIO Core, version 6.1.13" → Some("6.1.13").
fn parse_pio_version(text: &str) -> Option<String> {
    text.trim().rsplit(' ').next().map(|s| s.to_string())
}

/// Build a `Command` for the PlatformIO executable. `SIMPANMAN_PIO` overrides the
/// path (the Electron app sets it to the bundled binary); otherwise look next to
/// this executable, then fall back to `pio` on `PATH`.
fn pio_command() -> Command {
    let path = std::env::var_os("SIMPANMAN_PIO")
        .map(PathBuf::from)
        .unwrap_or_else(default_pio_path);
    Command::new(path)
}

fn default_pio_path() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let name = if cfg!(windows) { "pio.exe" } else { "pio" };
    let local = exe_dir.join(name);
    if local.exists() {
        local
    } else {
        PathBuf::from(name)
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path helper/Cargo.toml build::runner`
Expected: `parses_platformio_version_string` and `returns_none_for_empty_output` both pass.

- [ ] **Step 5: Lint**

Run: `cargo clippy --manifest-path helper/Cargo.toml -- -D warnings`
Expected: no warnings. (`compile_board`/`upload_board`/`detect_pio` aren't called yet — that's Task 3 — so clippy may warn `dead_code`; if so, that warning disappears once Task 3 wires them in. If it persists after Task 3, address it then, not here.)

- [ ] **Step 6: Commit**

```bash
git add helper/src/build/runner.rs
git commit -m "$(cat <<'EOF'
Split build_board into compile_board/upload_board; add detect_pio

Compile (no upload) and upload are now separate operations so the
Build stage can prove firmware compiles without a board connected,
and the Program stage can reuse PlatformIO's build cache when
flashing. detect_pio backs a "is PlatformIO installed" check.
EOF
)"
```

---

## Task 3: Rust — wire `pio-version`/`compile`/`upload` subcommands in `main.rs`

**Files:**
- Modify: `helper/src/main.rs`

**Interfaces:**
- Consumes: `build::ports::list_serial_ports()`, `build::runner::{compile_board, upload_board, detect_pio}` (Tasks 1–2).
- Produces: CLI subcommands `list-ports`, `pio-version`, `compile --project-dir <dir> --env <env>`, `upload --project-dir <dir> --env <env> --port <port>`. The old `build` subcommand is removed (Electron side is updated in Task 8 to match — do not keep both).

- [ ] **Step 1: Replace `main.rs`**

Replace the full contents of `helper/src/main.rs` with:

```rust
//! simpanman-helper — native sidecar CLI for the Sim Panel Manager Electron app.
//!
//! Subcommands (invoked one-shot by the Electron main process):
//!   list-ports                                   → JSON array of serial ports
//!   pio-version                                  → JSON {available, version}
//!   compile --project-dir <dir> --env <env>      → `pio run`, NDJSON stream
//!   upload --project-dir <dir> --env <env> --port <p>
//!                                                 → 1200-baud touch + `pio run
//!                                                   -t upload`, NDJSON stream
//!
//! All pure project logic (model, validation, codegen, pins, identity) lives in
//! the TypeScript engine; this binary only does hardware / external-process work.

mod build;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("list-ports") => cmd_list_ports(),
        Some("pio-version") => cmd_pio_version(),
        Some("compile") => cmd_compile(&args[2..]),
        Some("upload") => cmd_upload(&args[2..]),
        _ => {
            eprintln!("simpanman-helper: native sidecar for Sim Panel Manager");
            eprintln!("usage:");
            eprintln!("  simpanman-helper list-ports");
            eprintln!("  simpanman-helper pio-version");
            eprintln!("  simpanman-helper compile --project-dir <dir> --env <env>");
            eprintln!(
                "  simpanman-helper upload --project-dir <dir> --env <env> --port <port>"
            );
            ExitCode::from(2)
        }
    }
}

fn cmd_list_ports() -> ExitCode {
    let ports = build::ports::list_serial_ports();
    match serde_json::to_string(&ports) {
        Ok(s) => {
            println!("{s}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("serializing ports: {e}");
            ExitCode::FAILURE
        }
    }
}

fn cmd_pio_version() -> ExitCode {
    let info = build::runner::detect_pio();
    match serde_json::to_string(&info) {
        Ok(s) => {
            println!("{s}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("serializing pio-version: {e}");
            ExitCode::FAILURE
        }
    }
}

fn cmd_compile(args: &[String]) -> ExitCode {
    let mut project_dir: Option<String> = None;
    let mut env_name: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project-dir" => {
                project_dir = args.get(i + 1).cloned();
                i += 2;
            }
            "--env" => {
                env_name = args.get(i + 1).cloned();
                i += 2;
            }
            other => {
                eprintln!("unknown argument: {other}");
                return ExitCode::from(2);
            }
        }
    }

    let (Some(dir), Some(env)) = (project_dir, env_name) else {
        eprintln!("compile requires --project-dir and --env");
        return ExitCode::from(2);
    };

    match build::runner::compile_board(&dir, &env) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("{e:#}");
            ExitCode::FAILURE
        }
    }
}

fn cmd_upload(args: &[String]) -> ExitCode {
    let mut project_dir: Option<String> = None;
    let mut env_name: Option<String> = None;
    let mut port: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project-dir" => {
                project_dir = args.get(i + 1).cloned();
                i += 2;
            }
            "--env" => {
                env_name = args.get(i + 1).cloned();
                i += 2;
            }
            "--port" => {
                port = args.get(i + 1).cloned();
                i += 2;
            }
            other => {
                eprintln!("unknown argument: {other}");
                return ExitCode::from(2);
            }
        }
    }

    let (Some(dir), Some(env), Some(p)) = (project_dir, env_name, port) else {
        eprintln!("upload requires --project-dir, --env, and --port");
        return ExitCode::from(2);
    };

    match build::runner::upload_board(&dir, &env, &p) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("{e:#}");
            ExitCode::FAILURE
        }
    }
}
```

- [ ] **Step 2: Build and smoke-check by hand**

Run: `cargo build --manifest-path helper/Cargo.toml`
Expected: builds cleanly.

Run: `./helper/target/debug/simpanman-helper` (no args)
Expected: usage text listing `list-ports`, `pio-version`, `compile`, `upload`, exit code 2.

Run: `./helper/target/debug/simpanman-helper pio-version`
Expected: JSON like `{"available":false,"version":null}` if `pio`/`SIMPANMAN_PIO` isn't set on this machine, or `{"available":true,"version":"X.Y.Z"}` if it is. Either is correct — this just confirms the subcommand runs end-to-end.

- [ ] **Step 3: Full Rust verification**

Run: `cargo test --manifest-path helper/Cargo.toml && cargo clippy --manifest-path helper/Cargo.toml -- -D warnings`
Expected: all tests pass, no clippy warnings (the `dead_code` risk noted in Task 2 should be gone now that `main.rs` calls everything).

- [ ] **Step 4: Commit**

```bash
git add helper/src/main.rs
git commit -m "$(cat <<'EOF'
Replace build subcommand with pio-version/compile/upload

Matches the split in compile_board/upload_board: compile never
touches a board (no --port), upload always requires one.
EOF
)"
```

---

## Task 4: TypeScript types — extend `SerialPort`, add build/classification types

**Files:**
- Modify: `src/types/index.ts:147-234`

**Interfaces:**
- Produces (all consumed by later tasks): `SerialPort` gains `vid?: number; pid?: number; serialNumber?: string; product?: string`. New: `PortClassification = "self" | "stock" | "foreign" | "unknown"`, `PioInfo = { available: boolean; version: string | null }`, `PioStatus = PioInfo & { checked: boolean }`, `CompileStatus = "idle" | "compiling" | "success" | "error"`, `FlashStatus = "idle" | "flashing" | "success" | "error"`, `BoardBuildState = { compileStatus: CompileStatus; compileLogs: BuildLogLine[]; compiledAtVersion: number | null; flashStatus: FlashStatus; flashLogs: BuildLogLine[] }`. `ElectronApi` gains `detectPio`, `compileBoard`, `flashBoard`, `classifyPort`, `onCompileLog`, `onCompileStatus`, `onFlashLog`, `onFlashStatus`, `exportArduinoSketch`, `exportPlatformioProject`; loses `buildBoard`, `onBuildLog`, `onBuildStatus`.

- [ ] **Step 1: Replace `SerialPort` and remove `BuildStatus`**

In `src/types/index.ts`, replace (around line 147-150):

```ts
export type SerialPort = {
  name: string;
  description?: string;
};
```

with:

```ts
export type SerialPort = {
  name: string;
  description?: string;
  vid?: number;
  pid?: number;
  serialNumber?: string;
  product?: string;
};

/** Result of classifying a freshly-detected port against a board's identity —
 * see `electron/engine/portMatch.ts:classifyDetectedPort`. */
export type PortClassification = "self" | "stock" | "foreign" | "unknown";
```

Then replace (around line 176):

```ts
export type BuildStatus = "idle" | "building" | "success" | "error";
```

with:

```ts
export type PioInfo = { available: boolean; version: string | null };
export type PioStatus = PioInfo & { checked: boolean };

export type CompileStatus = "idle" | "compiling" | "success" | "error";
export type FlashStatus = "idle" | "flashing" | "success" | "error";

/** Per-board compile/flash state tracked by the store. `compiledAtVersion` is
 * the store's `projectVersion` at the last successful compile — the Program
 * stage compares it against the current `projectVersion` to detect staleness. */
export type BoardBuildState = {
  compileStatus: CompileStatus;
  compileLogs: BuildLogLine[];
  compiledAtVersion: number | null;
  flashStatus: FlashStatus;
  flashLogs: BuildLogLine[];
};
```

- [ ] **Step 2: Update `ElectronApi`**

Replace (around line 220-226):

```ts
  // Native helper (serial + PlatformIO build/upload).
  listSerialPorts(): Promise<SerialPort[]>;
  buildBoard(project: Project, boardId: string, port: string | null): Promise<void>;

  // Build event subscriptions (return an unsubscribe fn).
  onBuildLog(cb: (e: BuildLogEvent) => void): () => void;
  onBuildStatus(cb: (e: BuildStatusEvent) => void): () => void;
```

with:

```ts
  // Native helper (serial + PlatformIO detect/compile/upload).
  listSerialPorts(): Promise<SerialPort[]>;
  detectPio(): Promise<PioInfo>;
  compileBoard(project: Project, boardId: string): Promise<void>;
  flashBoard(project: Project, boardId: string, port: string): Promise<void>;
  classifyPort(project: Project, boardId: string, port: SerialPort): Promise<PortClassification>;

  // Compile/flash event subscriptions (return an unsubscribe fn).
  onCompileLog(cb: (e: BuildLogEvent) => void): () => void;
  onCompileStatus(cb: (e: BuildStatusEvent) => void): () => void;
  onFlashLog(cb: (e: BuildLogEvent) => void): () => void;
  onFlashStatus(cb: (e: BuildStatusEvent) => void): () => void;

  // Export (native save-folder dialogs).
  exportArduinoSketch(project: Project, boardId: string): Promise<{ path: string } | null>;
  exportPlatformioProject(project: Project, boardId: string): Promise<{ path: string } | null>;
```

- [ ] **Step 3: Verify (expect breakage — later tasks fix it)**

Run: `npx tsc --noEmit -p electron/tsconfig.json; npx tsc --noEmit`
Expected: errors in `electron/preload.ts`, `electron/helper.ts`, `electron/ipc.ts`, `src/lib/api.ts`, `src/store/index.ts`, `src/views/BuildView.tsx` — all referencing the now-removed `buildBoard`/`onBuildLog`/`onBuildStatus`/`BuildStatus`. This is expected; each is fixed in its own task below. Do not fix them here.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "$(cat <<'EOF'
Add build-stage and port-classification types

Extends SerialPort with raw vid/pid/serial/product, and replaces the
single BuildStatus with per-stage CompileStatus/FlashStatus plus
PioStatus and PortClassification. Consumers are updated in follow-up
commits; typecheck is expected to fail until then.
EOF
)"
```

---

## Task 5: Engine — `classifyDetectedPort`

**Files:**
- Create: `electron/engine/portMatch.ts`
- Test: `tests/engine/portMatch.test.ts`
- Modify: `electron/engine/identity.ts:5` (export `DEFAULT_VID`)
- Modify: `electron/engine/index.ts` (export `classifyDetectedPort`)

**Interfaces:**
- Consumes: `Project`, `BoardType`, `SerialPort` (from `./types`), `DEFAULT_VID` (from `./identity`).
- Produces: `export type PortClassification` (re-exported via `src/types`, already added in Task 4 — engine's `./types` re-export already covers it, no edit needed there), `export function classifyDetectedPort(project: Project, boardId: string, port: Pick<SerialPort, "vid" | "pid">): PortClassification`.

- [ ] **Step 1: Export `DEFAULT_VID`**

In `electron/engine/identity.ts:5`, change:

```ts
const DEFAULT_VID = 0x1209;
```

to:

```ts
export const DEFAULT_VID = 0x1209;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/portMatch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import { classifyDetectedPort } from "../../electron/engine";

describe("classifyDetectedPort", () => {
  it("classifies a port matching the board's own identity as self", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x1209, pid: 1 });
    expect(result).toBe("self");
  });

  it("classifies the stock Leonardo identity as stock", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x2341, pid: 0x8036 });
    expect(result).toBe("stock");
  });

  it("classifies our VID range assigned to a different board as foreign", () => {
    const project = loadFixture("multi-board-demo.spm");
    const boardB = project.boards.find((b) => b.id === "board-b")!;
    const result = classifyDetectedPort(project, "board-a", {
      vid: boardB.identity.usbVid,
      pid: boardB.identity.usbPid,
    });
    expect(result).toBe("foreign");
  });

  it("classifies an unrecognized VID/PID as unknown", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x0483, pid: 0x5740 });
    expect(result).toBe("unknown");
  });

  it("classifies a port with no vid/pid as unknown", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: undefined, pid: undefined });
    expect(result).toBe("unknown");
  });

  it("throws for an unknown board id", () => {
    const project = loadFixture("f5e-armament.spm");
    expect(() => classifyDetectedPort(project, "not-a-board", { vid: 1, pid: 1 })).toThrow(
      "not-a-board",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/portMatch.test.ts`
Expected: FAIL — `classifyDetectedPort` is not exported from `../../electron/engine`.

- [ ] **Step 4: Implement `classifyDetectedPort`**

Create `electron/engine/portMatch.ts`:

```ts
// Classifies a freshly-detected serial port against a board's own identity,
// other boards in the project, and known stock (factory-default) identities —
// used by the Program stage's plug-in-diffing flow to decide whether a
// connected board is a re-flash, a fresh unflashed board, or a board already
// programmed for a different slot.

import { DEFAULT_VID } from "./identity";
import type { BoardType, Project, SerialPort } from "./types";

export type PortClassification = "self" | "stock" | "foreign" | "unknown";

/**
 * Factory USB VID/PID a board type enumerates with before Sim Panel Manager
 * firmware has ever been flashed to it (Arduino's own Leonardo/Micro
 * identities; the common SparkFun Pro Micro identity). If a specific batch of
 * boards doesn't match, this table may need a per-manufacturer entry later.
 */
const STOCK_IDENTITY: Record<BoardType, { vid: number; pid: number }> = {
  leonardo: { vid: 0x2341, pid: 0x8036 },
  micro: { vid: 0x2341, pid: 0x8037 },
  pro_micro: { vid: 0x1b4f, pid: 0x9206 },
};

/**
 * Classify a detected port against `boardId`'s identity:
 * - "self": matches this board's own assigned VID/PID (re-flashing it).
 * - "stock": matches the factory-default identity for this board type
 *   (genuinely unflashed).
 * - "foreign": in our allocated VID range but assigned to a different board
 *   (already programmed for another slot — needs explicit confirmation).
 * - "unknown": anything else (unrecognized device, or no VID/PID reported).
 */
export function classifyDetectedPort(
  project: Project,
  boardId: string,
  port: Pick<SerialPort, "vid" | "pid">,
): PortClassification {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) {
    throw new Error(`Board '${boardId}' not found`);
  }
  if (port.vid == null || port.pid == null) {
    return "unknown";
  }

  if (port.vid === board.identity.usbVid && port.pid === board.identity.usbPid) {
    return "self";
  }

  const stock = STOCK_IDENTITY[board.type];
  if (port.vid === stock.vid && port.pid === stock.pid) {
    return "stock";
  }

  if (port.vid === DEFAULT_VID) {
    return "foreign";
  }

  return "unknown";
}
```

- [ ] **Step 5: Export it from the engine's public surface**

In `electron/engine/index.ts`, add a line alongside the other named re-exports (near `export { checkUniqueness } from "./identity";`):

```ts
export { classifyDetectedPort } from "./portMatch";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/portMatch.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add electron/engine/portMatch.ts electron/engine/identity.ts electron/engine/index.ts tests/engine/portMatch.test.ts
git commit -m "Add classifyDetectedPort for board-identification matching"
```

---

## Task 6: Engine — persistent build directory (`writeToBuildDir` replaces `writeToTempDir`)

**Files:**
- Modify: `electron/engine/emitter.ts`
- Test: `tests/engine/emitter.test.ts` (new)

**Interfaces:**
- Produces: `export async function writeToBuildDir(root: string, generated: GeneratedProject): Promise<void>`. Removes `writeToTempDir` (confirmed unused outside `emitter.ts`/`electron/ipc.ts`, which Task 9 updates).

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/emitter.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeToBuildDir } from "../../electron/engine";
import type { GeneratedProject } from "../../electron/engine";

const generated: GeneratedProject = {
  boardId: "board-a",
  files: [
    { relativePath: "platformio.ini", content: "[env:board_a]\n" },
    { relativePath: "src/main.cpp", content: "// v1\n" },
  ],
};

describe("writeToBuildDir", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes all generated files under the given root", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    await writeToBuildDir(dir, generated);

    const ini = await readFile(path.join(dir, "platformio.ini"), "utf8");
    const cpp = await readFile(path.join(dir, "src", "main.cpp"), "utf8");
    expect(ini).toBe("[env:board_a]\n");
    expect(cpp).toBe("// v1\n");
  });

  it("overwrites existing contents on a second call", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    await writeToBuildDir(dir, generated);

    const updated: GeneratedProject = {
      boardId: "board-a",
      files: [
        { relativePath: "platformio.ini", content: "[env:board_a]\n" },
        { relativePath: "src/main.cpp", content: "// v2\n" },
      ],
    };
    await writeToBuildDir(dir, updated);

    const cpp = await readFile(path.join(dir, "src", "main.cpp"), "utf8");
    expect(cpp).toBe("// v2\n");
  });

  it("creates the root directory if it doesn't exist yet", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    dir = path.join(base, "nested", "builds", "board-a");
    await writeToBuildDir(dir, generated);
    const ini = await readFile(path.join(dir, "platformio.ini"), "utf8");
    expect(ini).toBe("[env:board_a]\n");
    dir = base; // clean up the actual temp root, not just the nested dir
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/emitter.test.ts`
Expected: FAIL — `writeToBuildDir` is not exported.

- [ ] **Step 3: Replace `writeToTempDir` with `writeToBuildDir`**

In `electron/engine/emitter.ts`, replace the imports at the top:

```ts
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
```

with:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
```

Then replace the `writeToTempDir` function at the bottom of the file:

```ts
/** Write a generated project into a fresh temp directory and return its path. */
export async function writeToTempDir(generated: GeneratedProject): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "simpanman-"));
  await writeProjectFiles(root, generated);
  return root;
}
```

with:

```ts
/** Write a generated project into a persistent, stable directory (creating it
 * if needed, overwriting any previous contents), so PlatformIO's `.pio` build
 * cache carries over between a compile and a later flash. Unlike the old
 * temp-dir approach, the caller owns the directory's path and lifetime. */
export async function writeToBuildDir(root: string, generated: GeneratedProject): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  await writeProjectFiles(root, generated);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/emitter.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Confirm nothing else references the removed function**

Run: `grep -rn "writeToTempDir" --exclude-dir=node_modules /Users/myles/Repos/simpanman`
Expected: no matches outside `docs/` (the design spec mentions it historically — leave that file as-is, it's a record of the design decision, not code).

- [ ] **Step 6: Commit**

```bash
git add electron/engine/emitter.ts tests/engine/emitter.test.ts
git commit -m "$(cat <<'EOF'
Replace writeToTempDir with writeToBuildDir

A stable per-board directory (instead of a fresh mkdtemp per build)
lets PlatformIO's .pio build cache carry over between a compile and a
later flash of the same board.
EOF
)"
```

---

## Task 7: Engine — Arduino sketch export transform

**Files:**
- Create: `electron/engine/arduinoExport.ts`
- Test: `tests/engine/arduinoExport.test.ts`
- Modify: `electron/engine/index.ts`

**Interfaces:**
- Consumes: `GeneratedFile` (from `./types`).
- Produces: `export function toArduinoSketch(sketchName: string, files: GeneratedFile[]): GeneratedFile[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/arduinoExport.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toArduinoSketch } from "../../electron/engine";
import type { GeneratedFile } from "../../electron/engine";

describe("toArduinoSketch", () => {
  const files: GeneratedFile[] = [
    { relativePath: "platformio.ini", content: "[env:board_a]\n" },
    { relativePath: "src/main.cpp", content: "void setup() {}\nvoid loop() {}\n" },
    { relativePath: "boards/board_a.json", content: "{}" },
  ];

  it("renames main.cpp to <sketchName>.ino", () => {
    const result = toArduinoSketch("LeftConsole", files);
    const ino = result.find((f) => f.relativePath === "LeftConsole.ino");
    expect(ino?.content).toBe("void setup() {}\nvoid loop() {}\n");
  });

  it("includes a README with the library and USB identity caveats", () => {
    const result = toArduinoSketch("LeftConsole", files);
    const readme = result.find((f) => f.relativePath === "README.txt");
    expect(readme?.content).toContain("Joystick");
    expect(readme?.content).toContain("USB identity");
  });

  it("drops platformio.ini and board.json files", () => {
    const result = toArduinoSketch("LeftConsole", files);
    expect(result.map((f) => f.relativePath)).toEqual(["LeftConsole.ino", "README.txt"]);
  });

  it("throws if there's no src/main.cpp", () => {
    expect(() => toArduinoSketch("LeftConsole", [])).toThrow("main.cpp");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/arduinoExport.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `toArduinoSketch`**

Create `electron/engine/arduinoExport.ts`:

```ts
// Arduino-IDE sketch export — transforms a generated PlatformIO project's
// files into an Arduino-IDE-compatible sketch folder: renames main.cpp to
// <SketchName>.ino and adds a README with the manual steps the IDE can't
// automate (installing the Joystick library, and the USB identity caveat —
// see docs/superpowers/specs/2026-07-04-staged-build-process-design.md).

import type { GeneratedFile } from "./types";

const README = `This sketch was exported from Sim Panel Manager.

Before building in the Arduino IDE:

1. Install the "Joystick" library (by Matthew Heironimus) via
   Sketch > Include Library > Manage Libraries...

Limitation: this board will enumerate with the Arduino IDE's default USB
identity (VID/PID/product), not the unique identity Sim Panel Manager
assigned it. Getting the assigned identity working requires a PlatformIO
build instead — see the Build stage in the app.
`;

/**
 * Convert a generated project's files into an Arduino sketch folder layout:
 * `src/main.cpp` → `<sketchName>.ino`, plus a README; `platformio.ini` and any
 * `boards/*.json` files are dropped (Arduino IDE has no equivalent).
 */
export function toArduinoSketch(sketchName: string, files: GeneratedFile[]): GeneratedFile[] {
  const mainCpp = files.find((f) => f.relativePath === "src/main.cpp");
  if (!mainCpp) {
    throw new Error("Generated project has no src/main.cpp to export");
  }
  return [
    { relativePath: `${sketchName}.ino`, content: mainCpp.content },
    { relativePath: "README.txt", content: README },
  ];
}
```

- [ ] **Step 4: Export it**

In `electron/engine/index.ts`, add:

```ts
export { toArduinoSketch } from "./arduinoExport";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/arduinoExport.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/engine/arduinoExport.ts electron/engine/index.ts tests/engine/arduinoExport.test.ts
git commit -m "Add toArduinoSketch for the Generate & Export stage"
```

---

## Task 8: Electron main — rewrite `helper.ts` for detect/compile/upload

**Files:**
- Modify: `electron/helper.ts`

**Interfaces:**
- Consumes: `helperPath()`, `helperEnv()` (unchanged internal helpers), the Rust CLI's `list-ports`/`pio-version`/`compile`/`upload` subcommands (Task 3).
- Produces: `export function listSerialPorts(): Promise<SerialPort[]>`, `export type PioInfo = { available: boolean; version: string | null }`, `export function detectPio(): Promise<PioInfo>`, `export type HelperLog`, `export type HelperStatus`, `export function compileBoard(projectDir: string, envName: string, cb: RunCallbacks): Promise<void>`, `export function uploadBoard(projectDir: string, envName: string, port: string, cb: RunCallbacks): Promise<void>`. Removes `buildBoard`.

- [ ] **Step 1: Replace `electron/helper.ts`**

Replace the full file contents with:

```ts
// Bridge to the native Rust helper binary (serial enumeration + PlatformIO
// detect/compile/upload). The helper is a one-shot CLI invoked per operation;
// its build stream is line-delimited JSON (NDJSON) on stdout. Keeping
// serial/HID/pio in a standalone binary avoids Electron native-module rebuild
// pain.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { app } from "electron";

import type { SerialPort } from "./engine";

const isWin = process.platform === "win32";
const HELPER_BIN = isWin ? "simpanman-helper.exe" : "simpanman-helper";
const PIO_BIN = isWin ? "pio.exe" : "pio";

/** Locate the helper binary: explicit override → packaged resources → dev target dir. */
function helperPath(): string {
  const override = process.env.SIMPANMAN_HELPER;
  if (override && existsSync(override)) return override;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "helper", HELPER_BIN);
  }

  // Dev: prefer a release build, fall back to debug.
  const root = path.resolve(app.getAppPath());
  for (const profile of ["release", "debug"]) {
    const p = path.join(root, "helper", "target", profile, HELPER_BIN);
    if (existsSync(p)) return p;
  }
  // Last resort: rely on PATH.
  return HELPER_BIN;
}

/** Locate the bundled PlatformIO binary so the helper can find it (SIMPANMAN_PIO). */
function pioPath(): string | undefined {
  if (process.env.SIMPANMAN_PIO) return process.env.SIMPANMAN_PIO;
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "helper", PIO_BIN);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function helperEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const pio = pioPath();
  if (pio) env.SIMPANMAN_PIO = pio;
  return env;
}

/** Run a helper subcommand that prints one JSON value to stdout and exits. */
function runHelperJson<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { env: helperEnv() });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `helper ${args[0]} exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as T);
      } catch (e) {
        reject(new Error(`parsing helper output: ${(e as Error).message}`));
      }
    });
  });
}

/** Enumerate serial ports via `helper list-ports` → parsed JSON array. */
export function listSerialPorts(): Promise<SerialPort[]> {
  return runHelperJson<SerialPort[]>(["list-ports"]);
}

export type PioInfo = { available: boolean; version: string | null };

/** Detect PlatformIO via `helper pio-version` → parsed JSON. */
export function detectPio(): Promise<PioInfo> {
  return runHelperJson<PioInfo>(["pio-version"]);
}

export type HelperLog = { line: string; isErr: boolean };
export type HelperStatus = { success: boolean; exitCode: number };

type RunCallbacks = {
  onLog: (e: HelperLog) => void;
  onStatus: (e: HelperStatus) => void;
};

/** Spawn `helper <args>`, streaming its NDJSON events to the callbacks.
 * Resolves on success, rejects on non-zero exit. Shared by compile/upload. */
function runHelperStream(args: string[], cb: RunCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { env: helperEnv() });
    let lastStatus: HelperStatus | null = null;

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: {
        type?: string;
        line?: string;
        isErr?: boolean;
        success?: boolean;
        exitCode?: number;
      };
      try {
        msg = JSON.parse(line);
      } catch {
        // Non-JSON line from the helper — surface it as a log line.
        cb.onLog({ line, isErr: false });
        return;
      }
      if (msg.type === "log") {
        cb.onLog({ line: msg.line ?? "", isErr: msg.isErr ?? false });
      } else if (msg.type === "status") {
        lastStatus = { success: msg.success ?? false, exitCode: msg.exitCode ?? -1 };
        cb.onStatus(lastStatus);
      }
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const ok = lastStatus ? lastStatus.success : code === 0;
      if (ok) resolve();
      else reject(new Error(stderr.trim() || `helper exited with code ${code}`));
    });
  });
}

/** Run `helper compile` (build only, no upload) for a generated project directory. */
export function compileBoard(
  projectDir: string,
  envName: string,
  cb: RunCallbacks,
): Promise<void> {
  return runHelperStream(["compile", "--project-dir", projectDir, "--env", envName], cb);
}

/** Run `helper upload` (bootloader touch + build + upload) for a generated
 * project directory against a specific, already-confirmed port. */
export function uploadBoard(
  projectDir: string,
  envName: string,
  port: string,
  cb: RunCallbacks,
): Promise<void> {
  return runHelperStream(
    ["upload", "--project-dir", projectDir, "--env", envName, "--port", port],
    cb,
  );
}
```

- [ ] **Step 2: Verify (expect ipc.ts breakage — fixed in Task 9)**

Run: `npx tsc --noEmit -p electron/tsconfig.json`
Expected: errors only in `electron/ipc.ts` (still calling the removed `helper.buildBoard`) and `electron/preload.ts` (still referencing `ElectronApi.buildBoard`, already gone per Task 4). No errors in `electron/helper.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add electron/helper.ts
git commit -m "Rewrite helper.ts for pio-version/compile/upload"
```

---

## Task 9: Electron main — `ipc.ts` compile/flash/detect/classify handlers

**Files:**
- Modify: `electron/ipc.ts:1-26, 85-123`

**Interfaces:**
- Consumes: `helper.{listSerialPorts, detectPio, compileBoard, uploadBoard}` (Task 8), `classifyDetectedPort`, `writeToBuildDir` (Tasks 5–6), `generateBoard`, `validateProject` (existing).
- Produces IPC channels: `ports:list` (unchanged), `pio:detect`, `build:compile`, `build:flash`, `identity:classifyPort`. Events: `build:compileLog`, `build:compileStatus`, `build:flashLog`, `build:flashStatus`. Removes `build:run`.

- [ ] **Step 1: Update imports**

In `electron/ipc.ts`, replace the `./engine` import block:

```ts
import {
  projectNew,
  projectSerialize,
  projectOpen,
  panelUpsert,
  panelDelete,
  boardUpsert,
  boardDelete,
  controlUpsert,
  controlDelete,
  validateProject,
  boardPinmap,
  allocateIdentity,
  generateBoard,
  writeToTempDir,
} from "./engine";
import type { Project } from "./engine";
import * as helper from "./helper";
```

with:

```ts
import {
  projectNew,
  projectSerialize,
  projectOpen,
  panelUpsert,
  panelDelete,
  boardUpsert,
  boardDelete,
  controlUpsert,
  controlDelete,
  validateProject,
  boardPinmap,
  allocateIdentity,
  generateBoard,
  writeToBuildDir,
  classifyDetectedPort,
} from "./engine";
import type { Project, SerialPort } from "./engine";
import * as helper from "./helper";
```

- [ ] **Step 2: Replace the build section**

Replace everything from `// ── Serial ports + build/upload (native helper) ──` (line 85) through the closing `}` of `registerIpc` (line 123) with:

```ts
  // ── Serial ports + PlatformIO detect/compile/upload (native helper) ─────────
  ipcMain.handle("ports:list", () => helper.listSerialPorts());
  ipcMain.handle("pio:detect", () => helper.detectPio());
  ipcMain.handle("identity:classifyPort", (_e, { project, boardId, port }) =>
    classifyDetectedPort(project, boardId, port),
  );

  ipcMain.handle("build:compile", async (e, { project, boardId }) => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload);
    };

    const { dir, envName } = await prepareBuildDir(project, boardId, "build:compileLog", send);
    await helper.compileBoard(dir, envName, {
      onLog: (l) => send("build:compileLog", { boardId, line: l.line, isErr: l.isErr }),
      onStatus: (s) =>
        send("build:compileStatus", { boardId, success: s.success, exitCode: s.exitCode }),
    });
  });

  ipcMain.handle("build:flash", async (e, { project, boardId, port }) => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload);
    };

    const { dir, envName } = await prepareBuildDir(project, boardId, "build:flashLog", send);
    await helper.uploadBoard(dir, envName, port, {
      onLog: (l) => send("build:flashLog", { boardId, line: l.line, isErr: l.isErr }),
      onStatus: (s) =>
        send("build:flashStatus", { boardId, success: s.success, exitCode: s.exitCode }),
    });
  });
}

/** Persistent per-board build directory: PlatformIO's `.pio` cache carries
 * over between a compile and a later flash, unlike a fresh temp dir per call. */
function buildDirFor(boardId: string): string {
  return path.join(app.getPath("userData"), "builds", boardId);
}

/** Validate, codegen, and write into this board's persistent build dir.
 * Shared by compile and flash — both need up-to-date generated sources. */
async function prepareBuildDir(
  project: Project,
  boardId: string,
  logChannel: string,
  send: (channel: string, payload: unknown) => void,
): Promise<{ dir: string; envName: string }> {
  const report = validateProject(project);
  if (report.errors.length > 0) {
    throw new Error(
      `Validation errors must be resolved before building. First: ${JSON.stringify(
        report.errors[0],
      )}`,
    );
  }

  const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
  if (!board) throw new Error(`Board '${boardId}' not found`);
  const envName = boardId.replace(/-/g, "_");

  send(logChannel, { boardId, line: `Generating firmware for '${board.name}'...`, isErr: false });

  const generated = generateBoard(project, boardId);
  const dir = buildDirFor(boardId);
  await writeToBuildDir(dir, generated);
  send(logChannel, { boardId, line: `Project written to ${path.normalize(dir)}`, isErr: false });

  return { dir, envName };
}
```

Note: `SerialPort` was imported as a type in Step 1 for the `identity:classifyPort` handler's implicit parameter typing, but since the handler body doesn't name the type explicitly, if `tsc`/eslint flags it as unused, remove that one import (keep `Project`). Check in Step 3.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p electron/tsconfig.json`
Expected: no errors from `electron/ipc.ts` itself. If `SerialPort` is reported unused, remove it from the `import type { Project, SerialPort } from "./engine";` line, leaving just `Project`.

Run: `npx eslint electron/ipc.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc.ts
git commit -m "$(cat <<'EOF'
Replace build:run with build:compile/build:flash/pio:detect

Both compile and flash regenerate into a persistent per-board
directory (userData/builds/<boardId>) instead of a fresh temp dir, so
PlatformIO's build cache carries over between them. Adds
identity:classifyPort for the Program stage's device matching.
EOF
)"
```

---

## Task 10: Electron main — `export:arduino` / `export:platformio` handlers

**Files:**
- Modify: `electron/ipc.ts`

**Interfaces:**
- Consumes: `toArduinoSketch` (Task 7), `writeProjectFiles` (existing, already exported via `export * from "./emitter"`), `generateBoard` (existing).
- Produces IPC channels: `export:arduino`, `export:platformio`, each `(project, boardId) => Promise<{ path: string } | null>` (`null` on dialog cancel).

- [ ] **Step 1: Add the import**

In `electron/ipc.ts`, add `toArduinoSketch` and `writeProjectFiles` to the `./engine` import list from Task 9:

```ts
import {
  projectNew,
  projectSerialize,
  projectOpen,
  panelUpsert,
  panelDelete,
  boardUpsert,
  boardDelete,
  controlUpsert,
  controlDelete,
  validateProject,
  boardPinmap,
  allocateIdentity,
  generateBoard,
  writeToBuildDir,
  writeProjectFiles,
  classifyDetectedPort,
  toArduinoSketch,
} from "./engine";
```

- [ ] **Step 2: Add the handlers**

Inside `registerIpc()`, immediately before the closing `}` (i.e. after the `build:flash` handler added in Task 9, still inside the function), add:

```ts
  // ── Export (native save-folder dialogs) ──────────────────────────────────────
  ipcMain.handle("export:arduino", async (e, { project, boardId }) => {
    const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
    if (!board) throw new Error(`Board '${boardId}' not found`);

    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: "Export Arduino Sketch To…",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const generated = generateBoard(project, boardId);
    const sketchName = sanitizeFileName(board.name);
    const target = path.join(res.filePaths[0], sketchName);
    const files = toArduinoSketch(sketchName, generated.files);
    await writeProjectFiles(target, { boardId, files });
    return { path: target };
  });

  ipcMain.handle("export:platformio", async (e, { project, boardId }) => {
    const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
    if (!board) throw new Error(`Board '${boardId}' not found`);

    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: "Export PlatformIO Project To…",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const generated = generateBoard(project, boardId);
    const target = path.join(res.filePaths[0], sanitizeFileName(board.name));
    await writeProjectFiles(target, generated);
    return { path: target };
  });
}

/** Turn a board name into a filesystem-safe directory/sketch name. */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
```

(This moves the closing `}` of `registerIpc` to after `export:platformio`, matching the pattern already established in Task 9 where `buildDirFor`/`prepareBuildDir` live below it as module-level helpers.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p electron/tsconfig.json && npx eslint electron/ipc.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc.ts
git commit -m "Add export:arduino and export:platformio IPC handlers"
```

---

## Task 11: Electron main — `preload.ts` wiring

**Files:**
- Modify: `electron/preload.ts`

**Interfaces:**
- Consumes: the IPC channels from Tasks 9–10.
- Produces: `window.api` methods matching the `ElectronApi` interface from Task 4 exactly.

- [ ] **Step 1: Replace the native-helper section**

In `electron/preload.ts`, replace:

```ts
  listSerialPorts: () => ipcRenderer.invoke("ports:list"),
  buildBoard: (project, boardId, port) =>
    ipcRenderer.invoke("build:run", { project, boardId, port }),

  onBuildLog: (cb) => subscribe<BuildLogEvent>("build:log", cb),
  onBuildStatus: (cb) => subscribe<BuildStatusEvent>("build:status", cb),
```

with:

```ts
  listSerialPorts: () => ipcRenderer.invoke("ports:list"),
  detectPio: () => ipcRenderer.invoke("pio:detect"),
  compileBoard: (project, boardId) => ipcRenderer.invoke("build:compile", { project, boardId }),
  flashBoard: (project, boardId, port) =>
    ipcRenderer.invoke("build:flash", { project, boardId, port }),
  classifyPort: (project, boardId, port) =>
    ipcRenderer.invoke("identity:classifyPort", { project, boardId, port }),

  onCompileLog: (cb) => subscribe<BuildLogEvent>("build:compileLog", cb),
  onCompileStatus: (cb) => subscribe<BuildStatusEvent>("build:compileStatus", cb),
  onFlashLog: (cb) => subscribe<BuildLogEvent>("build:flashLog", cb),
  onFlashStatus: (cb) => subscribe<BuildStatusEvent>("build:flashStatus", cb),

  exportArduinoSketch: (project, boardId) =>
    ipcRenderer.invoke("export:arduino", { project, boardId }),
  exportPlatformioProject: (project, boardId) =>
    ipcRenderer.invoke("export:platformio", { project, boardId }),
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p electron/tsconfig.json`
Expected: no errors — the `api` object literal now satisfies `ElectronApi` fully (Task 4's interface). If TypeScript flags a missing/extra property, reconcile the object literal against the interface field-by-field; every `ElectronApi` member from Task 4 must have a matching line here.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "Wire preload bridge to the new compile/flash/export channels"
```

---

## Task 12: Renderer — `src/lib/api.ts` and `src/lib/events.ts`

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/events.ts`

**Interfaces:**
- Consumes: `window.api` (Task 11).
- Produces: `api.detectPio(): Promise<PioInfo>`, `api.compileBoard(project, boardId): Promise<void>`, `api.flashBoard(project, boardId, port): Promise<void>`, `api.classifyPort(project, boardId, port): Promise<PortClassification>`, `api.exportArduinoSketch(project, boardId): Promise<{path}|null>`, `api.exportPlatformioProject(project, boardId): Promise<{path}|null>`. `setupCompileListeners(listeners): () => void`, `setupFlashListeners(listeners): () => void` (both now synchronous — no real main process existed to justify the old async wrapper for *new* code).

- [ ] **Step 1: Update `src/lib/api.ts`**

Replace the imports at the top:

```ts
import type {
  Board,
  BoardIdentity,
  Control,
  GeneratedProject,
  OpenedProject,
  Panel,
  PinMap,
  Project,
  SavedProject,
  SerialPort,
  ValidationReport,
} from "@/types";
```

with:

```ts
import type {
  Board,
  BoardIdentity,
  Control,
  GeneratedProject,
  OpenedProject,
  Panel,
  PinMap,
  PioInfo,
  PortClassification,
  Project,
  SavedProject,
  SerialPort,
  ValidationReport,
} from "@/types";
```

Then replace the trailing block:

```ts
  listSerialPorts: (): Promise<SerialPort[]> => bridge().listSerialPorts(),

  buildBoard: (
    project: Project,
    boardId: string,
    port: string | null,
  ): Promise<void> => bridge().buildBoard(project, boardId, port),
};
```

with:

```ts
  listSerialPorts: (): Promise<SerialPort[]> => bridge().listSerialPorts(),

  detectPio: (): Promise<PioInfo> => bridge().detectPio(),

  compileBoard: (project: Project, boardId: string): Promise<void> =>
    bridge().compileBoard(project, boardId),

  flashBoard: (project: Project, boardId: string, port: string): Promise<void> =>
    bridge().flashBoard(project, boardId, port),

  classifyPort: (
    project: Project,
    boardId: string,
    port: SerialPort,
  ): Promise<PortClassification> => bridge().classifyPort(project, boardId, port),

  exportArduinoSketch: (
    project: Project,
    boardId: string,
  ): Promise<{ path: string } | null> => bridge().exportArduinoSketch(project, boardId),

  exportPlatformioProject: (
    project: Project,
    boardId: string,
  ): Promise<{ path: string } | null> => bridge().exportPlatformioProject(project, boardId),
};
```

- [ ] **Step 2: Replace `src/lib/events.ts`**

Replace the full file contents with:

```ts
import type { BuildLogEvent, BuildStatusEvent } from "@/types";

type StageListeners = {
  onLog: (e: BuildLogEvent) => void;
  onStatus: (e: BuildStatusEvent) => void;
};

/// Subscribe to the main process's compile log/status stream over the preload
/// bridge. Returns an unlisten function that removes both subscriptions.
export function setupCompileListeners(listeners: StageListeners): () => void {
  const offLog = window.api.onCompileLog(listeners.onLog);
  const offStatus = window.api.onCompileStatus(listeners.onStatus);
  return () => {
    offLog();
    offStatus();
  };
}

/// Subscribe to the main process's flash log/status stream over the preload
/// bridge. Returns an unlisten function that removes both subscriptions.
export function setupFlashListeners(listeners: StageListeners): () => void {
  const offLog = window.api.onFlashLog(listeners.onLog);
  const offStatus = window.api.onFlashStatus(listeners.onStatus);
  return () => {
    offLog();
    offStatus();
  };
}
```

- [ ] **Step 3: Verify (expect breakage in store/App.tsx — fixed next tasks)**

Run: `npx tsc --noEmit`
Expected: errors only in `src/store/index.ts` (still using `api.buildBoard`, `BuildStatus`) and `src/App.tsx` (still using `setupBuildListeners`). No errors in `src/lib/api.ts` or `src/lib/events.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/lib/events.ts
git commit -m "Add compile/flash/detect/export/classify wrappers to src/lib"
```

---

## Task 13: Renderer — `store/index.ts` rewrite

**Files:**
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: `api.{detectPio, compileBoard, flashBoard, classifyPort, exportArduinoSketch, exportPlatformioProject, generateBoard}` (Task 12), types from Task 4.
- Produces: store state `pio: PioStatus`, `projectVersion: number`, `boardBuild: Record<string, BoardBuildState>`; actions `detectPio()`, `compileBoard(boardId)`, `flashBoard(boardId, port)`, `classifyPort(boardId, port): Promise<PortClassification>`, `generateFirmware(boardId): Promise<GeneratedProject | null>`, `exportArduinoSketch(boardId)`, `exportPlatformioProject(boardId)`, `appendCompileLog`, `setCompileStatus`, `appendFlashLog`, `setFlashStatus`. Removes `buildLogs`, `buildStatus`, `buildBoard`, `appendBuildLog`, `setBuildStatus`.

- [ ] **Step 1: Replace `src/store/index.ts`**

Replace the full file contents with:

```ts
import { create } from "zustand";
import { api } from "@/lib/api";
import type {
  Board,
  BoardBuildState,
  BuildLogEvent,
  BuildStatusEvent,
  Control,
  GeneratedProject,
  Panel,
  PinMap,
  PioStatus,
  PortClassification,
  Project,
  SerialPort,
  ValidationReport,
} from "@/types";

interface ProjectStore {
  // State
  project: Project | null;
  isDirty: boolean;
  currentPath: string | null;
  validationReport: ValidationReport | null;
  pinMaps: Record<string, PinMap>;
  projectVersion: number;
  pio: PioStatus;
  boardBuild: Record<string, BoardBuildState>;
  serialPorts: SerialPort[];
  error: string | null;

  // File operations
  newProject: (name: string) => Promise<void>;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;

  // Mutations (return updated project from backend)
  upsertPanel: (panel: Panel) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
  upsertBoard: (board: Board) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  upsertControl: (control: Control) => Promise<void>;
  deleteControl: (id: string) => Promise<void>;

  // Derived data
  revalidate: () => Promise<void>;
  refreshPinMap: (boardId: string) => Promise<void>;
  refreshAllPinMaps: () => Promise<void>;
  allocateIdentity: (boardId: string) => Promise<void>;

  // Build
  listPorts: () => Promise<void>;
  detectPio: () => Promise<void>;
  generateFirmware: (boardId: string) => Promise<GeneratedProject | null>;
  compileBoard: (boardId: string) => Promise<void>;
  flashBoard: (boardId: string, port: string) => Promise<void>;
  classifyPort: (boardId: string, port: SerialPort) => Promise<PortClassification>;
  exportArduinoSketch: (boardId: string) => Promise<{ path: string } | null>;
  exportPlatformioProject: (boardId: string) => Promise<{ path: string } | null>;

  // Build event handlers (called from event listeners)
  appendCompileLog: (event: BuildLogEvent) => void;
  setCompileStatus: (event: BuildStatusEvent) => void;
  appendFlashLog: (event: BuildLogEvent) => void;
  setFlashStatus: (event: BuildStatusEvent) => void;

  // Error
  clearError: () => void;
}

let revalidateTimer: ReturnType<typeof setTimeout> | null = null;

const EMPTY_BOARD_BUILD: BoardBuildState = {
  compileStatus: "idle",
  compileLogs: [],
  compiledAtVersion: null,
  flashStatus: "idle",
  flashLogs: [],
};

function boardBuildOf(get: () => ProjectStore, boardId: string): BoardBuildState {
  return get().boardBuild[boardId] ?? EMPTY_BOARD_BUILD;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  isDirty: false,
  currentPath: null,
  validationReport: null,
  pinMaps: {},
  projectVersion: 0,
  pio: { checked: false, available: false, version: null },
  boardBuild: {},
  serialPorts: [],
  error: null,

  newProject: async (name) => {
    try {
      const project = await api.projectNew(name);
      set({
        project,
        isDirty: false,
        currentPath: null,
        validationReport: null,
        pinMaps: {},
        projectVersion: 0,
        boardBuild: {},
      });
      await get().refreshAllPinMaps();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openProject: async () => {
    try {
      const opened = await api.openProjectDialog();
      if (!opened) return; // dialog cancelled
      set({
        project: opened.project,
        isDirty: false,
        currentPath: opened.path,
        validationReport: null,
        pinMaps: {},
        projectVersion: 0,
        boardBuild: {},
      });
      await Promise.all([get().revalidate(), get().refreshAllPinMaps()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveProject: async () => {
    const { project, currentPath } = get();
    if (!project) return;
    try {
      const saved = await api.saveProject(project, currentPath);
      if (!saved) return; // dialog cancelled
      set({ isDirty: false, currentPath: saved.path });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertPanel: async (panel) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.panelUpsert(project, panel);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deletePanel: async (id) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.panelDelete(project, id);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertBoard: async (board) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.boardUpsert(project, board);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      await get().refreshPinMap(board.id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteBoard: async (id) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.boardDelete(project, id);
      const pinMaps = { ...get().pinMaps };
      delete pinMaps[id];
      const boardBuild = { ...get().boardBuild };
      delete boardBuild[id];
      set((s) => ({
        project: updated,
        isDirty: true,
        pinMaps,
        boardBuild,
        projectVersion: s.projectVersion + 1,
      }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertControl: async (control) => {
    const { project } = get();
    if (!project) return;
    const previous = project.controls.find((c) => c.id === control.id);
    try {
      const updated = await api.controlUpsert(project, control);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      if (control.boardId) await get().refreshPinMap(control.boardId);
      if (previous?.boardId && previous.boardId !== control.boardId) {
        await get().refreshPinMap(previous.boardId);
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteControl: async (id) => {
    const { project } = get();
    if (!project) return;
    const control = project.controls.find((c) => c.id === id);
    try {
      const updated = await api.controlDelete(project, id);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      if (control && control.boardId) await get().refreshPinMap(control.boardId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  revalidate: async () => {
    const { project } = get();
    if (!project) return;
    try {
      const report = await api.validate(project);
      set({ validationReport: report });
    } catch (e) {
      console.warn("Validation failed:", e);
    }
  },

  refreshPinMap: async (boardId) => {
    const { project } = get();
    if (!project) return;
    try {
      const map = await api.boardPinmap(project, boardId);
      set((s) => ({ pinMaps: { ...s.pinMaps, [boardId]: map } }));
    } catch (e) {
      console.warn("Pin map refresh failed:", e);
    }
  },

  refreshAllPinMaps: async () => {
    const { project } = get();
    if (!project) return;
    await Promise.all(project.boards.map((b) => get().refreshPinMap(b.id)));
  },

  allocateIdentity: async (boardId) => {
    const { project } = get();
    if (!project) return;
    try {
      const [updated] = await api.allocateIdentity(project, boardId);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  listPorts: async () => {
    try {
      const ports = await api.listSerialPorts();
      set({ serialPorts: ports });
    } catch (e) {
      console.warn("Port list failed:", e);
    }
  },

  detectPio: async () => {
    try {
      const info = await api.detectPio();
      set({ pio: { checked: true, available: info.available, version: info.version } });
    } catch (e) {
      set({ pio: { checked: true, available: false, version: null }, error: String(e) });
    }
  },

  generateFirmware: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.generateBoard(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  compileBoard: async (boardId) => {
    const { project } = get();
    if (!project) return;
    set((s) => ({
      boardBuild: {
        ...s.boardBuild,
        [boardId]: { ...boardBuildOf(get, boardId), compileStatus: "compiling", compileLogs: [] },
      },
    }));
    try {
      await api.compileBoard(project, boardId);
    } catch (e) {
      set((s) => ({
        boardBuild: {
          ...s.boardBuild,
          [boardId]: { ...boardBuildOf(get, boardId), compileStatus: "error" },
        },
        error: String(e),
      }));
    }
  },

  flashBoard: async (boardId, port) => {
    const { project } = get();
    if (!project) return;
    set((s) => ({
      boardBuild: {
        ...s.boardBuild,
        [boardId]: { ...boardBuildOf(get, boardId), flashStatus: "flashing", flashLogs: [] },
      },
    }));
    try {
      await api.flashBoard(project, boardId, port);
    } catch (e) {
      set((s) => ({
        boardBuild: {
          ...s.boardBuild,
          [boardId]: { ...boardBuildOf(get, boardId), flashStatus: "error" },
        },
        error: String(e),
      }));
    }
  },

  classifyPort: async (boardId, port) => {
    const { project } = get();
    if (!project) return "unknown";
    try {
      return await api.classifyPort(project, boardId, port);
    } catch (e) {
      set({ error: String(e) });
      return "unknown";
    }
  },

  exportArduinoSketch: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.exportArduinoSketch(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  exportPlatformioProject: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.exportPlatformioProject(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  appendCompileLog: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            compileLogs: [
              ...board.compileLogs,
              { line: event.line, isErr: event.isErr, timestamp: Date.now() },
            ],
          },
        },
      };
    });
  },

  setCompileStatus: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            compileStatus: event.success ? "success" : "error",
            compiledAtVersion: event.success ? s.projectVersion : board.compiledAtVersion,
          },
        },
      };
    });
  },

  appendFlashLog: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            flashLogs: [
              ...board.flashLogs,
              { line: event.line, isErr: event.isErr, timestamp: Date.now() },
            ],
          },
        },
      };
    });
  },

  setFlashStatus: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: { ...board, flashStatus: event.success ? "success" : "error" },
        },
      };
    });
  },

  clearError: () => set({ error: null }),
}));

function scheduleRevalidate(get: () => ProjectStore) {
  if (revalidateTimer) clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => get().revalidate(), 300);
}
```

- [ ] **Step 2: Verify (expect App.tsx/BuildView.tsx breakage — fixed next)**

Run: `npx tsc --noEmit`
Expected: errors only in `src/App.tsx` (`appendBuildLog`/`setBuildStatus` no longer exist) and `src/views/BuildView.tsx` (still the old single-button UI, referencing removed store fields).

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "$(cat <<'EOF'
Rewrite store for per-board compile/flash state

Replaces the flat buildLogs/buildStatus with per-board
compileStatus/flashStatus tracking, a projectVersion counter used to
detect when a compiled build has gone stale, and pio/detect/classify/
export actions for the new staged Build view.
EOF
)"
```

---

## Task 14: Renderer — `App.tsx` wiring

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `setupCompileListeners`, `setupFlashListeners` (Task 12), `appendCompileLog`/`setCompileStatus`/`appendFlashLog`/`setFlashStatus` (Task 13).

- [ ] **Step 1: Update the import and the effect**

Replace:

```tsx
import { useEffect, useState } from "react";
import { setupBuildListeners } from "@/lib/events";
import { useProjectStore } from "@/store";
```

with:

```tsx
import { useEffect, useState } from "react";
import { setupCompileListeners, setupFlashListeners } from "@/lib/events";
import { useProjectStore } from "@/store";
```

Replace the component body's state/effect:

```tsx
  const { appendBuildLog, setBuildStatus } = useProjectStore();

  useEffect(() => {
    const unsub = setupBuildListeners({
      onLog: appendBuildLog,
      onStatus: setBuildStatus,
    });

    // electron-updater drives this now (download happens in the background);
    // the banner only appears once an update is available/downloaded.
    const offUpdate = window.api.onUpdateStatus(setUpdate);

    return () => {
      unsub.then((fn) => fn());
      offUpdate();
    };
  }, [appendBuildLog, setBuildStatus]);
```

with:

```tsx
  const { appendCompileLog, setCompileStatus, appendFlashLog, setFlashStatus } =
    useProjectStore();

  useEffect(() => {
    const unsubCompile = setupCompileListeners({
      onLog: appendCompileLog,
      onStatus: setCompileStatus,
    });
    const unsubFlash = setupFlashListeners({
      onLog: appendFlashLog,
      onStatus: setFlashStatus,
    });

    // electron-updater drives this now (download happens in the background);
    // the banner only appears once an update is available/downloaded.
    const offUpdate = window.api.onUpdateStatus(setUpdate);

    return () => {
      unsubCompile();
      unsubFlash();
      offUpdate();
    };
  }, [appendCompileLog, setCompileStatus, appendFlashLog, setFlashStatus]);
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors now isolated to `src/views/BuildView.tsx` only (Tasks 16–18 replace it).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Wire App.tsx to compile/flash event listeners"
```

---

## Task 15: Renderer — export shared labels/formatters (`BoardsView.tsx`, `ControlsView.tsx`)

Small prep step so the new Build UI can reuse existing board-type labels and validation-error formatting instead of duplicating them.

**Files:**
- Modify: `src/views/BoardsView.tsx`
- Modify: `src/views/ControlsView.tsx`

**Interfaces:**
- Produces: `export const BOARD_TYPES: { value: BoardType; label: string }[]` (from `BoardsView.tsx`), `export function formatError(e: { kind: string; [k: string]: unknown }): string` and `export function formatWarning(w: { kind: string; [k: string]: unknown }): string` (from `ControlsView.tsx`).

- [ ] **Step 1: Export `BOARD_TYPES`**

In `src/views/BoardsView.tsx`, change:

```ts
const BOARD_TYPES: { value: BoardType; label: string }[] = [
```

to:

```ts
export const BOARD_TYPES: { value: BoardType; label: string }[] = [
```

- [ ] **Step 2: Export `formatError`/`formatWarning`**

In `src/views/ControlsView.tsx`, change:

```ts
function formatError(e: { kind: string; [k: string]: unknown }): string {
```

to:

```ts
export function formatError(e: { kind: string; [k: string]: unknown }): string {
```

and:

```ts
function formatWarning(w: { kind: string; [k: string]: unknown }): string {
```

to:

```ts
export function formatWarning(w: { kind: string; [k: string]: unknown }): string {
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/views/BoardsView.tsx src/views/ControlsView.tsx`
Expected: no errors (adding `export` to already-used local names is a no-op for existing call sites).

- [ ] **Step 4: Commit**

```bash
git add src/views/BoardsView.tsx src/views/ControlsView.tsx
git commit -m "Export BOARD_TYPES/formatError/formatWarning for reuse in BuildView"
```

---

## Task 16: Renderer — `build/shared.tsx` and top-level `BuildView.tsx`

**Files:**
- Create: `src/views/build/shared.tsx`
- Modify: `src/views/BuildView.tsx` (full rewrite)

**Interfaces:**
- Produces: `export function LogPane({ logs: BuildLogLine[] }): JSX.Element`, `export function StatusBadge({ status: "idle"|"compiling"|"flashing"|"success"|"error"; activeLabel: string }): JSX.Element`. `BuildView` becomes a thin shell: PlatformIO banner + maps `project.boards` to `BoardBuildCard` (Task 17 creates that component — this task can compile with a placeholder-free stub since `BoardBuildCard` doesn't exist until Task 17; see Step 3).

- [ ] **Step 1: Create `src/views/build/shared.tsx`**

```tsx
import { useEffect, useRef } from "react";
import type { BuildLogLine } from "@/types";

export function LogPane({ logs }: { logs: BuildLogLine[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);

  return (
    <pre
      ref={ref}
      className="bg-[#0d1117] text-xs font-mono px-4 py-3 max-h-48 overflow-y-auto border-t border-[#30363d] whitespace-pre-wrap break-all leading-5"
    >
      {logs.map((l, i) => (
        <span key={i} className={l.isErr ? "text-[#f85149]" : "text-[#8b949e]"}>
          {l.line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

type Status = "idle" | "compiling" | "flashing" | "success" | "error";

const STATUS_STYLES: Record<"idle" | "active" | "success" | "error", string> = {
  idle: "bg-[#21262d] text-[#8b949e]",
  active: "bg-[#1f3a5f] text-[#58a6ff] animate-pulse",
  success: "bg-[#1e3a2e] text-[#3fb950]",
  error: "bg-[#3d1a1a] text-[#f85149]",
};

/** Status pill shared by the Build and Program stages. `activeLabel` is
 * "Compiling…" or "Flashing…" depending on which stage is rendering it. */
export function StatusBadge({ status, activeLabel }: { status: Status; activeLabel: string }) {
  const kind: keyof typeof STATUS_STYLES =
    status === "idle" ? "idle" : status === "success" ? "success" : status === "error" ? "error" : "active";
  const label =
    kind === "active" ? activeLabel : kind === "idle" ? "Idle" : kind === "success" ? "Success" : "Failed";
  return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[kind]}`}>{label}</span>;
}
```

- [ ] **Step 2: Replace `src/views/BuildView.tsx`**

Replace the full file contents with:

```tsx
import { useEffect } from "react";
import { useProjectStore } from "@/store";
import type { PioStatus } from "@/types";
import BoardBuildCard from "./build/BoardBuildCard";

export default function BuildView() {
  const { project, pio, listPorts, detectPio } = useProjectStore();

  useEffect(() => {
    listPorts();
    detectPio();
  }, [listPorts, detectPio]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[#484f58]">
        No project open
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Build &amp; Upload</h2>
        <button
          onClick={() => listPorts()}
          className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
        >
          Refresh Ports
        </button>
      </div>

      <PioBanner pio={pio} onRecheck={() => detectPio()} />

      {project.boards.length === 0 && (
        <div className="text-[#484f58] text-sm text-center py-8">
          No boards in project. Add boards in the Boards tab.
        </div>
      )}

      {project.boards.map((board) => (
        <BoardBuildCard key={board.id} board={board} />
      ))}
    </div>
  );
}

function PioBanner({ pio, onRecheck }: { pio: PioStatus; onRecheck: () => void }) {
  if (!pio.checked) {
    return (
      <div className="text-xs text-[#8b949e] px-3 py-2 rounded border border-[#30363d] bg-[#161b22]">
        Checking for PlatformIO…
      </div>
    );
  }

  if (pio.available) {
    return (
      <div className="text-xs text-[#3fb950] px-3 py-2 rounded border border-[#30363d] bg-[#161b22]">
        PlatformIO {pio.version ?? ""} detected.
      </div>
    );
  }

  return (
    <div className="text-xs px-3 py-2 rounded border border-[#3d1a1a] bg-[#161b22] space-y-1">
      <div className="text-[#f85149] font-medium">
        PlatformIO not found — Build and Program are unavailable until it's installed.
      </div>
      <div className="text-[#8b949e]">
        Install it with <code className="text-[#e6edf3]">pip install platformio</code> (or{" "}
        <code className="text-[#e6edf3]">pipx install platformio</code>), then recheck. See{" "}
        <a
          href="https://platformio.org/install/cli"
          target="_blank"
          rel="noreferrer"
          className="text-[#58a6ff] underline"
        >
          platformio.org/install/cli
        </a>{" "}
        for details.
      </div>
      <button
        onClick={onRecheck}
        className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
      >
        Recheck
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create a minimal `BoardBuildCard` stub so this task compiles standalone**

Create `src/views/build/BoardBuildCard.tsx` with a temporary minimal stub (Task 17 replaces this with the real Stage 1/2 implementation, Task 18 adds Stage 3 — this stub only exists so Task 16 is independently verifiable):

```tsx
import type { Board } from "@/types";

export default function BoardBuildCard({ board }: { board: Board }) {
  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#161b22] text-sm font-semibold">{board.name}</div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/views/BuildView.tsx src/views/build/shared.tsx src/views/build/BoardBuildCard.tsx`
Expected: no errors — this is the first point since Task 4 where the whole renderer typechecks cleanly again.

- [ ] **Step 5: Commit**

```bash
git add src/views/BuildView.tsx src/views/build/shared.tsx src/views/build/BoardBuildCard.tsx
git commit -m "$(cat <<'EOF'
Rewrite BuildView as a thin shell over per-board cards

Adds the PlatformIO detection banner. BoardBuildCard is a stub here
(full Stage 1/2 in the next commit, Stage 3 after) so this change is
independently typecheckable.
EOF
)"
```

---

## Task 17: Renderer — `BoardBuildCard.tsx` Stage 1 (Generate & Export) + Stage 2 (Build)

**Files:**
- Modify: `src/views/build/BoardBuildCard.tsx` (replaces Task 16's stub)

**Interfaces:**
- Consumes: `LogPane`, `StatusBadge` (Task 16), `BOARD_TYPES` (Task 15, from `@/views/BoardsView`), `formatError`, `formatWarning` (Task 15, from `@/views/ControlsView`), store fields `project`, `validationReport`, `pio`, `boardBuild`, `projectVersion`, actions `generateFirmware`, `exportArduinoSketch`, `exportPlatformioProject`, `compileBoard`.
- Produces: `export default function BoardBuildCard({ board }: { board: Board }): JSX.Element`. Stage 3 (Program) is added in Task 18 as a further edit to this same file.

- [ ] **Step 1: Replace `src/views/build/BoardBuildCard.tsx`**

```tsx
import { useState } from "react";
import { useProjectStore } from "@/store";
import { BOARD_TYPES } from "@/views/BoardsView";
import { formatError, formatWarning } from "@/views/ControlsView";
import type { Board, BuildLogLine } from "@/types";
import { LogPane, StatusBadge } from "./shared";

export default function BoardBuildCard({ board }: { board: Board }) {
  const { project, validationReport, pio, boardBuild, generateFirmware, exportArduinoSketch, exportPlatformioProject, compileBoard } =
    useProjectStore();

  const build = boardBuild[board.id] ?? {
    compileStatus: "idle" as const,
    compileLogs: [] as BuildLogLine[],
    compiledAtVersion: null as number | null,
    flashStatus: "idle" as const,
    flashLogs: [] as BuildLogLine[],
  };

  const relevantErrors = (validationReport?.errors ?? []).filter((e) => {
    if (e.boardId === board.id) return true;
    if (e.controlId) {
      return project?.controls.find((c) => c.id === e.controlId)?.boardId === board.id;
    }
    return false;
  });
  const relevantWarnings = (validationReport?.warnings ?? []).filter((w) => {
    if (!w.controlId) return false;
    return project?.controls.find((c) => c.id === w.controlId)?.boardId === board.id;
  });

  const buildVariant = board.type === "pro_micro" ? "sparkfun_promicro" : board.type;
  const envName = board.id.replace(/-/g, "_");
  const typeLabel = BOARD_TYPES.find((t) => t.value === board.type)?.label ?? board.type;

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [arduinoExportPath, setArduinoExportPath] = useState<string | null>(null);
  const [pioExportPath, setPioExportPath] = useState<string | null>(null);

  async function handleCopy() {
    const generated = await generateFirmware(board.id);
    const mainCpp = generated?.files.find((f) => f.relativePath === "src/main.cpp");
    if (!mainCpp) return;
    await navigator.clipboard.writeText(mainCpp.content);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1500);
  }

  async function handleExportArduino() {
    const result = await exportArduinoSketch(board.id);
    if (result) setArduinoExportPath(result.path);
  }

  async function handleExportPlatformio() {
    const result = await exportPlatformioProject(board.id);
    if (result) setPioExportPath(result.path);
  }

  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{board.name}</div>
          <div className="text-xs text-[#58a6ff] font-mono">
            {board.identity.usbProduct} — VID 0x
            {board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")} / PID 0x
            {board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
          </div>
        </div>
      </div>

      {/* Stage 1: Generate & Export */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-xs font-semibold text-[#8b949e]">Generate & Export</div>
        {relevantErrors.length > 0 ? (
          <div className="text-xs text-[#f85149] space-y-0.5">
            {relevantErrors.map((e, i) => (
              <div key={i}>✕ {formatError(e)}</div>
            ))}
            <div className="text-[#8b949e]">Resolve these in the Controls tab before generating.</div>
          </div>
        ) : (
          <>
            {relevantWarnings.length > 0 && (
              <div className="text-xs text-[#d29922] space-y-0.5">
                {relevantWarnings.map((w, i) => (
                  <div key={i}>⚠ {formatWarning(w)}</div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                {copyState === "copied" ? "Copied!" : "Copy firmware to clipboard"}
              </button>
              <button
                onClick={handleExportArduino}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                Export as Arduino sketch…
              </button>
              {arduinoExportPath && (
                <span className="text-xs text-[#3fb950]">Exported to {arduinoExportPath}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Stage 2: Build */}
      <div className="border-t border-[#30363d]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22]">
          <span className="text-xs font-semibold text-[#8b949e]">Build</span>
          <StatusBadge status={build.compileStatus} activeLabel="Compiling…" />
        </div>
        {!pio.available ? (
          <div className="px-4 py-3 text-xs text-[#484f58]">
            Requires PlatformIO — see the banner above.
          </div>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-[#8b949e]">
              Board type: {typeLabel} · Build variant: {buildVariant} · Env: {envName}
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
              <button
                onClick={() => compileBoard(board.id)}
                disabled={build.compileStatus === "compiling"}
                className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                  build.compileStatus === "compiling"
                    ? "bg-[#21262d] text-[#484f58] cursor-not-allowed"
                    : "bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                }`}
              >
                {build.compileStatus === "compiling" ? "Compiling…" : "Compile"}
              </button>
              <button
                onClick={handleExportPlatformio}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                Export PlatformIO Project…
              </button>
              {pioExportPath && (
                <span className="text-xs text-[#3fb950]">Exported to {pioExportPath}</span>
              )}
            </div>
            {build.compileStatus === "error" && (
              <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] space-y-2 text-xs">
                <div className="text-[#f85149]">
                  This wasn't caused by your panel design — it's likely an environment/toolchain
                  issue, or a bug in Sim Panel Manager's code generator.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(build.compileLogs.map((l) => l.line).join("\n"))
                    }
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
                  >
                    Copy log
                  </button>
                  <a
                    href={issueUrl(board.name, build.compileLogs)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#58a6ff]"
                  >
                    File an issue
                  </a>
                </div>
              </div>
            )}
            {build.compileLogs.length > 0 && <LogPane logs={build.compileLogs} />}
          </>
        )}
      </div>
    </div>
  );
}

function issueUrl(boardName: string, logs: BuildLogLine[]): string {
  const tail = logs
    .slice(-60)
    .map((l) => l.line)
    .join("\n");
  const title = encodeURIComponent(`Build failed for board "${boardName}"`);
  const body = encodeURIComponent(
    `Compiling the generated firmware for "${boardName}" failed. This looks like an environment/toolchain issue or a bug in Sim Panel Manager's code generator, not a problem with the panel design.\n\n\`\`\`\n${tail}\n\`\`\`\n`,
  );
  return `https://github.com/myclark/simpanman/issues/new?title=${title}&body=${body}`;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/views/build/BoardBuildCard.tsx`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Run: `make dev`
Open the app, load `examples/f5e-armament.spm` (File > Open), go to the Build tab. Expected: PlatformIO banner shows (available or not, depending on your machine); the Armament board card shows Generate & Export (Copy/Export buttons work) and Build (disabled if PlatformIO isn't on your machine, otherwise Compile works and streams a log). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/views/build/BoardBuildCard.tsx
git commit -m "Implement Generate & Export and Build stages in BoardBuildCard"
```

---

## Task 18: Renderer — `BoardBuildCard.tsx` Stage 3 (Program: detect, classify, flash)

**Files:**
- Modify: `src/views/build/BoardBuildCard.tsx`

**Interfaces:**
- Consumes: store's `serialPorts`, `listPorts`, `classifyPort`, `flashBoard`, `projectVersion`, `useProjectStore.getState()` (for reading fresh `serialPorts` inside the poll loop without a stale closure).
- Produces: the Program section, gated on a `canProgram` flag computed in this task from `build.compileStatus` and `build.compiledAtVersion` vs. `projectVersion`.

- [ ] **Step 1: Add imports and local state**

At the top of `src/views/build/BoardBuildCard.tsx`, change:

```tsx
import { useState } from "react";
import { useProjectStore } from "@/store";
import { BOARD_TYPES } from "@/views/BoardsView";
import { formatError, formatWarning } from "@/views/ControlsView";
import type { Board, BuildLogLine } from "@/types";
import { LogPane, StatusBadge } from "./shared";
```

to:

```tsx
import { useEffect, useState } from "react";
import { useProjectStore } from "@/store";
import { BOARD_TYPES } from "@/views/BoardsView";
import { formatError, formatWarning } from "@/views/ControlsView";
import type { Board, BuildLogLine, PortClassification, SerialPort } from "@/types";
import { LogPane, StatusBadge } from "./shared";
```

Inside the component, destructure the additional store fields — change:

```tsx
  const { project, validationReport, pio, boardBuild, generateFirmware, exportArduinoSketch, exportPlatformioProject, compileBoard } =
    useProjectStore();
```

to:

```tsx
  const {
    project,
    validationReport,
    pio,
    boardBuild,
    projectVersion,
    generateFirmware,
    exportArduinoSketch,
    exportPlatformioProject,
    compileBoard,
    serialPorts,
    listPorts,
    classifyPort,
    flashBoard,
  } = useProjectStore();
```

Add local state right after the `pioExportPath` state declaration:

```tsx
  const [pioExportPath, setPioExportPath] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [pollHandle, setPollHandle] = useState<ReturnType<typeof setInterval> | null>(null);
  const [detectedPort, setDetectedPort] = useState<SerialPort | null>(null);
  const [classification, setClassification] = useState<PortClassification | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle) clearInterval(pollHandle);
    };
  }, [pollHandle]);
```

Add the staleness/gating computation right after the `build` fallback object (before `relevantErrors`):

```tsx
  const isStale = build.compiledAtVersion !== null && build.compiledAtVersion !== projectVersion;
  const canProgram = build.compileStatus === "success" && !isStale;
```

- [ ] **Step 2: Add the detect/classify handlers**

Add these functions inside the component, after `handleExportPlatformio`:

```tsx
  async function startDetect() {
    setDetecting(true);
    setDetectedPort(null);
    setClassification(null);
    await listPorts();
    const baseline = useProjectStore.getState().serialPorts;

    const handle = setInterval(async () => {
      await listPorts();
      const current = useProjectStore.getState().serialPorts;
      const added = current.find((p) => !baseline.some((b) => b.name === p.name));
      if (added) {
        clearInterval(handle);
        setPollHandle(null);
        setDetecting(false);
        setDetectedPort(added);
        const result = await classifyPort(board.id, added);
        setClassification(result);
        if (result === "self" || result === "stock") {
          setSelectedPort(added.name);
        }
      }
    }, 1000);
    setPollHandle(handle);
  }

  function cancelDetect() {
    if (pollHandle) clearInterval(pollHandle);
    setPollHandle(null);
    setDetecting(false);
  }

  function confirmDetectedPort() {
    if (detectedPort) setSelectedPort(detectedPort.name);
  }

  function dismissDetectedPort() {
    setDetectedPort(null);
    setClassification(null);
  }
```

- [ ] **Step 3: Insert the Program section**

Replace the end of the component — the closing `</div>` (for Stage 2's outer `border-t` wrapper) followed by the final `</div>\n  );`:

```tsx
      </div>
    </div>
  );
```

(this is the last occurrence of that exact three-line sequence in the file, immediately before the `issueUrl` function) with:

```tsx
      {/* Stage 3: Program */}
      <div className="border-t border-[#30363d]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22]">
          <span className="text-xs font-semibold text-[#8b949e]">Program</span>
          <StatusBadge status={build.flashStatus} activeLabel="Flashing…" />
        </div>
        {!canProgram ? (
          <div className="px-4 py-3 text-xs text-[#484f58]">
            {isStale
              ? "The panel design changed since the last successful compile — recompile before programming."
              : "Requires a successful Build first."}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 bg-[#1c2333]">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-xs text-[#8b949e] shrink-0">Port:</label>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="flex-1 min-w-0 text-xs bg-[#21262d] border border-[#30363d] rounded px-2 py-1 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="">— Select a port —</option>
                  {serialPorts.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.description ? ` (${p.description})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={startDetect}
                disabled={detecting}
                className="px-3 py-1.5 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors shrink-0"
              >
                {detecting ? "Waiting for board…" : "Detect board"}
              </button>

              <button
                onClick={() => flashBoard(board.id, selectedPort)}
                disabled={!selectedPort || build.flashStatus === "flashing"}
                className={`px-4 py-1.5 text-sm rounded font-medium transition-colors shrink-0 ${
                  build.flashStatus === "flashing"
                    ? "bg-[#21262d] text-[#484f58] cursor-not-allowed"
                    : "bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                }`}
              >
                {build.flashStatus === "flashing" ? "Flashing…" : "Flash"}
              </button>
            </div>

            {detecting && (
              <div className="px-4 py-2 text-xs text-[#8b949e] flex items-center gap-2">
                Connect the board for &quot;{board.name}&quot; now…
                <button onClick={cancelDetect} className="underline">
                  Cancel
                </button>
              </div>
            )}

            {detectedPort && classification && (classification === "self" || classification === "stock") && (
              <div className="px-4 py-2 text-xs text-[#3fb950]">
                Detected {detectedPort.name} —{" "}
                {classification === "self"
                  ? "matches this board, ready to re-flash."
                  : "unflashed board, ready to program."}
              </div>
            )}

            {detectedPort && classification === "foreign" && (
              <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] space-y-2 text-xs">
                <div className="text-[#d29922]">
                  This board reports a Sim Panel Manager identity from another board/project (
                  {detectedPort.product ?? "unknown product"}, VID 0x
                  {detectedPort.vid?.toString(16).padStart(4, "0")} / PID 0x
                  {detectedPort.pid?.toString(16).padStart(4, "0")}). Continuing will overwrite it
                  with &quot;{board.name}&quot;'s firmware.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={confirmDetectedPort}
                    className="px-2 py-1 rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                  >
                    Yes, overwrite it
                  </button>
                  <button
                    onClick={dismissDetectedPort}
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {detectedPort && classification === "unknown" && (
              <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] space-y-2 text-xs">
                <div className="text-[#8b949e]">
                  Detected {detectedPort.name}
                  {detectedPort.description ? ` (${detectedPort.description})` : ""} — not
                  recognized as a stock or previously-programmed board.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={confirmDetectedPort}
                    className="px-2 py-1 rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                  >
                    Use this port
                  </button>
                  <button
                    onClick={dismissDetectedPort}
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {build.flashLogs.length > 0 && <LogPane logs={build.flashLogs} />}
          </>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/views/build/BoardBuildCard.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke check**

Run: `make dev`, load `examples/f5e-armament.spm`, go to Build. If PlatformIO is available on your machine: Compile, then in the Program section click "Detect board" — plug in (or unplug/replug) an Arduino to see the diffing flow resolve; verify the manual dropdown still works as a fallback; verify Flash is disabled until a port is selected. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/views/build/BoardBuildCard.tsx
git commit -m "Implement Program stage: plug-in detection, identity classification, flash"
```

---

## Task 19: Tests — extend `mock-api.ts` for the new IPC surface

**Files:**
- Modify: `tests/e2e/helpers/mock-api.ts`

**Interfaces:**
- Produces: `MockControl` gains `setPio(info: PioInfo)`, `setClassification(result: PortClassification)`, `compileCalls(): number`, `flashCalls(): number`. `window.api` mock gains `detectPio`, `compileBoard`, `flashBoard`, `classifyPort`, `exportArduinoSketch`, `exportPlatformioProject`, `onCompileLog`/`onCompileStatus`/`onFlashLog`/`onFlashStatus`. `WsHandle` gains `sendCompileLog`/`sendCompileStatus`/`sendFlashLog`/`sendFlashStatus` (replacing `sendLog`/`sendStatus`, which no longer have a channel to target).

- [ ] **Step 1: Update the top-level imports and `WsHandle`/`MockControl` interfaces**

In `tests/e2e/helpers/mock-api.ts`, replace:

```ts
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Project, SerialPort, ValidationReport } from "../../../src/types/index.js";
import { computePinMap } from "./project-fixtures.js";
```

with:

```ts
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type {
  PioInfo,
  PortClassification,
  Project,
  SerialPort,
  ValidationReport,
} from "../../../src/types/index.js";
import { computePinMap } from "./project-fixtures.js";
```

Replace the `WsHandle` interface:

```ts
export interface WsHandle {
  sendLog(boardId: string, line: string, isErr?: boolean): Promise<void>;
  sendStatus(boardId: string, success: boolean, exitCode?: number): Promise<void>;
}
```

with:

```ts
export interface WsHandle {
  sendCompileLog(boardId: string, line: string, isErr?: boolean): Promise<void>;
  sendCompileStatus(boardId: string, success: boolean, exitCode?: number): Promise<void>;
  sendFlashLog(boardId: string, line: string, isErr?: boolean): Promise<void>;
  sendFlashStatus(boardId: string, success: boolean, exitCode?: number): Promise<void>;
}
```

Replace the `MockControl` interface:

```ts
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
```

with:

```ts
export interface MockControl {
  /** Prime the next openProjectDialog() to return this .spm file's contents. */
  primeOpen(absPath: string): void;
  /** Override the report validate() returns (defaults to clean). */
  setValidate(report: ValidationReport): void;
  /** Override the serial ports listSerialPorts() returns. */
  setPorts(ports: SerialPort[]): void;
  /** Override the pio-version detection result (defaults to available). */
  setPio(info: PioInfo): void;
  /** Override the classifyPort() result (defaults to "unknown"). */
  setClassification(result: PortClassification): void;
  /** How many times listSerialPorts() has been invoked. */
  portListCalls(): number;
  /** How many times saveProject() has been invoked. */
  saveCalls(): number;
  /** How many times compileBoard() has been invoked. */
  compileCalls(): number;
  /** How many times flashBoard() has been invoked. */
  flashCalls(): number;
}
```

- [ ] **Step 2: Add mock state and bindings**

Inside the `mock` fixture, replace:

```ts
      let pendingOpen: { project: Project; path: string } | null = null;
      let validateOverride: ValidationReport | null = null;
      let portsOverride: SerialPort[] | null = null;
      let portListCalls = 0;
      let saveCalls = 0;
```

with:

```ts
      let pendingOpen: { project: Project; path: string } | null = null;
      let validateOverride: ValidationReport | null = null;
      let portsOverride: SerialPort[] | null = null;
      let pioOverride: PioInfo = { available: true, version: "6.1.13" };
      let classificationOverride: PortClassification = "unknown";
      let portListCalls = 0;
      let saveCalls = 0;
      let compileCalls = 0;
      let flashCalls = 0;
```

Add new `exposeFunction` bindings right after the existing `__spmPorts` one:

```ts
      await page.exposeFunction("__spmPio", (): PioInfo => pioOverride);
      await page.exposeFunction(
        "__spmClassify",
        (): PortClassification => classificationOverride,
      );
      await page.exposeFunction("__spmCompile", () => {
        compileCalls += 1;
      });
      await page.exposeFunction("__spmFlash", () => {
        flashCalls += 1;
      });
```

- [ ] **Step 3: Replace the `addInitScript` build-event plumbing and `window.api` build fields**

Inside `page.addInitScript`, replace:

```ts
        const logCbs: ((e: unknown) => void)[] = [];
        const statusCbs: ((e: unknown) => void)[] = [];
        (window as unknown as Record<string, unknown>).__emitBuildLog = (e: unknown) =>
          logCbs.forEach((cb) => cb(e));
        (window as unknown as Record<string, unknown>).__emitBuildStatus = (e: unknown) =>
          statusCbs.forEach((cb) => cb(e));
```

with:

```ts
        const compileLogCbs: ((e: unknown) => void)[] = [];
        const compileStatusCbs: ((e: unknown) => void)[] = [];
        const flashLogCbs: ((e: unknown) => void)[] = [];
        const flashStatusCbs: ((e: unknown) => void)[] = [];
        (window as unknown as Record<string, unknown>).__emitCompileLog = (e: unknown) =>
          compileLogCbs.forEach((cb) => cb(e));
        (window as unknown as Record<string, unknown>).__emitCompileStatus = (e: unknown) =>
          compileStatusCbs.forEach((cb) => cb(e));
        (window as unknown as Record<string, unknown>).__emitFlashLog = (e: unknown) =>
          flashLogCbs.forEach((cb) => cb(e));
        (window as unknown as Record<string, unknown>).__emitFlashStatus = (e: unknown) =>
          flashStatusCbs.forEach((cb) => cb(e));
```

Then replace the tail of the `window.api` object literal:

```ts
          listSerialPorts: () => w.__spmPorts(),
          buildBoard: () => defer(undefined),

          onBuildLog: (cb: (e: unknown) => void) => sub(logCbs, cb),
          onBuildStatus: (cb: (e: unknown) => void) => sub(statusCbs, cb),
          onUpdateStatus: () => () => {},
          installUpdate: () => Promise.resolve(),
          appVersion: () => Promise.resolve("0.0.0-test"),
        };
```

with:

```ts
          listSerialPorts: () => w.__spmPorts(),
          detectPio: () => w.__spmPio(),
          compileBoard: () => {
            w.__spmCompile();
            return defer(undefined);
          },
          flashBoard: () => {
            w.__spmFlash();
            return defer(undefined);
          },
          classifyPort: () => w.__spmClassify(),
          exportArduinoSketch: () => defer({ path: "/mock/exported-sketch" }),
          exportPlatformioProject: () => defer({ path: "/mock/exported-pio" }),

          onCompileLog: (cb: (e: unknown) => void) => sub(compileLogCbs, cb),
          onCompileStatus: (cb: (e: unknown) => void) => sub(compileStatusCbs, cb),
          onFlashLog: (cb: (e: unknown) => void) => sub(flashLogCbs, cb),
          onFlashStatus: (cb: (e: unknown) => void) => sub(flashStatusCbs, cb),
          onUpdateStatus: () => () => {},
          installUpdate: () => Promise.resolve(),
          appVersion: () => Promise.resolve("0.0.0-test"),
        };
```

- [ ] **Step 4: Update the `control` object and `ws` fixture**

Replace the `control: MockControl = { ... }` object:

```ts
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
```

with:

```ts
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
        setPio(info) {
          pioOverride = info;
        },
        setClassification(result) {
          classificationOverride = result;
        },
        portListCalls: () => portListCalls,
        saveCalls: () => saveCalls,
        compileCalls: () => compileCalls,
        flashCalls: () => flashCalls,
      };
```

Replace the `ws` fixture body:

```ts
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
```

with:

```ts
  ws: async ({ page }, use) => {
    const emit = (fn: string, boardId: string, extra: Record<string, unknown>) =>
      page.evaluate(
        ([f, payload]) =>
          (window as unknown as Record<string, (x: unknown) => void>)[f as string](payload),
        [fn, { boardId, ...extra }] as [string, Record<string, unknown>],
      );

    const handle: WsHandle = {
      sendCompileLog: (boardId, line, isErr = false) =>
        emit("__emitCompileLog", boardId, { line, isErr }),
      sendCompileStatus: (boardId, success, exitCode = success ? 0 : 1) =>
        emit("__emitCompileStatus", boardId, { success, exitCode }),
      sendFlashLog: (boardId, line, isErr = false) =>
        emit("__emitFlashLog", boardId, { line, isErr }),
      sendFlashStatus: (boardId, success, exitCode = success ? 0 : 1) =>
        emit("__emitFlashStatus", boardId, { success, exitCode }),
    };
    await use(handle);
  },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p tests/e2e/tsconfig.json 2>/dev/null || npx tsc --noEmit`
Expected: no type errors in `mock-api.ts`. (`tests/build-view.spec.ts`, still using the old `sendLog`/`sendStatus`/`buildBoard` API, is fixed in Task 20 — if your typecheck command covers test files and fails there, that's expected until then.)

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/mock-api.ts
git commit -m "$(cat <<'EOF'
Extend mock-api.ts for detect/compile/flash/export/classify

Replaces the single build:log/status mock channel with separate
compile and flash channels, matching the real preload bridge.
EOF
)"
```

---

## Task 20: Tests — rewrite `build-view.spec.ts`

**Files:**
- Modify: `tests/e2e/build-view.spec.ts` (full rewrite)

**Interfaces:**
- Consumes: `mock-api.ts` from Task 19.

- [ ] **Step 1: Replace the full file**

```ts
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
  }) => {
    await loadProjectAndGoToBuild(page, openProject);
    await page.getByRole("button", { name: "Compile" }).click();
    await page.evaluate(() => {}); // no-op to keep this test focused on classification
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
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test tests/e2e/build-view.spec.ts`
Expected: all tests pass. If the "foreign-identity" test is flaky around the plug-in-diffing poll timing, increase Playwright's default `expect` timeout for that one assertion (`await expect(...).toBeVisible({ timeout: 5000 })`) rather than adding real `sleep`s.

- [ ] **Step 3: Run the full e2e suite**

Run: `make test-e2e`
Expected: all suites pass — this also catches any other spec file that referenced the old `BuildStatus`/`buildBoard` mock surface (none currently do per the earlier repo-wide search, but this is the safety net).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/build-view.spec.ts
git commit -m "Rewrite build-view e2e tests for the 3-stage flow"
```

---

## Task 21: Docs — update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the native helper description**

Replace:

```
3. **Native helper** (`helper/`, Rust) — a one-shot CLI sidecar, `simpanman-helper`,
   spawned per-operation by `electron/helper.ts` (never long-running). Two
   subcommands: `list-ports` (serial enumeration → JSON) and `build --project-dir
   --env [--port]` (the 32u4 1200-baud bootloader touch + `pio run -t upload`,
   streaming NDJSON `{type: "log"|"status", ...}` lines on stdout that `helper.ts`
   parses back into the callback shape `ipc.ts` forwards to the renderer). Kept
   separate from the main process specifically to avoid Electron native-module
   rebuild pain around serialport/HID — do not pull serial/HID logic into
   `electron/` or `src/`.
```

with:

```
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
```

- [ ] **Step 2: Update the data-flow paragraph**

Replace:

```
Data flow for a build: renderer calls `window.api.buildBoard(...)` → IPC `build:run` →
validate → codegen (engine, pure) → emit to temp dir → spawn helper → NDJSON parsed →
`build:log`/`build:status` pushed to renderer.
```

with:

```
Data flow for a build: renderer calls `window.api.compileBoard(...)` or `.flashBoard(...)`
→ IPC `build:compile`/`build:flash` → validate → codegen (engine, pure) → write into a
persistent per-board directory (`userData/builds/<boardId>`, not a fresh temp dir — lets
PlatformIO's `.pio` cache carry over between a compile and a later flash) → spawn helper →
NDJSON parsed → `build:compileLog`/`build:compileStatus` or `build:flashLog`/
`build:flashStatus` pushed to renderer. See
`docs/superpowers/specs/2026-07-04-staged-build-process-design.md` for the full three-stage
(Generate & Export / Build / Program) design.
```

- [ ] **Step 3: Update the `emitter.ts` one-liner in the engine file list**

Replace:

```
   - `emitter.ts` — writes a `GeneratedProject` to a temp dir for the build step
```

with:

```
   - `emitter.ts` — writes a `GeneratedProject` to a persistent per-board build dir
   - `portMatch.ts` — classifies a detected serial port against a board's identity
   - `arduinoExport.ts` — transforms a generated project into an Arduino-IDE sketch
```

- [ ] **Step 4: Verify by reading it back**

Run: `grep -n "build:run\|writeToTempDir\|buildBoard" CLAUDE.md`
Expected: no matches (all stale references removed).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for the staged build process"
```

---

## Task 22: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Rust**

Run: `cargo test --manifest-path helper/Cargo.toml && cargo clippy --manifest-path helper/Cargo.toml -- -D warnings`
Expected: all pass, no warnings.

- [ ] **Step 2: Engine**

Run: `make test` (or `npx vitest run`)
Expected: all pass, including the new `portMatch`, `emitter`, and `arduinoExport` suites, and no regressions in `codegen.test.ts`/`commands.test.ts`/`identity.test.ts`/`pins.test.ts`/`validation.test.ts`.

- [ ] **Step 3: Lint and typecheck**

Run: `make lint`
Expected: eslint + `tsc --noEmit` (renderer & electron) + cargo clippy all clean.

- [ ] **Step 4: Full build**

Run: `make build`
Expected: renderer + electron main/preload + helper all build successfully.

- [ ] **Step 5: e2e**

Run: `make test-e2e`
Expected: all Playwright specs pass, including the rewritten `build-view.spec.ts`.

- [ ] **Step 6: Manual end-to-end walkthrough**

Run: `make dev`. With `examples/f5e-armament.spm` loaded, on the Build tab:
1. Confirm the PlatformIO banner reflects your machine's actual state.
2. Generate & Export: copy firmware to clipboard, paste it somewhere and confirm it's the rendered `main.cpp`; export an Arduino sketch to a scratch folder and confirm `<name>.ino` + `README.txt` appear.
3. If PlatformIO is installed locally: Compile the board, confirm the log streams and the badge goes to Success; export a PlatformIO project and confirm the folder has `platformio.ini`/`src/main.cpp`/`boards/*.json`.
4. Edit a control's pin assignment (Controls tab), return to Build, confirm the Program section now says the build is stale and re-requires a Compile.
5. If you have a real 32u4 board: plug it in, click "Detect board," confirm it's found and classified, then Flash and confirm the board enumerates correctly afterward.

Expected: every step above behaves as described; note any deviation and fix before considering this plan complete.

- [ ] **Step 7: Final commit (if Step 6 required fixes)**

If Step 6 uncovered issues, fix them, re-run the relevant verification steps, and commit:

```bash
git add -A
git commit -m "Fix issues found in staged build process manual walkthrough"
```

If Step 6 required no fixes, there is nothing to commit for this task.
