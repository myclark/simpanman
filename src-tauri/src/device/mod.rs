//! Phase 3: HID device reader for the test view.
//! Enabled by the `hid` Cargo feature.

#[cfg(feature = "hid")]
pub mod reader;

pub fn is_available() -> bool {
    cfg!(feature = "hid")
}
