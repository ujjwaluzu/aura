use crate::models::{AppError, FoundationInfo};

#[tauri::command]
pub fn get_foundation_info(protocol_version: u32) -> Result<FoundationInfo, AppError> {
    crate::services::foundation::foundation_info(protocol_version)
}
