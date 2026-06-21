use tauri::AppHandle;

use crate::build::{ports::SerialPort, runner};
use crate::codegen::{emitter::GeneratedProject, render};
use crate::identity::registry;
use crate::model::{
    project as proj,
    types::{Board, BoardIdentity, Control, Panel, Project},
    validation::{validate as do_validate, ValidationReport},
};
use crate::pins::allocator::{compute_pin_map, PinMap};

// ── Project file operations ──────────────────────────────────────────────────

#[tauri::command]
pub fn project_new(name: String) -> Result<Project, String> {
    Ok(proj::new_project(name))
}

#[tauri::command]
pub fn project_open(path: String) -> Result<Project, String> {
    proj::load_project(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_save(path: String, project: Project) -> Result<(), String> {
    proj::save_project(std::path::Path::new(&path), &project).map_err(|e| e.to_string())
}

// ── Panel mutations ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn panel_upsert(mut project: Project, panel: Panel) -> Result<Project, String> {
    if let Some(existing) = project.panels.iter_mut().find(|p| p.id == panel.id) {
        *existing = panel;
    } else {
        project.panels.push(panel);
    }
    Ok(project)
}

#[tauri::command]
pub fn panel_delete(mut project: Project, panel_id: String) -> Result<Project, String> {
    project.panels.retain(|p| p.id != panel_id);
    project.controls.retain(|c| c.panel_id() != panel_id);
    Ok(project)
}

// ── Board mutations ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn board_upsert(mut project: Project, board: Board) -> Result<Project, String> {
    if let Some(existing) = project.boards.iter_mut().find(|b| b.id == board.id) {
        *existing = board;
    } else {
        project.boards.push(board);
    }
    Ok(project)
}

#[tauri::command]
pub fn board_delete(mut project: Project, board_id: String) -> Result<Project, String> {
    project.boards.retain(|b| b.id != board_id);
    project.controls.retain(|c| c.board_id() != board_id);
    Ok(project)
}

// ── Control mutations ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn control_upsert(mut project: Project, control: Control) -> Result<Project, String> {
    let id = control.id().to_string();
    if let Some(existing) = project.controls.iter_mut().find(|c| c.id() == id) {
        *existing = control;
    } else {
        project.controls.push(control);
    }
    Ok(project)
}

#[tauri::command]
pub fn control_delete(mut project: Project, control_id: String) -> Result<Project, String> {
    project.controls.retain(|c| c.id() != control_id);
    Ok(project)
}

// ── Validation & pin allocation ────────────────────────────────────────────────

#[tauri::command]
pub fn validate(project: Project) -> Result<ValidationReport, String> {
    Ok(do_validate(&project))
}

#[tauri::command]
pub fn board_pinmap(project: Project, board_id: String) -> Result<PinMap, String> {
    Ok(compute_pin_map(&project, &board_id))
}

#[tauri::command]
pub fn allocate_identity(
    mut project: Project,
    board_id: String,
) -> Result<(Project, BoardIdentity), String> {
    let identity = registry::allocate_identity(&mut project, &board_id)
        .map_err(|e| e.to_string())?;
    Ok((project, identity))
}

// ── Codegen ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn generate_board(project: Project, board_id: String) -> Result<GeneratedProject, String> {
    let generated_board =
        render::render_board(&project, &board_id).map_err(|e| e.to_string())?;
    Ok(crate::codegen::emitter::to_generated_project(
        &board_id,
        generated_board,
    ))
}

// ── Serial ports ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPort>, String> {
    Ok(crate::build::ports::list_serial_ports())
}

// ── Build & upload ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn build_board(
    app: AppHandle,
    project: Project,
    board_id: String,
    port: Option<String>,
) -> Result<(), String> {
    runner::build_board(app, project, board_id, port)
        .await
        .map_err(|e| e.to_string())
}
