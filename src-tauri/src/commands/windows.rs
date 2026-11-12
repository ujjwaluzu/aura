use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::models::AppError;

// An async command avoids creating a WebView inside a synchronous WebView2 IPC
// callback, which can deadlock on Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), AppError> {
    if window.label() != "widget-host" {
        return Err(AppError::new(
            "FORBIDDEN",
            "Only the widget host can open settings.",
        ));
    }

    if let Some(settings) = app.get_webview_window("settings") {
        settings.unminimize().map_err(AppError::window)?;
        settings.show().map_err(AppError::window)?;
        settings.set_focus().map_err(AppError::window)?;
        return Ok(());
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "settings")
        .ok_or_else(|| AppError::new("WINDOW_CONFIG", "The settings window is not configured."))?;

    // Rust owns the URL and label; the frontend cannot create arbitrary windows.
    let settings = WebviewWindowBuilder::from_config(&app, config)
        .map_err(AppError::window)?
        .build();
    match settings {
        Ok(settings) => settings.set_focus().map_err(AppError::window),
        // A concurrent click may have created the window while this command
        // was building. Reuse it rather than leaving the action broken.
        Err(error) => match app.get_webview_window("settings") {
            Some(settings) => settings.set_focus().map_err(AppError::window),
            None => Err(AppError::window(error)),
        },
    }
}
