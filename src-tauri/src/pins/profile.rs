use crate::model::types::BoardType;

pub struct BoardProfile {
    pub board_type: BoardType,
    pub digital_pins: Vec<String>,
    pub analog_pins: Vec<String>,
    pub interrupt_pins: Vec<String>,
    pub serial_pins: Vec<String>,
    pub all_usable_pins: Vec<String>,
}

pub fn profile_for(board_type: &BoardType) -> BoardProfile {
    match board_type {
        BoardType::Leonardo | BoardType::Micro | BoardType::ProMicro => atmega32u4_profile(board_type.clone()),
    }
}

fn atmega32u4_profile(board_type: BoardType) -> BoardProfile {
    let digital_pins: Vec<String> = (0..=13).map(|n| format!("D{n}")).collect();
    let analog_pins: Vec<String> = (0..=5).map(|n| format!("A{n}")).collect();
    let interrupt_pins = vec!["D0", "D1", "D2", "D3", "D7"]
        .into_iter()
        .map(String::from)
        .collect();
    let serial_pins = vec!["D0".to_string(), "D1".to_string()];

    let mut all_usable_pins = digital_pins.clone();
    all_usable_pins.extend(analog_pins.clone());

    BoardProfile {
        board_type,
        digital_pins,
        analog_pins,
        interrupt_pins,
        serial_pins,
        all_usable_pins,
    }
}
