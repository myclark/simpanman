use std::path::Path;

use anyhow::Context;

use super::migrations::migrate;
use super::types::{Board, BoardIdentity, BoardType, Panel, Project, CURRENT_SCHEMA_VERSION};

pub fn new_project(name: String) -> Project {
    Project {
        schema_version: CURRENT_SCHEMA_VERSION,
        name,
        notes: None,
        panels: vec![Panel {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Panel 1".to_string(),
            order: 0,
            layout: None,
        }],
        boards: vec![Board {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Board 1".to_string(),
            board_type: BoardType::Leonardo,
            identity: BoardIdentity {
                usb_product: "Board 1".to_string(),
                usb_vid: 0x1209,
                usb_pid: 0x0010,
                serial: None,
            },
        }],
        controls: vec![],
    }
}

pub fn load_project(path: &Path) -> anyhow::Result<Project> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    parse_project(&content).with_context(|| format!("parsing {}", path.display()))
}

pub fn save_project(path: &Path, project: &Project) -> anyhow::Result<()> {
    let content = serialize_project(project)?;
    std::fs::write(path, content)
        .with_context(|| format!("writing {}", path.display()))?;
    Ok(())
}

/// Parse a `.spm` project from its raw JSON text and run schema migrations.
/// Used by the HTTP layer when the browser uploads a project file's contents.
pub fn parse_project(content: &str) -> anyhow::Result<Project> {
    let project: Project = serde_json::from_str(content).context("parsing project JSON")?;
    migrate(project)
}

/// Serialize a project to canonical pretty JSON for the browser to download.
pub fn serialize_project(project: &Project) -> anyhow::Result<String> {
    serde_json::to_string_pretty(project).context("serializing project")
}
