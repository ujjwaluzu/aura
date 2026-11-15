use std::{
    ffi::OsStr,
    io,
    path::{Path, PathBuf},
};

pub fn production_integration(development: bool, isolated: bool) -> bool {
    !development && !isolated
}

/// A process-local test profile prevents installer smoke tests from opening real accounts.
/// Both the explicit launch switch and an existing absolute directory are required.
pub fn test_profile<'a>(
    arguments: impl Iterator<Item = &'a OsStr>,
    configured: Option<&OsStr>,
) -> io::Result<Option<PathBuf>> {
    let testing = arguments
        .into_iter()
        .any(|argument| argument == "--isolated-test-profile");
    if !testing && configured.is_none() {
        return Ok(None);
    }
    if !testing {
        return Err(io::Error::other(
            "A test profile requires --isolated-test-profile.",
        ));
    }
    let path = configured
        .map(Path::new)
        .ok_or_else(|| io::Error::other("An isolated test profile directory is required."))?;
    if !path.is_absolute() || !path.is_dir() {
        return Err(io::Error::other(
            "The test profile must be an existing absolute directory.",
        ));
    }
    Ok(Some(path.canonicalize()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn development_and_isolated_profiles_skip_windows_integration() {
        assert!(production_integration(false, false));
        for (development, isolated) in [(true, false), (false, true), (true, true)] {
            assert!(!production_integration(development, isolated));
        }
    }
    #[test]
    fn normal_launch_uses_the_application_profile() {
        assert_eq!(
            test_profile([OsStr::new("aura")].into_iter(), None).unwrap(),
            None
        );
    }
    #[test]
    fn test_profiles_require_an_explicit_switch_and_directory() {
        assert!(test_profile([OsStr::new("aura")].into_iter(), Some(OsStr::new("."))).is_err());
        assert!(test_profile([OsStr::new("--isolated-test-profile")].into_iter(), None).is_err());
        assert!(test_profile(
            [OsStr::new("--isolated-test-profile")].into_iter(),
            Some(OsStr::new("."))
        )
        .is_err());
    }
    #[test]
    fn explicit_test_launch_resolves_only_the_provided_directory() {
        let directory = std::env::temp_dir().canonicalize().unwrap();
        let actual = test_profile(
            [OsStr::new("--isolated-test-profile")].into_iter(),
            Some(directory.as_os_str()),
        )
        .unwrap();
        assert_eq!(actual, Some(directory));
    }
}
