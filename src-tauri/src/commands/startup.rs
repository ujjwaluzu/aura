use crate::{
    models::AppError,
    services::startup::{StartupService, StartupStatus},
};
use std::sync::Arc;
use tauri::{State, WebviewWindow};

fn settings_only(label: &str) -> Result<(), AppError> {
    if label != "settings" {
        return Err(AppError::new(
            "FORBIDDEN",
            "Startup is only available in Settings.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_startup_status(
    window: WebviewWindow,
    service: State<'_, Arc<StartupService>>,
) -> Result<StartupStatus, AppError> {
    settings_only(window.label())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || service.status())
        .await
        .map_err(|_| {
            AppError::new(
                "STARTUP_READ",
                "Startup status could not be read. Try again.",
            )
        })?
}

#[tauri::command]
pub async fn set_startup_enabled(
    window: WebviewWindow,
    enabled: bool,
    service: State<'_, Arc<StartupService>>,
) -> Result<StartupStatus, AppError> {
    settings_only(window.label())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || service.set_enabled(enabled))
        .await
        .map_err(|_| AppError::new("STARTUP_SAVE", "Startup could not be changed. Try again."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_settings_can_read_or_change_startup() {
        assert!(settings_only("settings").is_ok());
        for label in ["widget-host", "music", "other", ""] {
            assert_eq!(settings_only(label).unwrap_err().code, "FORBIDDEN");
        }
    }
}
