mod commands;
mod models;
mod services;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(services::system_monitor::SystemMonitor::default()))
        .invoke_handler(tauri::generate_handler![
            commands::foundation::get_foundation_info,
            commands::windows::open_settings,
            commands::system_monitor::get_system_snapshot,
        ])
        .on_window_event(|window, event| {
            // The host owns the application lifetime. Closing settings only
            // destroys that window; quitting the host also closes settings.
            if window.label() == "widget-host" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("Aura could not start");
}
