use std::collections::{HashMap, HashSet};

use anyhow::Context;
use minijinja::{Environment, Value};
use rust_embed::RustEmbed;
use serde_json::json;

use crate::model::types::{
    Control, EncoderMode, JoystickAxis, Project, SelectorOp, pin_to_arduino_num,
};
use crate::pins::profile::profile_for;

use super::button_index::{assign_button_indices, total_button_count};
use super::emitter::GeneratedBoard;

#[derive(RustEmbed)]
#[folder = "templates/"]
struct Templates;

pub fn render_board(project: &Project, board_id: &str) -> anyhow::Result<GeneratedBoard> {
    let board = project
        .boards
        .iter()
        .find(|b| b.id == board_id)
        .ok_or_else(|| anyhow::anyhow!("Board '{}' not found", board_id))?;

    let profile = profile_for(&board.board_type);
    let button_map = assign_button_indices(project, board_id);
    let total_buttons = total_button_count(project, board_id);

    let board_controls: Vec<&Control> = project
        .controls
        .iter()
        .filter(|c| c.board_id() == board_id)
        .collect();

    let used_axes = collect_used_axes(&board_controls);

    let ctx = build_context(project, board_id, &board_controls, &button_map, total_buttons, &used_axes, &profile)?;

    let env = build_env()?;

    let platformio_ini = env
        .get_template("platformio.ini.jinja2")
        .context("loading platformio.ini template")?
        .render(&ctx)
        .context("rendering platformio.ini")?;

    let main_cpp = env
        .get_template("main.cpp.jinja2")
        .context("loading main.cpp template")?
        .render(&ctx)
        .context("rendering main.cpp")?;

    let board_json = env
        .get_template("board.json.jinja2")
        .context("loading board.json template")?
        .render(&ctx)
        .context("rendering board.json")
        .ok();

    Ok(GeneratedBoard {
        platformio_ini,
        main_cpp,
        board_json,
    })
}

fn build_env() -> anyhow::Result<Environment<'static>> {
    let mut env = Environment::new();
    env.set_loader(|name| match Templates::get(name) {
        Some(f) => Ok(Some(
            std::str::from_utf8(f.data.as_ref())
                .map(|s| s.to_string())
                .map_err(|e| minijinja::Error::new(
                    minijinja::ErrorKind::InvalidOperation,
                    e.to_string(),
                ))?,
        )),
        None => Ok(None),
    });
    Ok(env)
}

fn collect_used_axes(controls: &[&Control]) -> HashSet<String> {
    let mut axes = HashSet::new();
    for control in controls {
        match control {
            Control::Analog(a) => {
                axes.insert(axis_to_string(&a.analog.axis));
            }
            Control::Encoder(e) if e.encoder.mode == EncoderMode::Axis => {
                if let Some(axis) = &e.encoder.axis {
                    axes.insert(axis_to_string(axis));
                }
            }
            _ => {}
        }
    }
    axes
}

fn axis_to_string(axis: &JoystickAxis) -> String {
    match axis {
        JoystickAxis::X => "X",
        JoystickAxis::Y => "Y",
        JoystickAxis::Z => "Z",
        JoystickAxis::Rx => "Rx",
        JoystickAxis::Ry => "Ry",
        JoystickAxis::Rz => "Rz",
        JoystickAxis::Slider1 => "Slider1",
        JoystickAxis::Slider2 => "Slider2",
    }
    .to_string()
}

fn build_context(
    project: &Project,
    board_id: &str,
    controls: &[&Control],
    button_map: &HashMap<(String, usize), u32>,
    total_buttons: u32,
    used_axes: &HashSet<String>,
    profile: &crate::pins::profile::BoardProfile,
) -> anyhow::Result<Value> {
    let board = project.boards.iter().find(|b| b.id == board_id).unwrap();

    let mut button_controls = Vec::new();
    let mut switch_controls = Vec::new();
    let mut selector_controls = Vec::new();
    let mut encoder_controls = Vec::new();
    let mut interrupt_encoder_ids: HashSet<String> = HashSet::new();
    let mut polling_encoder_ids: HashSet<String> = HashSet::new();
    let mut analog_controls = Vec::new();

    for control in controls {
        let base = control.base();
        let cid = base.id.clone();

        match control {
            Control::Button(b) => {
                button_controls.push(json!({
                    "id": b.base.id,
                    "label": b.base.label,
                    "pin_num": pin_to_arduino_num(&b.pin.pin),
                    "inverted": b.pin.inverted,
                    "button_start": button_map.get(&(cid.clone(), 0)).copied().unwrap_or(0),
                }));
            }
            Control::Switch(s) => {
                switch_controls.push(json!({
                    "id": s.base.id,
                    "label": s.base.label,
                    "pin_num": pin_to_arduino_num(&s.pin.pin),
                    "inverted": s.pin.inverted,
                    "on_label": s.on_label,
                    "off_label": s.off_label,
                    "button_on": button_map.get(&(cid.clone(), 0)).copied().unwrap_or(0),
                    "button_off": button_map.get(&(cid.clone(), 1)).copied().unwrap_or(1),
                }));
            }
            Control::Selector(s) => {
                let positions: Vec<_> = s
                    .positions
                    .iter()
                    .enumerate()
                    .map(|(i, pos)| {
                        let pins: Vec<_> = pos
                            .pins
                            .iter()
                            .map(|pr| json!({
                                "pin_num": pin_to_arduino_num(&pr.pin),
                                "inverted": pr.inverted,
                            }))
                            .collect();
                        let op = match pos.op {
                            None => "single",
                            Some(SelectorOp::And) => "and",
                            Some(SelectorOp::Or) => "or",
                        };
                        json!({
                            "label": pos.label,
                            "pins": pins,
                            "op": op,
                            "button_idx": button_map.get(&(cid.clone(), i)).copied().unwrap_or(0),
                        })
                    })
                    .collect();

                selector_controls.push(json!({
                    "id": s.base.id,
                    "label": s.base.label,
                    "positions": positions,
                }));
            }
            Control::Encoder(e) => {
                let enc = &e.encoder;
                let use_interrupt = profile.interrupt_pins.contains(&enc.pin_a)
                    && profile.interrupt_pins.contains(&enc.pin_b);

                if use_interrupt {
                    interrupt_encoder_ids.insert(cid.clone());
                } else {
                    polling_encoder_ids.insert(cid.clone());
                }

                let mut ec = json!({
                    "id": e.base.id,
                    "label": e.base.label,
                    "pin_a_num": pin_to_arduino_num(&enc.pin_a),
                    "pin_b_num": pin_to_arduino_num(&enc.pin_b),
                    "pin_a": enc.pin_a,
                    "pin_b": enc.pin_b,
                    "counts_per_detent": enc.counts_per_detent,
                    "mode": match enc.mode { EncoderMode::Buttons => "buttons", EncoderMode::Axis => "axis" },
                    "use_interrupt": use_interrupt,
                });

                if enc.mode == EncoderMode::Buttons {
                    ec["presses_per_detent"] = json!(enc.presses_per_detent.unwrap_or(1));
                    ec["pulse_ms"] = json!(enc.pulse_ms.unwrap_or(20));
                    ec["button_cw"] = json!(button_map.get(&(cid.clone(), 0)).copied().unwrap_or(0));
                    ec["button_ccw"] = json!(button_map.get(&(cid.clone(), 1)).copied().unwrap_or(1));
                } else if let Some(axis) = &enc.axis {
                    ec["axis_setter"] = json!(axis.setter_method());
                    ec["delta_per_step"] = json!(enc.delta_per_step.unwrap_or(1));
                    ec["axis_min"] = json!(enc.min.unwrap_or(0));
                    ec["axis_max"] = json!(enc.max.unwrap_or(1023));
                    ec["wrap"] = json!(enc.wrap.unwrap_or(false));
                }

                encoder_controls.push(ec);
            }
            Control::Analog(a) => {
                let ana = &a.analog;
                analog_controls.push(json!({
                    "id": a.base.id,
                    "label": a.base.label,
                    "pin_num": pin_to_arduino_num(&ana.pin),
                    "axis_setter": ana.axis.setter_method(),
                    "in_min": ana.in_min,
                    "in_max": ana.in_max,
                    "out_min": ana.out_min,
                    "out_max": ana.out_max,
                    "invert": ana.invert,
                    "deadzone": ana.deadzone,
                    "smoothing": ana.smoothing,
                }));
            }
        }
    }

    let interrupt_encoders: Vec<_> = encoder_controls
        .iter()
        .filter(|e| e["use_interrupt"].as_bool().unwrap_or(false))
        .cloned()
        .collect();

    let polling_encoders: Vec<_> = encoder_controls
        .iter()
        .filter(|e| !e["use_interrupt"].as_bool().unwrap_or(false))
        .cloned()
        .collect();

    let all_axes = ["X", "Y", "Z", "Rx", "Ry", "Rz", "Slider1", "Slider2"];
    let axis_flags: serde_json::Map<String, serde_json::Value> = all_axes
        .iter()
        .map(|a| (a.to_string(), json!(used_axes.contains(*a))))
        .collect();

    let env_name = board.id.replace('-', "_");
    let board_type_str = match board.board_type {
        crate::model::types::BoardType::Leonardo => "leonardo",
        crate::model::types::BoardType::Micro => "micro",
        crate::model::types::BoardType::ProMicro => "pro_micro",
    };

    Ok(Value::from_serialize(json!({
        "board": {
            "id": board.id,
            "env_name": env_name,
            "name": board.name,
            "board_type": board_type_str,
            "identity": {
                "usbProduct": board.identity.usb_product,
                "usbVid": board.identity.usb_vid,
                "usbPid": board.identity.usb_pid,
                "usbVidHex": format!("0x{:04X}", board.identity.usb_vid),
                "usbPidHex": format!("0x{:04X}", board.identity.usb_pid),
            }
        },
        "total_buttons": total_buttons,
        "axis_flags": axis_flags,
        "has_interrupt_encoders": !interrupt_encoders.is_empty(),
        "button_controls": button_controls,
        "switch_controls": switch_controls,
        "selector_controls": selector_controls,
        "encoder_controls": encoder_controls,
        "interrupt_encoders": interrupt_encoders,
        "polling_encoders": polling_encoders,
        "analog_controls": analog_controls,
        "has_encoders": !encoder_controls.is_empty(),
        "has_analog": !analog_controls.is_empty(),
    })))
}
