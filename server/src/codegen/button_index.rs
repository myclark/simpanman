use std::collections::HashMap;

use crate::model::types::{Control, EncoderMode, Project};

/// Returns (control_id, sub_index) → 0-based joystick button number.
/// Stable: sorted by label then id. Encoders contribute 2 buttons (CW=0, CCW=1).
/// Switches contribute 2 buttons (ON=0, OFF=1). Selectors contribute N buttons (one per position).
pub fn assign_button_indices(
    project: &Project,
    board_id: &str,
) -> HashMap<(String, usize), u32> {
    let mut controls: Vec<&Control> = project
        .controls
        .iter()
        .filter(|c| c.board_id() == board_id)
        .collect();

    controls.sort_by(|a, b| a.label().cmp(b.label()).then(a.id().cmp(b.id())));

    let mut map = HashMap::new();
    let mut next_button: u32 = 0;

    for control in controls {
        let id = control.id().to_string();
        let count = button_count(control);
        for sub in 0..count {
            map.insert((id.clone(), sub), next_button);
            next_button += 1;
        }
    }

    map
}

pub fn total_button_count(project: &Project, board_id: &str) -> u32 {
    project
        .controls
        .iter()
        .filter(|c| c.board_id() == board_id)
        .map(|c| button_count(c) as u32)
        .sum()
}

fn button_count(control: &Control) -> usize {
    match control {
        Control::Button(_) => 1,
        Control::Switch(_) => 2,
        Control::Selector(s) => s.positions.len(),
        Control::Encoder(e) => match e.encoder.mode {
            EncoderMode::Buttons => 2,
            EncoderMode::Axis => 0,
        },
        Control::Analog(_) => 0,
    }
}
