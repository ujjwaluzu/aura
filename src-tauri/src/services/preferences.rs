use crate::models::{AppError, PreferencesPatch, PreferencesSnapshot, SavedPreferences};
use std::{fs, path::PathBuf, sync::Mutex};

pub struct PreferencesStore {
    directory: Option<PathBuf>,
    state: Mutex<PreferencesState>,
}

struct PreferencesState {
    saved: SavedPreferences,
    revision: u64,
    warning: Option<String>,
}

impl PreferencesStore {
    pub fn load(directory: Option<PathBuf>) -> Self {
        let result = directory.as_ref().map(|dir| {
            let path = dir.join("preferences.json");
            if !path.exists() {
                return Ok(SavedPreferences::default());
            }
            if fs::metadata(&path).map_err(|_| ())?.len() > 16_384 {
                return Err(());
            }
            let bytes = fs::read(path).map_err(|_| ())?;
            let saved: SavedPreferences = serde_json::from_slice(&bytes).map_err(|_| ())?;
            if saved.schema_version != 1 {
                return Err(());
            }
            Ok(saved)
        });
        let (saved, warning) = match result {
            Some(Ok(saved)) => (saved, None),
            _ => (
                SavedPreferences::default(),
                Some("Saved preferences could not be loaded. Defaults are being used.".into()),
            ),
        };
        Self {
            directory,
            state: Mutex::new(PreferencesState {
                saved,
                revision: 0,
                warning,
            }),
        }
    }

    pub fn snapshot(&self) -> Result<PreferencesSnapshot, AppError> {
        let state = self.state.lock().map_err(|_| save_error())?;
        Ok(snapshot(&state))
    }

    pub fn update(&self, patch: PreferencesPatch) -> Result<PreferencesSnapshot, AppError> {
        if patch.theme_id.is_none() && patch.layout_id.is_none() {
            return Err(AppError::new(
                "INVALID_PREFERENCES",
                "Choose a theme or layout to apply.",
            ));
        }
        let mut state = self.state.lock().map_err(|_| save_error())?;
        let directory = self.directory.as_ref().ok_or_else(save_error)?;
        let saved = SavedPreferences {
            schema_version: 1,
            theme_id: patch.theme_id.unwrap_or(state.saved.theme_id),
            layout_id: patch.layout_id.unwrap_or(state.saved.layout_id),
        };
        let bytes = serde_json::to_vec_pretty(&saved).map_err(|_| save_error())?;
        fs::create_dir_all(directory).map_err(|_| save_error())?;
        // Same-directory rename replaces the file atomically on Windows. A
        // per-process temporary name avoids collisions with another instance.
        let temporary = directory.join(format!("preferences.{}.tmp", std::process::id()));
        let result = fs::write(&temporary, bytes)
            .and_then(|_| fs::rename(&temporary, directory.join("preferences.json")));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(save_error());
        }
        // Publish only successfully persisted choices. Revisions let each
        // window discard late events and command completions.
        state.saved = saved;
        state.revision += 1;
        state.warning = None;
        Ok(snapshot(&state))
    }
}

fn snapshot(state: &PreferencesState) -> PreferencesSnapshot {
    PreferencesSnapshot {
        theme_id: state.saved.theme_id,
        layout_id: state.saved.layout_id,
        revision: state.revision,
        warning: state.warning.clone(),
    }
}

fn save_error() -> AppError {
    AppError::new(
        "PREFERENCES_SAVE",
        "Your changes could not be saved. Please try again.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{LayoutId, ThemeId};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "aura-preferences-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn persists_choices_and_merges_partial_updates() {
        let directory = test_directory();
        for theme in [
            ThemeId::FaultyTerminal,
            ThemeId::Galaxy,
            ThemeId::LetterGlitch,
            ThemeId::PixelSnow,
        ] {
            let store = PreferencesStore::load(Some(directory.clone()));
            store
                .update(PreferencesPatch {
                    theme_id: Some(theme),
                    layout_id: None,
                })
                .unwrap();
            let changed = store
                .update(PreferencesPatch {
                    theme_id: None,
                    layout_id: Some(LayoutId::ClockRightMusicStats),
                })
                .unwrap();
            assert_eq!(changed.revision, 2);
            let reloaded = PreferencesStore::load(Some(directory.clone()))
                .snapshot()
                .unwrap();
            assert_eq!(reloaded.theme_id, theme);
            assert_eq!(reloaded.layout_id, LayoutId::ClockRightMusicStats);
        }
        fs::remove_file(directory.join("preferences.json")).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn corrupt_preferences_fall_back_without_crashing() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("preferences.json"), b"invalid-json").unwrap();
        let snapshot = PreferencesStore::load(Some(directory.clone()))
            .snapshot()
            .unwrap();
        assert_eq!(snapshot.theme_id, ThemeId::FaultyTerminal);
        assert!(snapshot.warning.is_some());
        fs::remove_file(directory.join("preferences.json")).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn retired_layouts_and_themes_migrate_without_resetting_preferences() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        for (retired, replacement) in [
            ("stats-left-clock-music", "clock-left-stats-music"),
            ("stats-left-music-clock", "clock-left-music-stats"),
            ("stats-right-clock-music", "clock-right-stats-music"),
            ("stats-right-music-clock", "clock-right-music-stats"),
            ("music-left-clock-stats", "clock-left-music-stats"),
            ("music-left-stats-clock", "clock-left-stats-music"),
            ("music-right-clock-stats", "clock-right-music-stats"),
            ("music-right-stats-clock", "clock-right-stats-music"),
        ] {
            fs::write(
                directory.join("preferences.json"),
                serde_json::to_vec(&serde_json::json!({
                    "schemaVersion": 1, "themeId": "rose", "layoutId": retired
                }))
                .unwrap(),
            )
            .unwrap();
            let store = PreferencesStore::load(Some(directory.clone()));
            let snapshot = store.snapshot().unwrap();
            assert_eq!(snapshot.theme_id, ThemeId::FaultyTerminal);
            assert!(snapshot.warning.is_none());
            assert_eq!(
                serde_json::to_value(&snapshot).unwrap()["layoutId"],
                replacement
            );
            store
                .update(PreferencesPatch {
                    theme_id: Some(ThemeId::FaultyTerminal),
                    layout_id: None,
                })
                .unwrap();
            let saved: serde_json::Value =
                serde_json::from_slice(&fs::read(directory.join("preferences.json")).unwrap())
                    .unwrap();
            assert_eq!(saved["themeId"], "faulty-terminal");
            assert_eq!(saved["layoutId"], replacement);
        }
        fs::remove_file(directory.join("preferences.json")).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn failed_save_keeps_the_previous_choices() {
        let store = PreferencesStore::load(None);
        assert!(store
            .update(PreferencesPatch {
                theme_id: Some(ThemeId::FaultyTerminal),
                layout_id: None
            })
            .is_err());
        assert_eq!(store.snapshot().unwrap().theme_id, ThemeId::FaultyTerminal);
    }

    #[test]
    fn all_retired_palettes_migrate_to_faulty_terminal_and_keep_the_layout() {
        for theme in ["violet", "ocean", "jade", "amber", "rose"] {
            let saved: SavedPreferences = serde_json::from_value(serde_json::json!({
                "schemaVersion": 1,
                "themeId": theme,
                "layoutId": "music-focus-clock-right"
            }))
            .unwrap();
            assert_eq!(saved.theme_id, ThemeId::FaultyTerminal);
            assert_eq!(saved.layout_id, LayoutId::MusicFocusClockRight);
            assert_eq!(
                serde_json::to_value(saved).unwrap()["themeId"],
                "faulty-terminal"
            );
        }
    }

    #[test]
    fn rejects_unknown_themes_layouts_and_fields() {
        for json in [
            r#"{"themeId":"neon"}"#,
            r#"{"layoutId":"arbitrary"}"#,
            r#"{"filePath":"C:/other"}"#,
        ] {
            assert!(serde_json::from_str::<PreferencesPatch>(json).is_err());
        }
    }
}
