mod build;
pub mod codegen;
mod commands;
mod device;
pub mod identity;
pub mod model;
pub mod pins;

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::project_new,
            commands::project_open,
            commands::project_save,
            commands::panel_upsert,
            commands::panel_delete,
            commands::board_upsert,
            commands::board_delete,
            commands::control_upsert,
            commands::control_delete,
            commands::validate,
            commands::board_pinmap,
            commands::allocate_identity,
            commands::generate_board,
            commands::list_serial_ports,
            commands::build_board,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
