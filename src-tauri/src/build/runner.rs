use std::time::Duration;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

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

pub async fn build_board(
    app: AppHandle,
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

    emit_log(&app, &board_id, format!("Generating firmware for '{}'...", board.name), false);

    let generated_board = render::render_board(&project, &board_id)
        .context("firmware generation")?;
    let generated = emitter::to_generated_project(&board_id, generated_board);
    let project_dir = emitter::write_to_temp_dir(&generated)
        .context("writing PlatformIO project")?;

    emit_log(&app, &board_id, format!("Project written to {}", project_dir.display()), false);

    if let Some(ref port_name) = port {
        emit_log(&app, &board_id, format!("Triggering bootloader on {}...", port_name), false);
        if let Err(e) = super::bootloader::trigger_reset(port_name) {
            emit_log(&app, &board_id, format!("Warning: bootloader reset failed: {e}"), true);
        } else {
            std::thread::sleep(Duration::from_millis(500));
        }
    }

    emit_log(&app, &board_id, "Running PlatformIO build + upload...".to_string(), false);

    let mut args = vec!["run", "-e", &env_name, "-t", "upload"];
    let project_dir_str = project_dir.to_string_lossy().to_string();
    args.extend(["--project-dir", &project_dir_str]);
    if let Some(ref port_name) = port {
        args.extend(["--upload-port", port_name]);
    }

    let sidecar = app
        .shell()
        .sidecar("pio")
        .context("creating PIO sidecar command")?;

    let (mut rx, _child) = sidecar
        .args(&args)
        .spawn()
        .context("spawning PIO sidecar")?;

    use tauri_plugin_shell::process::CommandEvent;
    let mut exit_code = -1;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line).to_string();
                emit_log(&app, &board_id, text, false);
            }
            CommandEvent::Stderr(line) => {
                let text = String::from_utf8_lossy(&line).to_string();
                emit_log(&app, &board_id, text, true);
            }
            CommandEvent::Terminated(status) => {
                exit_code = status.code.unwrap_or(-1);
                break;
            }
            CommandEvent::Error(e) => {
                emit_log(&app, &board_id, format!("Process error: {e}"), true);
                break;
            }
            _ => {}
        }
    }

    let success = exit_code == 0;
    emit_log(
        &app,
        &board_id,
        if success {
            "Build and upload complete.".to_string()
        } else {
            format!("Build failed with exit code {}.", exit_code)
        },
        !success,
    );

    app.emit(
        "build://status",
        BuildStatusEvent {
            board_id: board_id.clone(),
            success,
            exit_code,
        },
    )
    .ok();

    if success {
        Ok(())
    } else {
        Err(anyhow::anyhow!("PlatformIO exited with code {}", exit_code))
    }
}

fn emit_log(app: &AppHandle, board_id: &str, line: String, is_err: bool) {
    app.emit(
        "build://log",
        BuildLogEvent {
            board_id: board_id.to_string(),
            line,
            is_err,
        },
    )
    .ok();
}
