use serde::{Deserialize, Serialize};

use super::types::{Control, EncoderMode, Project};
use crate::pins::profile::profile_for;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
}

impl ValidationReport {
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ValidationError {
    PinDoubleBooked {
        board_id: String,
        pin: String,
        control_ids: Vec<String>,
    },
    MissingBoardRef {
        control_id: String,
        board_id: String,
    },
    MissingPanelRef {
        control_id: String,
        panel_id: String,
    },
    AnalogPinNotCapable {
        control_id: String,
        pin: String,
    },
    SelectorNoPins {
        control_id: String,
        position_label: String,
    },
    EncoderMissingAxisConfig {
        control_id: String,
    },
    EncoderMissingButtonConfig {
        control_id: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ValidationWarning {
    SerialPinUsed {
        control_id: String,
        pin: String,
    },
    EncoderOnNonInterruptPin {
        control_id: String,
        pin: String,
    },
}

pub fn validate(project: &Project) -> ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let board_ids: std::collections::HashSet<&str> =
        project.boards.iter().map(|b| b.id.as_str()).collect();
    let panel_ids: std::collections::HashSet<&str> =
        project.panels.iter().map(|p| p.id.as_str()).collect();

    for control in &project.controls {
        let base = control.base();
        let control_id = &base.id;

        if !board_ids.contains(base.board_id.as_str()) {
            errors.push(ValidationError::MissingBoardRef {
                control_id: control_id.clone(),
                board_id: base.board_id.clone(),
            });
        }

        if !panel_ids.contains(base.panel_id.as_str()) {
            errors.push(ValidationError::MissingPanelRef {
                control_id: control_id.clone(),
                panel_id: base.panel_id.clone(),
            });
        }

        match control {
            Control::Selector(s) => {
                for pos in &s.positions {
                    if pos.pins.is_empty() {
                        errors.push(ValidationError::SelectorNoPins {
                            control_id: control_id.clone(),
                            position_label: pos.label.clone(),
                        });
                    }
                    if pos.pins.len() > 1 && pos.op.is_none() {
                        errors.push(ValidationError::SelectorNoPins {
                            control_id: control_id.clone(),
                            position_label: pos.label.clone(),
                        });
                    }
                }
            }
            Control::Encoder(e) => match e.encoder.mode {
                EncoderMode::Axis => {
                    if e.encoder.axis.is_none() {
                        errors.push(ValidationError::EncoderMissingAxisConfig {
                            control_id: control_id.clone(),
                        });
                    }
                }
                EncoderMode::Buttons => {
                    if e.encoder.button_cw.is_none() || e.encoder.button_ccw.is_none() {
                        errors.push(ValidationError::EncoderMissingButtonConfig {
                            control_id: control_id.clone(),
                        });
                    }
                }
            },
            Control::Analog(a) => {
                if let Some(board) = project.boards.iter().find(|b| b.id == base.board_id) {
                    let profile = profile_for(&board.board_type);
                    if !profile.analog_pins.contains(&a.analog.pin) {
                        errors.push(ValidationError::AnalogPinNotCapable {
                            control_id: control_id.clone(),
                            pin: a.analog.pin.clone(),
                        });
                    }
                }
            }
            _ => {}
        }
    }

    for board in &project.boards {
        let profile = profile_for(&board.board_type);
        let board_controls: Vec<&Control> = project
            .controls
            .iter()
            .filter(|c| c.board_id() == board.id)
            .collect();

        let mut pin_owners: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();

        for control in &board_controls {
            let control_id = control.id();
            let pins = collect_pins(control);

            for pin in &pins {
                pin_owners
                    .entry(pin.clone())
                    .or_default()
                    .push(control_id.to_string());
            }

            if let Control::Encoder(e) = control {
                let enc = &e.encoder;
                for pin in [&enc.pin_a, &enc.pin_b] {
                    if !profile.interrupt_pins.contains(pin) {
                        warnings.push(ValidationWarning::EncoderOnNonInterruptPin {
                            control_id: control_id.to_string(),
                            pin: pin.clone(),
                        });
                    }
                }
            }

            for pin in &pins {
                if profile.serial_pins.contains(pin) {
                    warnings.push(ValidationWarning::SerialPinUsed {
                        control_id: control_id.to_string(),
                        pin: pin.clone(),
                    });
                }
            }
        }

        for (pin, owners) in &pin_owners {
            if owners.len() > 1 {
                errors.push(ValidationError::PinDoubleBooked {
                    board_id: board.id.clone(),
                    pin: pin.to_string(),
                    control_ids: owners.iter().map(|s| s.to_string()).collect(),
                });
            }
        }
    }

    ValidationReport { errors, warnings }
}

pub fn collect_pins(control: &Control) -> Vec<String> {
    match control {
        Control::Button(b) => vec![b.pin.pin.clone()],
        Control::Switch(s) => vec![s.pin.pin.clone()],
        Control::Selector(s) => s
            .positions
            .iter()
            .flat_map(|p| p.pins.iter().map(|pr| pr.pin.clone()))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect(),
        Control::Encoder(e) => vec![e.encoder.pin_a.clone(), e.encoder.pin_b.clone()],
        Control::Analog(a) => vec![a.analog.pin.clone()],
    }
}
