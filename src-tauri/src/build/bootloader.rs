use std::time::{Duration, Instant};

use anyhow::Context;

/// Trigger the ATmega32u4 bootloader via the 1200-baud touch.
/// Opens the serial port at 1200 baud, asserts RTS, then closes it.
/// The Leonardo/Micro resets into the bootloader and re-enumerates on a (possibly new) port.
pub fn trigger_reset(port_name: &str) -> anyhow::Result<()> {
    let mut port = serialport::new(port_name, 1200)
        .timeout(Duration::from_millis(200))
        .open()
        .with_context(|| format!("opening {} for bootloader reset", port_name))?;

    port.write_request_to_send(true)
        .context("asserting RTS")?;
    std::thread::sleep(Duration::from_millis(100));
    drop(port);
    Ok(())
}

/// Poll for a new serial port to appear after a bootloader reset.
/// Returns the new port name within `timeout`, or an error if it does not appear.
/// `old_port` is excluded from matching to detect the re-enumerated bootloader port.
pub fn wait_for_bootloader_port(
    old_port: &str,
    timeout: Duration,
) -> anyhow::Result<String> {
    let start = Instant::now();
    let initial_ports: std::collections::HashSet<String> =
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect();

    while start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(200));
        let current: std::collections::HashSet<String> =
            serialport::available_ports()
                .unwrap_or_default()
                .into_iter()
                .map(|p| p.port_name)
                .collect();

        for port in &current {
            if !initial_ports.contains(port) && port != old_port {
                return Ok(port.clone());
            }
        }
    }

    Err(anyhow::anyhow!(
        "Bootloader port did not appear within {}ms after resetting {}",
        timeout.as_millis(),
        old_port
    ))
}
