fn main() {
    // Refresh Windows resources and the default window icon when branding changes.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=windows/hooks.nsh");
    println!("cargo:rerun-if-env-changed=AURA_GITHUB_CLIENT_ID");
    println!("cargo:rerun-if-changed=../.env.github.local");
    let github_client = std::env::var("AURA_GITHUB_CLIENT_ID").ok().or_else(|| {
        std::fs::read_to_string("../.env.github.local")
            .ok()?
            .lines()
            .find_map(|line| {
                line.trim()
                    .strip_prefix("AURA_GITHUB_CLIENT_ID=")
                    .map(|value| value.trim().to_owned())
            })
    });
    if let Some(client) =
        github_client.filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric()))
    {
        println!("cargo:rustc-env=AURA_GITHUB_CLIENT_ID={client}");
    }
    println!("cargo:rerun-if-env-changed=AURA_MUSIC_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=AURA_MUSIC_CLIENT_SECRET");
    println!("cargo:rerun-if-changed=music-release-gate.json");
    println!("cargo:rerun-if-changed=music-policy.json");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "github_status",
            "github_work_refresh",
            "github_work_open",
            "github_start_authorization",
            "github_cancel_authorization",
            "github_refresh",
            "github_disconnect",
            "github_open_destination",
            "get_foundation_info",
            "open_settings",
            "get_system_snapshot",
            "get_preferences",
            "set_preferences",
            "get_startup_status",
            "set_startup_enabled",
            "open_music",
            "music_account_status",
            "music_connect",
            "music_disconnect",
            "music_browse",
            "music_change",
            "music_open_player",
            "music_open_policy",
            "music_artwork",
            "music_playback_status",
            "music_select_session",
            "music_media_control",
            "music_media_seek",
            "music_media_volume",
        ]),
    ))
    .expect("failed to build Aura application metadata and capabilities");
}
