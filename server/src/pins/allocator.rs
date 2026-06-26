use serde::{Deserialize, Serialize};

use crate::model::types::Project;
use crate::model::validation::collect_pins;

use super::profile::profile_for;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsedPin {
    pub pin: String,
    pub control_id: String,
    pub control_label: String,
    pub control_kind: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PinMap {
    pub board_id: String,
    pub used: Vec<UsedPin>,
    pub free: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn compute_pin_map(project: &Project, board_id: &str) -> PinMap {
    let board = match project.boards.iter().find(|b| b.id == board_id) {
        Some(b) => b,
        None => {
            return PinMap {
                board_id: board_id.to_string(),
                used: vec![],
                free: vec![],
                warnings: vec![format!("Board '{board_id}' not found")],
            }
        }
    };

    let profile = profile_for(&board.board_type);
    let board_controls: Vec<_> = project
        .controls
        .iter()
        .filter(|c| c.board_id() == board_id)
        .collect();

    let mut used: Vec<UsedPin> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut seen_pins: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for control in &board_controls {
        let base = control.base();
        let kind = kind_label(control);
        let pins = collect_pins(control);

        for pin in pins {
            let idx = used.len();
            if let Some(prev_idx) = seen_pins.get(&pin) {
                warnings.push(format!(
                    "Pin {} is double-booked between '{}' and '{}'",
                    pin, used[*prev_idx].control_label, base.label
                ));
            } else {
                seen_pins.insert(pin.clone(), idx);
            }
            used.push(UsedPin {
                pin,
                control_id: base.id.clone(),
                control_label: base.label.clone(),
                control_kind: kind.to_string(),
            });
        }

        if let crate::model::types::Control::Encoder(e) = control {
            for pin in [&e.encoder.pin_a, &e.encoder.pin_b] {
                if !profile.interrupt_pins.contains(pin) {
                    warnings.push(format!(
                        "Encoder '{}' uses pin {} which is not interrupt-capable — falling back to polling",
                        base.label, pin
                    ));
                }
            }
        }
    }

    let used_pin_names: std::collections::HashSet<&str> =
        used.iter().map(|u| u.pin.as_str()).collect();
    let free: Vec<String> = profile
        .all_usable_pins
        .iter()
        .filter(|p| !used_pin_names.contains(p.as_str()))
        .cloned()
        .collect();

    for up in &used {
        if profile.serial_pins.contains(&up.pin) {
            warnings.push(format!(
                "Pin {} (used by '{}') is the Serial TX/RX pin — may conflict with USB",
                up.pin, up.control_label
            ));
        }
    }

    PinMap {
        board_id: board_id.to_string(),
        used,
        free,
        warnings,
    }
}

fn kind_label(control: &crate::model::types::Control) -> &'static str {
    use crate::model::types::Control;
    match control {
        Control::Button(_) => "button",
        Control::Switch(_) => "switch",
        Control::Selector(_) => "selector",
        Control::Encoder(_) => "encoder",
        Control::Analog(_) => "analog",
    }
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
    fn f5e_no_double_bookings() {
        let project = load_project(&fixture("f5e-armament.spm")).unwrap();
        let map = compute_pin_map(&project, "board-arm");
        let double_booked: Vec<_> = map
            .warnings
            .iter()
            .filter(|w| w.contains("double-booked"))
            .collect();
        assert!(double_booked.is_empty(), "unexpected double bookings: {:?}", double_booked);
    }

    #[test]
    fn f5e_uses_all_20_pins() {
        let project = load_project(&fixture("f5e-armament.spm")).unwrap();
        let map = compute_pin_map(&project, "board-arm");
        assert_eq!(map.free.len(), 0, "expected all 20 pins used, free: {:?}", map.free);
    }

    #[test]
    fn multi_board_encoder_warnings() {
        let project = load_project(&fixture("multi-board-demo.spm")).unwrap();
        let map = compute_pin_map(&project, "board-b");
        let interrupt_warnings: Vec<_> = map
            .warnings
            .iter()
            .filter(|w| w.contains("interrupt-capable"))
            .collect();
        assert!(
            !interrupt_warnings.is_empty(),
            "expected non-interrupt encoder warnings for A0/A1, A2/A3"
        );
    }
}
