use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerialPort {
    pub name: String,
    pub description: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub product: Option<String>,
}

pub fn list_serial_ports() -> Vec<SerialPort> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| serial_port_from_info(p.port_name, &p.port_type))
        .collect()
}

fn serial_port_from_info(name: String, port_type: &serialport::SerialPortType) -> SerialPort {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => SerialPort {
            name,
            description: usb_description(info),
            vid: Some(info.vid),
            pid: Some(info.pid),
            serial_number: info.serial_number.clone(),
            product: info.product.clone(),
        },
        serialport::SerialPortType::BluetoothPort => SerialPort {
            name,
            description: Some("Bluetooth".to_string()),
            vid: None,
            pid: None,
            serial_number: None,
            product: None,
        },
        _ => SerialPort {
            name,
            description: None,
            vid: None,
            pid: None,
            serial_number: None,
            product: None,
        },
    }
}

fn usb_description(info: &serialport::UsbPortInfo) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serialport::UsbPortInfo;

    #[test]
    fn usb_port_includes_raw_vid_pid_and_product() {
        let info = UsbPortInfo {
            vid: 0x2341,
            pid: 0x8036,
            serial_number: Some("ABC123".to_string()),
            manufacturer: Some("Arduino".to_string()),
            product: Some("Leonardo".to_string()),
        };
        let port = serial_port_from_info(
            "/dev/ttyACM0".to_string(),
            &serialport::SerialPortType::UsbPort(info),
        );
        assert_eq!(port.vid, Some(0x2341));
        assert_eq!(port.pid, Some(0x8036));
        assert_eq!(port.serial_number.as_deref(), Some("ABC123"));
        assert_eq!(port.product.as_deref(), Some("Leonardo"));
        assert_eq!(port.description.as_deref(), Some("Arduino Leonardo"));
    }

    #[test]
    fn non_usb_port_has_no_vid_pid() {
        let port = serial_port_from_info(
            "/dev/rfcomm0".to_string(),
            &serialport::SerialPortType::BluetoothPort,
        );
        assert_eq!(port.vid, None);
        assert_eq!(port.pid, None);
        assert_eq!(port.description.as_deref(), Some("Bluetooth"));
    }
}
