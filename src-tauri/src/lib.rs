mod commands;
mod models;
mod services;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    // Validate isolation before registering plugins: a malformed test launch
    // must never acquire the production lock or touch startup registration.
    let arguments: Vec<_> = std::env::args_os().collect();
    let isolated_profile = services::profile::test_profile(
        arguments.iter().map(|argument| argument.as_os_str()),
        std::env::var_os("AURA_TEST_PROFILE").as_deref(),
    )
    .expect("Aura test profile is invalid");
    let production = services::profile::production_integration(
        cfg!(debug_assertions),
        isolated_profile.is_some(),
    );
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = if production {
        // This plugin must be first so a second process exits before setup.
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            services::window_recovery::restore(app, false);
        }))
    } else {
        builder
    };
    builder
        .setup(move |app| {
            // Explorer may still be starting at sign-in. A missing tray must
            // never prevent the widget itself from opening.
            if let Err(error) = services::window_recovery::install(app) {
                eprintln!("Aura could not create its recovery tray: {error}");
            }
            let profile = isolated_profile
                .clone()
                .or_else(|| app.path().app_config_dir().ok());
            let mut registration: Option<Box<dyn services::startup::Registration>> = None;
            #[cfg(windows)]
            if production {
                app.handle().plugin(
                    tauri_plugin_autostart::Builder::new()
                        .app_name("Aura")
                        .build(),
                )?;
                registration = Some(Box::new(services::startup::WindowsRegistration(
                    app.handle().clone(),
                )));
            }
            app.manage(Arc::new(services::startup::StartupService::new(
                profile.clone(),
                registration,
            )));
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
            commands::startup::get_startup_status,
            commands::startup::set_startup_enabled,
            commands::windows::open_music,
            commands::music::music_account_status,
            commands::music::music_connect,
            commands::music::music_disconnect,
            commands::music::music_browse,
            commands::music::music_change,
            commands::music::music_open_player,
            commands::music::music_open_policy,
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
