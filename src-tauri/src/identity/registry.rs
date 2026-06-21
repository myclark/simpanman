use crate::model::types::{BoardIdentity, Project};

const DEFAULT_VID: u32 = 0x1209;
const PROTOTYPING_MAX_PID: u32 = 0x000F;
const ALLOCATION_START_PID: u32 = 0x0010;
const MAX_PID: u32 = 0xFFFF;

pub fn allocate_identity(
    project: &mut Project,
    board_id: &str,
) -> anyhow::Result<BoardIdentity> {
    let board = project
        .boards
        .iter()
        .find(|b| b.id == board_id)
        .ok_or_else(|| anyhow::anyhow!("Board '{}' not found", board_id))?;

    // If already allocated, return as-is (idempotent)
    if board.identity.usb_pid > PROTOTYPING_MAX_PID {
        return Ok(board.identity.clone());
    }

    let used_pids: std::collections::HashSet<u32> = project
        .boards
        .iter()
        .filter(|b| b.id != board_id)
        .map(|b| b.identity.usb_pid)
        .collect();

    let next_pid = (ALLOCATION_START_PID..=MAX_PID)
        .find(|pid| !used_pids.contains(pid))
        .ok_or_else(|| anyhow::anyhow!("No free PIDs available (0x{:04X}–0x{:04X} all used)", ALLOCATION_START_PID, MAX_PID))?;

    let board_name = project
        .boards
        .iter()
        .find(|b| b.id == board_id)
        .map(|b| b.name.clone())
        .unwrap();

    let identity = BoardIdentity {
        usb_product: board_name,
        usb_vid: DEFAULT_VID,
        usb_pid: next_pid,
        serial: None,
    };

    if let Some(board) = project.boards.iter_mut().find(|b| b.id == board_id) {
        board.identity = identity.clone();
    }

    Ok(identity)
}

#[allow(dead_code)]
pub fn check_uniqueness(project: &Project) -> Vec<String> {
    let mut seen: std::collections::HashMap<(u32, u32), &str> = std::collections::HashMap::new();
    let mut conflicts = Vec::new();

    for board in &project.boards {
        let key = (board.identity.usb_vid, board.identity.usb_pid);
        if let Some(prev_name) = seen.get(&key) {
            conflicts.push(format!(
                "Boards '{}' and '{}' share VID=0x{:04X} PID=0x{:04X}",
                prev_name, board.name, key.0, key.1
            ));
        } else {
            seen.insert(key, &board.name);
        }
    }

    conflicts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::project::load_project;
    use std::path::Path;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("examples")
            .join(name)
    }

    #[test]
    fn allocation_assigns_unique_pids() {
        let mut project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        // Fixture boards use prototyping PIDs (1, 2, 3) — allocate fresh ones
        for board_id in ["board-a", "board-b", "board-c"] {
            allocate_identity(&mut project, board_id).unwrap();
        }
        let conflicts = check_uniqueness(&project);
        assert!(conflicts.is_empty(), "PID conflicts: {:?}", conflicts);
    }

    #[test]
    fn allocation_is_idempotent_above_prototyping_range() {
        let mut project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let first = allocate_identity(&mut project, "board-a").unwrap();
        let second = allocate_identity(&mut project, "board-a").unwrap();
        assert_eq!(first.usb_pid, second.usb_pid);
    }

    #[test]
    fn fixture_pids_are_unique() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let conflicts = check_uniqueness(&project);
        assert!(conflicts.is_empty());
    }
}
