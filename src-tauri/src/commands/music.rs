use crate::{
    models::{music::*, AppError},
    services::{
        music::{self, MusicService},
        music_media::MediaService,
    },
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

pub fn allowed(label: &str) -> Result<(), AppError> {
    if matches!(label, "widget-host" | "music") {
        Ok(())
    } else {
        Err(AppError::new(
            "FORBIDDEN",
            "Music commands are only available in Aura Music and the widget host.",
        ))
    }
}
fn task_error() -> AppError {
    AppError::new("MUSIC_FAILURE", "The music operation could not finish.")
}
fn notify(app: &AppHandle, state: &MusicAccountState) {
    for label in ["widget-host", "music"] {
        let _ = app.emit_to(label, "aura://music-account-changed", state);
    }
}
#[tauri::command]
pub async fn music_account_status(
    window: WebviewWindow,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicAccountState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.status())
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_connect(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicAccountState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || service.connect())
        .await
        .map_err(|_| task_error())?;
    if let Ok(state) = &result {
        notify(&app, state);
    }
    result
}
#[tauri::command]
pub async fn music_disconnect(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicAccountState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    let state = tauri::async_runtime::spawn_blocking(move || service.disconnect())
        .await
        .map_err(|_| task_error())??;
    notify(&app, &state);
    Ok(state)
}
#[tauri::command]
pub async fn music_browse(
    window: WebviewWindow,
    query: MusicQuery,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicPage, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.browse(query))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_change(
    window: WebviewWindow,
    change: MusicChange,
    service: State<'_, Arc<MusicService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.change(change))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_open_player(window: WebviewWindow, target: MusicTarget) -> Result<(), AppError> {
    allowed(window.label())?;
    let url = music::player_url(target)?;
    music::open_url(&url)
}
#[tauri::command]
pub async fn music_artwork(window: WebviewWindow, url: String) -> Result<String, AppError> {
    allowed(window.label())?;
    tauri::async_runtime::spawn_blocking(move || music::artwork(&url))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_playback_status(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, Arc<MediaService>>,
) -> Result<PlaybackState, AppError> {
    allowed(window.label())?;
    service.start(app);
    service.snapshot()
}
#[tauri::command]
pub async fn music_select_session(
    window: WebviewWindow,
    id: Option<String>,
    service: State<'_, Arc<MediaService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.select(id))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_media_control(
    window: WebviewWindow,
    action: MediaAction,
    service: State<'_, Arc<MediaService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.control(action))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_media_seek(
    window: WebviewWindow,
    position_seconds: f64,
    service: State<'_, Arc<MediaService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.seek(position_seconds))
        .await
        .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_media_volume(
    window: WebviewWindow,
    level: Option<f32>,
    service: State<'_, Arc<MediaService>>,
) -> Result<f32, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.volume(level))
        .await
        .map_err(|_| task_error())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_host_and_music_have_native_access() {
        assert!(allowed("widget-host").is_ok());
        assert!(allowed("music").is_ok());
        for label in ["settings", "main", "", "music-other"] {
            assert!(allowed(label).is_err());
        }
        let settings: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/settings.json")).unwrap();
        assert!(!settings["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap_or("").contains("music")));
    }
}
