use tokio::sync::broadcast;

use crate::build::runner::{self, ServerEvent};
use crate::build::ports::SerialPort;
use crate::codegen::{emitter::GeneratedProject, render};
use crate::identity::registry;
use crate::model::{
    project as proj,
    types::{Board, BoardIdentity, Control, Panel, Project},
    validation::{validate as do_validate, ValidationReport},
};
use crate::pins::allocator::{compute_pin_map, PinMap};

// ── Project file operations ──────────────────────────────────────────────────

pub fn project_new(name: String) -> Result<Project, String> {
    Ok(proj::new_project(name))
}

/// Parse a project from raw `.spm` file contents uploaded by the browser.
pub fn project_open(content: String) -> Result<Project, String> {
    proj::parse_project(&content).map_err(|e| e.to_string())
}

/// Serialize a project to canonical JSON for the browser to download as a `.spm`.
pub fn project_serialize(project: Project) -> Result<String, String> {
    proj::serialize_project(&project).map_err(|e| e.to_string())
}

// ── Panel mutations ───────────────────────────────────────────────────────────

pub fn panel_upsert(mut project: Project, panel: Panel) -> Result<Project, String> {
    if let Some(existing) = project.panels.iter_mut().find(|p| p.id == panel.id) {
        *existing = panel;
    } else {
        project.panels.push(panel);
    }
    Ok(project)
}

pub fn panel_delete(mut project: Project, panel_id: String) -> Result<Project, String> {
    project.panels.retain(|p| p.id != panel_id);
    project.controls.retain(|c| c.panel_id() != panel_id);
    Ok(project)
}

// ── Board mutations ────────────────────────────────────────────────────────────

pub fn board_upsert(mut project: Project, board: Board) -> Result<Project, String> {
    if let Some(existing) = project.boards.iter_mut().find(|b| b.id == board.id) {
        *existing = board;
    } else {
        project.boards.push(board);
    }
    Ok(project)
}

pub fn board_delete(mut project: Project, board_id: String) -> Result<Project, String> {
    project.boards.retain(|b| b.id != board_id);
    project.controls.retain(|c| c.board_id() != board_id);
    Ok(project)
}

// ── Control mutations ──────────────────────────────────────────────────────────

pub fn control_upsert(mut project: Project, control: Control) -> Result<Project, String> {
    let id = control.id().to_string();
    if let Some(existing) = project.controls.iter_mut().find(|c| c.id() == id) {
        *existing = control;
    } else {
        project.controls.push(control);
    }
    Ok(project)
}

pub fn control_delete(mut project: Project, control_id: String) -> Result<Project, String> {
    project.controls.retain(|c| c.id() != control_id);
    Ok(project)
}

// ── Validation & pin allocation ────────────────────────────────────────────────

pub fn validate(project: Project) -> Result<ValidationReport, String> {
    Ok(do_validate(&project))
}

pub fn board_pinmap(project: Project, board_id: String) -> Result<PinMap, String> {
    Ok(compute_pin_map(&project, &board_id))
}

pub fn allocate_identity(
    mut project: Project,
    board_id: String,
) -> Result<(Project, BoardIdentity), String> {
    let identity = registry::allocate_identity(&mut project, &board_id)
        .map_err(|e| e.to_string())?;
    Ok((project, identity))
}

// ── Codegen ────────────────────────────────────────────────────────────────────

pub fn generate_board(project: Project, board_id: String) -> Result<GeneratedProject, String> {
    let generated_board =
        render::render_board(&project, &board_id).map_err(|e| e.to_string())?;
    Ok(crate::codegen::emitter::to_generated_project(
        &board_id,
        generated_board,
    ))
}

// ── Serial ports ───────────────────────────────────────────────────────────────

pub fn list_serial_ports() -> Result<Vec<SerialPort>, String> {
    Ok(crate::build::ports::list_serial_ports())
}

// ── Build & upload ─────────────────────────────────────────────────────────────

pub async fn build_board(
    tx: broadcast::Sender<ServerEvent>,
    project: Project,
    board_id: String,
    port: Option<String>,
) -> Result<(), String> {
    runner::build_board(tx, project, board_id, port)
        .await
        .map_err(|e| e.to_string())
}
