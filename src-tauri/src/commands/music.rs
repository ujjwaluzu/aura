use crate::{
    models::{music::*, AppError},
    services::{
        music::{self, MusicService},
        music_media::MediaService,
        music_oauth, music_policy,
    },
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

pub fn allowed(label: &str) -> Result<(), AppError> {
    if matches!(label, "widget-host" | "settings") {
        Ok(())
    } else {
        Err(AppError::new(
            "FORBIDDEN",
            "Music commands are available in the widget host and Settings.",
        ))
    }
}
fn task_error() -> AppError {
    AppError::new("MUSIC_FAILURE", "The music operation could not finish.")
}
fn notify(app: &AppHandle, state: &MusicAccountState) {
    for label in ["widget-host", "settings"] {
        let _ = app.emit_to(label, "aura://music-account-changed", state);
    }
}
#[tauri::command]
pub async fn music_account_status(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicAccountState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.status();
        if let Ok(state) = &result {
            if state.status == "expired" {
                notify(&app, state);
            }
        }
        result
    })
    .await
    .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_connect(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, Arc<MusicService>>,
    policy_version: Option<String>,
) -> Result<MusicAccountState, AppError> {
    allowed(window.label())?;
    music_oauth::gate()?;
    music_policy::require(policy_version.as_deref())?;
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
    app: AppHandle,
    window: WebviewWindow,
    query: MusicQuery,
    service: State<'_, Arc<MusicService>>,
) -> Result<MusicPage, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.browse(query);
        notify_expiry(&app, &service, &result);
        result
    })
    .await
    .map_err(|_| task_error())?
}
#[tauri::command]
pub async fn music_change(
    app: AppHandle,
    window: WebviewWindow,
    change: MusicChange,
    service: State<'_, Arc<MusicService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.change(change);
        notify_expiry(&app, &service, &result);
        result
    })
    .await
    .map_err(|_| task_error())?
}
fn notify_expiry<T>(app: &AppHandle, service: &MusicService, result: &Result<T, AppError>) {
    if result
        .as_ref()
        .is_err_and(|error| error.code == "SESSION_EXPIRED")
    {
        if let Ok(state) = service.status() {
            notify(app, &state);
        }
    }
}
#[tauri::command]
pub async fn music_open_player(window: WebviewWindow, target: MusicTarget) -> Result<(), AppError> {
    allowed(window.label())?;
    let url = music::player_url(target)?;
    music::open_url(&url)
}
#[tauri::command]
pub async fn music_open_policy(window: WebviewWindow, target: String) -> Result<(), AppError> {
    allowed(window.label())?;
    music::open_url(&music_policy::link(&target)?)
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
    session_id: Option<String>,
    service: State<'_, Arc<MediaService>>,
) -> Result<f32, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.volume(level, session_id))
        .await
        .map_err(|_| task_error())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_music_and_settings_have_native_access() {
        assert!(allowed("widget-host").is_ok());
        assert!(allowed("music").is_err());
        assert!(allowed("settings").is_ok());
        for label in ["main", "", "music-other"] {
            assert!(allowed(label).is_err());
        }
        let settings: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/settings.json")).unwrap();
        assert!(settings["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap_or("") == "allow-music-playback-status"));
    }
}
