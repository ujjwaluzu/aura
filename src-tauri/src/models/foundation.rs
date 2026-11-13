use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundationInfo {
    pub protocol_version: u32,
    pub app_name: &'static str,
    pub version: &'static str,
    pub platform: &'static str,
    pub window_mode: &'static str,
}

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    #[serde(rename = "httpStatus", skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(rename = "providerReason", skip_serializing_if = "Option::is_none")]
    pub provider_reason: Option<String>,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            http_status: None,
            provider_reason: None,
        }
    }

    pub fn window(error: tauri::Error) -> Self {
        // Diagnostic stays in the native console; don't expose paths or
        // platform internals through user-facing error strings.
        eprintln!("Aura window operation failed: {error}");
        Self::new(
            "WINDOW_OPERATION",
            "Aura could not open or focus this window. Please try again.",
        )
    }
}
