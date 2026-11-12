use std::sync::Arc;

use tauri::{State, WebviewWindow};

use crate::{
    models::{AppError, SystemSnapshot},
    services::system_monitor::SystemMonitor,
};

#[tauri::command]
pub async fn get_system_snapshot(
    window: WebviewWindow,
    monitor: State<'_, Arc<SystemMonitor>>,
) -> Result<SystemSnapshot, AppError> {
    if window.label() != "widget-host" {
        return Err(AppError::new(
            "FORBIDDEN",
            "Only the widget host can read system usage.",
        ));
    }
    // Also gate at the OS window boundary: WebView visibility propagation can
    // vary. Even an unexpected frontend request must not sample a minimized host.
    if window.is_minimized().map_err(|_| unavailable())?
        || !window.is_visible().map_err(|_| unavailable())?
    {
        return Err(AppError::new(
            "MONITOR_PAUSED",
            "Monitoring is paused while Aura is hidden.",
        ));
    }

    let monitor = Arc::clone(monitor.inner());
    tauri::async_runtime::spawn_blocking(move || monitor.snapshot())
        .await
        .map_err(|_| unavailable())?
}

fn unavailable() -> AppError {
    AppError::new(
        "MONITOR_UNAVAILABLE",
        "System usage is unavailable. Please try again.",
    )
}
