//! PlatformIO build/upload runner. Takes an already-generated project directory
//! (codegen happens in the TypeScript engine) and streams progress to stdout as
//! line-delimited JSON (NDJSON) the Electron main process parses.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use anyhow::Context;

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

/// Run `pio run -e <env> -t upload` for a generated project directory. Returns
/// whether the build succeeded; also emits a terminal status event.
pub fn build_board(project_dir: &str, env_name: &str, port: Option<&str>) -> anyhow::Result<bool> {
    // 32u4 upload gotcha: trigger the bootloader with a 1200-baud touch first so
    // the Leonardo/Micro re-enumerates before PlatformIO uploads.
    if let Some(p) = port {
        emit_log(&format!("Triggering bootloader on {p}..."), false);
        match bootloader::trigger_reset(p) {
            Ok(()) => thread::sleep(Duration::from_millis(500)),
            Err(e) => emit_log(&format!("Warning: bootloader reset failed: {e}"), true),
        }
    }

    emit_log("Running PlatformIO build + upload...", false);

    let mut args: Vec<String> = vec![
        "run".into(),
        "-e".into(),
        env_name.into(),
        "-t".into(),
        "upload".into(),
        "--project-dir".into(),
        project_dir.into(),
    ];
    if let Some(p) = port {
        args.push("--upload-port".into());
        args.push(p.into());
    }

    let mut child = pio_command()
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawning PlatformIO process")?;

    let stdout = child.stdout.take().context("capturing PlatformIO stdout")?;
    let stderr = child.stderr.take().context("capturing PlatformIO stderr")?;

    // Stream stdout and stderr concurrently so logs interleave in real time.
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
    emit_log(
        if success {
            "Build and upload complete."
        } else {
            "Build failed."
        },
        !success,
    );
    emit_status(success, exit_code);

    Ok(success)
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
