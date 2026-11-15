use crate::models::AppError;

fn record() -> serde_json::Value {
    serde_json::from_str(include_str!("../../music-policy.json"))
        .expect("the bundled music policy must be valid JSON")
}

pub fn require(version: Option<&str>) -> Result<(), AppError> {
    if version.is_some() && version == record()["version"].as_str() {
        Ok(())
    } else {
        Err(AppError::new(
            "MUSIC_POLICY_REQUIRED",
            "Review and accept Aura's privacy policy and Music terms before connecting YouTube.",
        ))
    }
}

pub fn link(target: &str) -> Result<String, AppError> {
    record()["links"][target]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::new("INVALID_INPUT", "This policy link is unavailable."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consent_requires_current_version_and_links_are_fixed() {
        let policy = record();
        assert!(require(policy["version"].as_str()).is_ok());
        assert!(require(None).is_err());
        assert!(require(Some("outdated")).is_err());
        assert_eq!(
            link("googlePermissions").unwrap(),
            "https://security.google.com/settings/security/permissions"
        );
        for target in [
            "https://example.com",
            "file:///C:/Windows",
            "../project",
            "",
        ] {
            assert!(link(target).is_err());
        }
    }
}
