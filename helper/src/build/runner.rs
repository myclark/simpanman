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
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.rsplit(' ').next().map(|s| s.to_string())
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
