mod commands;
mod models;
mod services;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let arguments: Vec<_> = std::env::args_os().collect();
            let profile = services::profile::test_profile(
                arguments.iter().map(|argument| argument.as_os_str()),
                std::env::var_os("AURA_TEST_PROFILE").as_deref(),
            )?
            .or_else(|| app.path().app_config_dir().ok());
            app.manage(Arc::new(services::preferences::PreferencesStore::load(
                profile.clone(),
            )));
            app.manage(Arc::new(services::music::MusicService::new(
                profile.clone(),
            )));
            app.manage(
                services::github::GithubService::new(profile, app.handle().clone())
                    .map_err(|e| std::io::Error::other(e.message))?,
            );
            Ok(())
        })
        .manage(Arc::new(services::system_monitor::SystemMonitor::default()))
        .manage(Arc::new(services::music_media::MediaService::default()))
        .invoke_handler(tauri::generate_handler![
            commands::github::github_status,
            commands::github::github_work_refresh,
            commands::github::github_work_open,
            commands::github::github_start_authorization,
            commands::github::github_cancel_authorization,
            commands::github::github_refresh,
            commands::github::github_disconnect,
            commands::github::github_open_destination,
            commands::foundation::get_foundation_info,
            commands::windows::open_settings,
            commands::system_monitor::get_system_snapshot,
            commands::preferences::get_preferences,
            commands::preferences::set_preferences,
            commands::windows::open_music,
            commands::music::music_account_status,
            commands::music::music_connect,
            commands::music::music_disconnect,
            commands::music::music_browse,
            commands::music::music_change,
            commands::music::music_open_player,
            commands::music::music_artwork,
            commands::music::music_playback_status,
            commands::music::music_select_session,
            commands::music::music_media_control,
            commands::music::music_media_seek,
            commands::music::music_media_volume,
        ])
        .on_window_event(|window, event| {
            // The host owns the application lifetime. Closing settings only
            // destroys that window; quitting the host also closes settings.
            if window.label() == "widget-host" && matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<Arc<services::github::GithubService>>()
                    .shutdown();
                window
                    .state::<Arc<services::music::MusicService>>()
                    .shutdown();
                window
                    .state::<Arc<services::music_media::MediaService>>()
                    .shutdown();
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("Aura could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Arc<services::github::GithubService>>()
                    .shutdown();
                app.state::<Arc<services::music::MusicService>>().shutdown();
                app.state::<Arc<services::music_media::MediaService>>()
                    .shutdown();
            }
        });
}
