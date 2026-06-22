use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerialPort {
    pub name: String,
    pub description: Option<String>,
}

pub fn list_serial_ports() -> Vec<SerialPort> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| SerialPort {
            description: port_description(&p.port_type),
            name: p.port_name,
        })
        .collect()
}

fn port_description(port_type: &serialport::SerialPortType) -> Option<String> {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => {
            let mut parts = Vec::new();
            if let Some(mfr) = &info.manufacturer {
                parts.push(mfr.clone());
            }
            if let Some(prod) = &info.product {
                parts.push(prod.clone());
            }
            if parts.is_empty() {
                Some(format!("USB {:04X}:{:04X}", info.vid, info.pid))
            } else {
                Some(parts.join(" "))
            }
        }
        serialport::SerialPortType::BluetoothPort => Some("Bluetooth".to_string()),
        _ => None,
    }
}
