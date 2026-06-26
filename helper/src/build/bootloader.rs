use std::time::Duration;

use anyhow::Context;

/// Trigger the ATmega32u4 bootloader via the 1200-baud touch.
/// Opens the serial port at 1200 baud, asserts RTS, then closes it.
/// The Leonardo/Micro resets into the bootloader and re-enumerates on a (possibly new) port.
pub fn trigger_reset(port_name: &str) -> anyhow::Result<()> {
    let mut port = serialport::new(port_name, 1200)
        .timeout(Duration::from_millis(200))
        .open()
        .with_context(|| format!("opening {} for bootloader reset", port_name))?;

    port.write_request_to_send(true).context("asserting RTS")?;
    std::thread::sleep(Duration::from_millis(100));
    drop(port);
    Ok(())
}
