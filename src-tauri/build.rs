fn main() {
    println!("cargo:rerun-if-env-changed=AURA_MUSIC_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=AURA_MUSIC_CLIENT_SECRET");
    println!("cargo:rerun-if-changed=music-release-gate.json");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_foundation_info",
            "open_settings",
            "get_system_snapshot",
            "get_preferences",
            "set_preferences",
            "open_music",
            "music_account_status",
            "music_connect",
            "music_disconnect",
            "music_browse",
            "music_change",
            "music_open_player",
            "music_artwork",
            "music_playback_status",
            "music_select_session",
            "music_media_control",
        ]),
    ))
    .expect("failed to build Aura application metadata and capabilities");
}
