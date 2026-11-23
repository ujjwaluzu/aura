//! A native recovery path independent of WebView visibility and JavaScript.
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn restore(app: &AppHandle, reset_position: bool) {
    let Some(host) = app.get_webview_window("widget-host") else {
        return;
    };
    // Show before restoring: the host may have been hidden as well as minimized.
    for result in [host.show(), host.unminimize()] {
        if let Err(error) = result {
            eprintln!("Aura could not restore its widget: {error}");
        }
    }
    // Explicit recovery for display disconnects or an off-screen drag.
    if reset_position {
        if let Err(error) = host.center() {
            eprintln!("Aura could not center its widget: {error}");
        }
    }
    if let Err(error) = host.set_focus() {
        eprintln!("Aura could not focus its widget: {error}");
    }
}

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Aura", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset widget position", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Aura", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &reset, &quit])?;
    let mut tray = TrayIconBuilder::with_id("aura-recovery")
        .tooltip("Aura - click to show widgets")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => restore(app, false),
            "reset" => restore(app, true),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                restore(tray.app_handle(), false);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
