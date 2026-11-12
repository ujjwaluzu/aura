use crate::models::{AppError, FoundationInfo};

const PROTOCOL_VERSION: u32 = 1;

pub fn foundation_info(protocol_version: u32) -> Result<FoundationInfo, AppError> {
    if protocol_version != PROTOCOL_VERSION {
        return Err(AppError::new(
            "PROTOCOL_MISMATCH",
            "Frontend and native versions do not match. Restart Aura.",
        ));
    }

    Ok(FoundationInfo {
        protocol_version: PROTOCOL_VERSION,
        app_name: "Aura",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        window_mode: "transparent-host",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_the_frontend_contract_in_camel_case() {
        let info = foundation_info(1).expect("matching protocol should connect");
        let json = serde_json::to_value(info).expect("metadata should serialize");
        assert_eq!(json["protocolVersion"], 1);
        assert_eq!(json["appName"], "Aura");
        assert_eq!(json["windowMode"], "transparent-host");
        assert!(json.get("protocol_version").is_none());
    }

    #[test]
    fn rejects_incompatible_frontend_versions_with_a_structured_error() {
        let error = foundation_info(0).expect_err("mismatched protocol must fail");
        let json = serde_json::to_value(error).expect("error should serialize");
        assert_eq!(json["code"], "PROTOCOL_MISMATCH");
        assert!(json["message"].as_str().unwrap().contains("Restart Aura"));
    }
}
