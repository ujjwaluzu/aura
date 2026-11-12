fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_foundation_info",
            "open_settings",
            "get_system_snapshot",
        ]),
    ))
    .expect("failed to build Aura application metadata and capabilities");
}
