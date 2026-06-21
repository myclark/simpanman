use serde::{Deserialize, Serialize};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub schema_version: u32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub panels: Vec<Panel>,
    pub boards: Vec<Board>,
    pub controls: Vec<Control>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Panel {
    pub id: String,
    pub name: String,
    pub order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Layout>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Layout {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BoardType {
    Leonardo,
    Micro,
    ProMicro,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub board_type: BoardType,
    pub identity: BoardIdentity,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardIdentity {
    pub usb_product: String,
    pub usb_vid: u32,
    pub usb_pid: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PinRef {
    pub pin: String,
    pub inverted: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Control {
    Button(ButtonControl),
    Switch(SwitchControl),
    Selector(SelectorControl),
    Encoder(EncoderControl),
    Analog(AnalogControl),
}

impl Control {
    pub fn id(&self) -> &str {
        match self {
            Control::Button(c) => &c.base.id,
            Control::Switch(c) => &c.base.id,
            Control::Selector(c) => &c.base.id,
            Control::Encoder(c) => &c.base.id,
            Control::Analog(c) => &c.base.id,
        }
    }

    pub fn base(&self) -> &Base {
        match self {
            Control::Button(c) => &c.base,
            Control::Switch(c) => &c.base,
            Control::Selector(c) => &c.base,
            Control::Encoder(c) => &c.base,
            Control::Analog(c) => &c.base,
        }
    }

    pub fn board_id(&self) -> &str {
        &self.base().board_id
    }

    pub fn panel_id(&self) -> &str {
        &self.base().panel_id
    }

    pub fn label(&self) -> &str {
        &self.base().label
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Base {
    pub id: String,
    pub panel_id: String,
    pub board_id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ButtonControl {
    #[serde(flatten)]
    pub base: Base,
    pub pin: PinRef,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SwitchControl {
    #[serde(flatten)]
    pub base: Base,
    pub pin: PinRef,
    pub on_label: String,
    pub off_label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SelectorControl {
    #[serde(flatten)]
    pub base: Base,
    pub positions: Vec<SelectorPosition>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SelectorPosition {
    pub label: String,
    pub pins: Vec<PinRef>,
    pub op: Option<SelectorOp>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SelectorOp {
    And,
    Or,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncoderControl {
    #[serde(flatten)]
    pub base: Base,
    pub encoder: EncoderConfig,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncoderConfig {
    pub pin_a: String,
    pub pin_b: String,
    pub counts_per_detent: u8,
    pub mode: EncoderMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_cw: Option<EncoderButton>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_ccw: Option<EncoderButton>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presses_per_detent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pulse_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis: Option<JoystickAxis>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_per_step: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wrap: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EncoderMode {
    Buttons,
    Axis,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EncoderButton {
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum JoystickAxis {
    X,
    Y,
    Z,
    Rx,
    Ry,
    Rz,
    Slider1,
    Slider2,
}

impl JoystickAxis {
    pub fn setter_method(&self) -> &'static str {
        match self {
            JoystickAxis::X => "setXAxis",
            JoystickAxis::Y => "setYAxis",
            JoystickAxis::Z => "setZAxis",
            JoystickAxis::Rx => "setRxAxis",
            JoystickAxis::Ry => "setRyAxis",
            JoystickAxis::Rz => "setRzAxis",
            // Slider1/2 map to throttle/rudder in the Joystick library
            JoystickAxis::Slider1 => "setThrottle",
            JoystickAxis::Slider2 => "setRudder",
        }
    }

}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalogControl {
    #[serde(flatten)]
    pub base: Base,
    pub analog: AnalogConfig,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalogConfig {
    pub pin: String,
    pub axis: JoystickAxis,
    pub in_min: i32,
    pub in_max: i32,
    pub out_min: i32,
    pub out_max: i32,
    pub invert: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadzone: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smoothing: Option<f32>,
}

pub fn pin_to_arduino_num(pin: &str) -> String {
    if let Some(n) = pin.strip_prefix('D') {
        n.to_string()
    } else {
        pin.to_string()
    }
}
