use crate::{
    models::{github::*, AppError},
    services::{github::GithubService, music::open_url},
};
use std::sync::Arc;
use tauri::{State, WebviewWindow};

fn allowed(label: &str) -> Result<(), AppError> {
    if label == "widget-host" {
        Ok(())
    } else {
        Err(AppError::new(
            "FORBIDDEN",
            "GitHub is available in the widget host.",
        ))
    }
}
#[tauri::command]
pub fn github_status(
    window: WebviewWindow,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    Ok(service.status())
}
#[tauri::command]
pub async fn github_start_authorization(
    window: WebviewWindow,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start_authorization())
        .await
        .map_err(|_| AppError::new("GITHUB_FAILURE", "GitHub connection could not start."))?
}
#[tauri::command]
pub fn github_cancel_authorization(
    window: WebviewWindow,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    Ok(service.cancel())
}
#[tauri::command]
pub fn github_refresh(
    window: WebviewWindow,
    only_if_stale: bool,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    Ok(service.refresh(only_if_stale))
}
#[tauri::command]
pub fn github_work_refresh(
    window: WebviewWindow,
    only_if_stale: bool,
    category: Option<WorkCategory>,
    more: bool,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    Ok(service.refresh_work(only_if_stale, category, more))
}
#[tauri::command]
pub async fn github_work_open(
    window: WebviewWindow,
    category: WorkCategory,
    id: Option<String>,
    service: State<'_, Arc<GithubService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let url = service.work_destination(category, id)?;
    tauri::async_runtime::spawn_blocking(move || open_url(&url))
        .await
        .map_err(|_| AppError::new("GITHUB_BROWSER", "The browser could not open. Try again."))?
}
#[tauri::command]
pub async fn github_disconnect(
    window: WebviewWindow,
    service: State<'_, Arc<GithubService>>,
) -> Result<GithubState, AppError> {
    allowed(window.label())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.disconnect())
        .await
        .map_err(|_| AppError::new("GITHUB_FAILURE", "GitHub disconnect could not finish."))?
}
#[tauri::command]
pub async fn github_open_destination(
    window: WebviewWindow,
    destination: GithubDestination,
    service: State<'_, Arc<GithubService>>,
) -> Result<(), AppError> {
    allowed(window.label())?;
    let url = service.destination(destination)?;
    tauri::async_runtime::spawn_blocking(move || open_url(&url))
        .await
        .map_err(|_| AppError::new("GITHUB_BROWSER", "The browser could not open. Try again."))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_host_can_access_github() {
        assert!(allowed("widget-host").is_ok());
        for label in ["settings", "music", "", "main"] {
            assert!(allowed(label).is_err());
        }
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/widget-host.json")).unwrap();
        for name in [
            "status",
            "start-authorization",
            "cancel-authorization",
            "refresh",
            "disconnect",
            "open-destination",
            "work-refresh",
            "work-open",
        ] {
            assert!(capability["permissions"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!(format!("allow-github-{name}"))));
        }
    }
}
