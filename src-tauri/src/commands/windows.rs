use crate::models::AppError;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SettingsDestination {
    General,
    Theme,
    Layout,
    MusicPlayer,
    MusicSearch,
    MusicPlaylists,
    MusicLiked,
}
impl SettingsDestination {
    fn query(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::Theme => "theme",
            Self::Layout => "layout",
            Self::MusicPlayer => "music-player",
            Self::MusicSearch => "music-search",
            Self::MusicPlaylists => "music-playlists",
            Self::MusicLiked => "music-liked",
        }
    }
}

#[tauri::command]
pub async fn open_music(app: AppHandle, window: WebviewWindow) -> Result<(), AppError> {
    open_settings(app, window, Some(SettingsDestination::MusicPlayer)).await
}

// Async avoids creating a WebView inside a synchronous WebView2 callback.
#[tauri::command]
pub async fn open_settings(
    app: AppHandle,
    window: WebviewWindow,
    destination: Option<SettingsDestination>,
) -> Result<(), AppError> {
    crate::commands::music::allowed(window.label())?;
    if let Some(settings) = app.get_webview_window("settings") {
        return focus_settings(&settings, destination);
    }
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|c| c.label == "settings")
        .cloned()
        .ok_or_else(|| AppError::new("WINDOW_CONFIG", "Settings is not configured."))?;
    if let Some(target) = destination {
        config.url = tauri::WebviewUrl::App(
            format!("index.html?window=settings&destination={}", target.query()).into(),
        );
    }
    // Fit logical window dimensions to the current monitor's available work area.
    if let Some(monitor) = window.current_monitor().map_err(AppError::window)? {
        let area = monitor
            .work_area()
            .size
            .to_logical::<f64>(monitor.scale_factor());
        let width = (area.width - 16.0).max(1.0);
        let height = (area.height - 48.0).max(1.0);
        config.width = 960.0_f64.min(width);
        config.height = 720.0_f64.min(height);
        config.min_width = Some(720.0_f64.min(width));
        config.min_height = Some(560.0_f64.min(height));
    }
    match WebviewWindowBuilder::from_config(&app, &config)
        .map_err(AppError::window)?
        .build()
    {
        Ok(settings) => settings.set_focus().map_err(AppError::window),
        Err(error) => match app.get_webview_window("settings") {
            Some(settings) => focus_settings(&settings, destination),
            None => Err(AppError::window(error)),
        },
    }
}
fn focus_settings(
    settings: &WebviewWindow,
    destination: Option<SettingsDestination>,
) -> Result<(), AppError> {
    settings.unminimize().map_err(AppError::window)?;
    settings.show().map_err(AppError::window)?;
    if let Some(target) = destination {
        settings
            .emit("aura://settings-navigate", target)
            .map_err(AppError::window)?;
    }
    settings.set_focus().map_err(AppError::window)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn destinations_are_closed_and_match_urls() {
        for destination in [
            SettingsDestination::General,
            SettingsDestination::Theme,
            SettingsDestination::Layout,
            SettingsDestination::MusicPlayer,
            SettingsDestination::MusicSearch,
            SettingsDestination::MusicPlaylists,
            SettingsDestination::MusicLiked,
        ] {
            assert_eq!(
                serde_json::to_value(destination).unwrap(),
                destination.query()
            );
        }
        assert!(serde_json::from_str::<SettingsDestination>("\"unknown\"").is_err());
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(config["app"]["windows"].as_array().unwrap().len(), 2);
    }
}
