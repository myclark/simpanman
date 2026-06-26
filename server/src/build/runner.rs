use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::broadcast;

use crate::codegen::{emitter, render};
use crate::model::{types::Project, validation::validate};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildLogEvent {
    pub board_id: String,
    pub line: String,
    pub is_err: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildStatusEvent {
    pub board_id: String,
    pub success: bool,
    pub exit_code: i32,
}

/// Events streamed to connected browser clients over the `/api/events` WebSocket.
/// Serializes as `{ "event": "build://log", "payload": { ... } }` so the frontend
/// can dispatch by `event` exactly as it did with Tauri's named events.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "event", content = "payload")]
pub enum ServerEvent {
    #[serde(rename = "build://log")]
    BuildLog(BuildLogEvent),
    #[serde(rename = "build://status")]
    BuildStatus(BuildStatusEvent),
}

pub async fn build_board(
    tx: broadcast::Sender<ServerEvent>,
    project: Project,
    board_id: String,
    port: Option<String>,
) -> anyhow::Result<()> {
    let report = validate(&project);
    if !report.errors.is_empty() {
        let first = format!("{:?}", report.errors[0]);
        anyhow::bail!("Validation errors must be resolved before building. First: {}", first);
    }

    let board = project
        .boards
        .iter()
        .find(|b| b.id == board_id)
        .ok_or_else(|| anyhow::anyhow!("Board '{}' not found", board_id))?;
    let env_name = board.id.replace('-', "_");

    emit_log(&tx, &board_id, format!("Generating firmware for '{}'...", board.name), false);

    let generated_board = render::render_board(&project, &board_id)
        .context("firmware generation")?;
    let generated = emitter::to_generated_project(&board_id, generated_board);
    let project_dir = emitter::write_to_temp_dir(&generated)
        .context("writing PlatformIO project")?;

    emit_log(&tx, &board_id, format!("Project written to {}", project_dir.display()), false);

    if let Some(ref port_name) = port {
        emit_log(&tx, &board_id, format!("Triggering bootloader on {}...", port_name), false);
        if let Err(e) = super::bootloader::trigger_reset(port_name) {
            emit_log(&tx, &board_id, format!("Warning: bootloader reset failed: {e}"), true);
        } else {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    emit_log(&tx, &board_id, "Running PlatformIO build + upload...".to_string(), false);

    let project_dir_str = project_dir.to_string_lossy().to_string();
    let mut args: Vec<&str> = vec!["run", "-e", &env_name, "-t", "upload", "--project-dir", &project_dir_str];
    if let Some(ref port_name) = port {
        args.push("--upload-port");
        args.push(port_name.as_str());
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
    let tx_out = tx.clone();
    let board_out = board_id.clone();
    let out_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_log(&tx_out, &board_out, line, false);
        }
    });
    let tx_err = tx.clone();
    let board_err = board_id.clone();
    let err_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_log(&tx_err, &board_err, line, true);
        }
    });

    let status = child.wait().await.context("waiting for PlatformIO process")?;
    let _ = out_task.await;
    let _ = err_task.await;
    let exit_code = status.code().unwrap_or(-1);

    let success = exit_code == 0;
    emit_log(
        &tx,
        &board_id,
        if success {
            "Build and upload complete.".to_string()
        } else {
            format!("Build failed with exit code {}.", exit_code)
        },
        !success,
    );

    tx.send(ServerEvent::BuildStatus(BuildStatusEvent {
        board_id: board_id.clone(),
        success,
        exit_code,
    }))
    .ok();

    if success {
        Ok(())
    } else {
        Err(anyhow::anyhow!("PlatformIO exited with code {}", exit_code))
    }
}

fn emit_log(tx: &broadcast::Sender<ServerEvent>, board_id: &str, line: String, is_err: bool) {
    tx.send(ServerEvent::BuildLog(BuildLogEvent {
        board_id: board_id.to_string(),
        line,
        is_err,
    }))
    .ok();
}

/// Build a `Command` for the bundled PlatformIO executable. In release builds it
/// lives next to the server binary; `SIMPANMAN_PIO` overrides the path for dev.
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
    exe_dir.join(name)
}
