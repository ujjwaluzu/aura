use crate::{
    models::{AppError, PreferencesPatch, PreferencesSnapshot},
    services::preferences::PreferencesStore,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[tauri::command]
pub async fn get_preferences(
    store: State<'_, Arc<PreferencesStore>>,
) -> Result<PreferencesSnapshot, AppError> {
    let store = Arc::clone(store.inner());
    tauri::async_runtime::spawn_blocking(move || store.snapshot())
        .await
        .map_err(|_| error())?
}

#[tauri::command]
pub async fn set_preferences(
    app: AppHandle,
    window: WebviewWindow,
    patch: PreferencesPatch,
    store: State<'_, Arc<PreferencesStore>>,
) -> Result<PreferencesSnapshot, AppError> {
    if window.label() != "settings" {
        return Err(AppError::new(
            "FORBIDDEN",
            "Preferences can only be changed in Settings.",
        ));
    }
    let store = Arc::clone(store.inner());
    let updated = tauri::async_runtime::spawn_blocking(move || store.update(patch))
        .await
        .map_err(|_| error())??;
    // No frontend emit permission is granted; Rust is the authoritative source.
    for label in ["widget-host", "settings"] {
        if let Err(error) = app.emit_to(label, "aura://preferences-changed", &updated) {
            eprintln!("Aura could not notify {label} of a preference update: {error}");
        }
    }
    Ok(updated)
}

fn error() -> AppError {
    AppError::new(
        "PREFERENCES_SAVE",
        "Preferences could not be updated. Please try again.",
    )
}
