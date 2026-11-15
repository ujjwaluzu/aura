use crate::models::AppError;
use serde::Serialize;
use std::{fs, io::Write, path::PathBuf, sync::Mutex};

const MARKER: &str = "startup-initialized-v1";
const UNAVAILABLE: &str =
    "Startup is unavailable in development and isolated test profiles. Open the installed Aura app to change it.";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub available: bool,
    pub enabled: bool,
    pub warning: Option<String>,
}

// The plugin is called only by this service. A fake backend exercises failures
// without ever touching the current user's Windows registry.
pub trait Registration: Send + Sync {
    fn is_enabled(&self) -> Result<bool, AppError>;
    fn set_enabled(&self, enabled: bool) -> Result<(), AppError>;
}

pub struct StartupService {
    directory: Option<PathBuf>,
    registration: Option<Box<dyn Registration>>,
    warning: Mutex<Option<String>>,
}

impl StartupService {
    pub fn new(directory: Option<PathBuf>, registration: Option<Box<dyn Registration>>) -> Self {
        let service = Self {
            directory,
            registration,
            warning: Mutex::new(None),
        };
        if service.registration.is_some() {
            if let Err(error) = service.initialize() {
                *service.warning.lock().unwrap() = Some(error.message);
            }
        }
        service
    }

    fn initialize(&self) -> Result<(), AppError> {
        // Claim the one-time default BEFORE querying/changing Windows. Even a
        // failed registration must never replay automatically after a restart.
        if self.mark_initialized()? {
            let registration = self.registration.as_ref().unwrap();
            if !registration.is_enabled()? {
                registration.set_enabled(true)?;
            }
        }
        Ok(())
    }

    fn mark_initialized(&self) -> Result<bool, AppError> {
        let directory = self.directory.as_ref().ok_or_else(marker_error)?;
        fs::create_dir_all(directory).map_err(|_| marker_error())?;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(directory.join(MARKER))
        {
            Ok(mut file) => {
                file.write_all(b"Default attempted. Windows registration is authoritative.\n")
                    .and_then(|_| file.sync_all())
                    .map_err(|_| marker_error())?;
                Ok(true)
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
            Err(_) => Err(marker_error()),
        }
    }

    pub fn status(&self) -> Result<StartupStatus, AppError> {
        let warning = self.warning.lock().map_err(|_| operation_error())?;
        let Some(registration) = &self.registration else {
            return Ok(StartupStatus {
                available: false,
                enabled: false,
                warning: Some(UNAVAILABLE.into()),
            });
        };
        Ok(StartupStatus {
            available: true,
            enabled: registration.is_enabled()?,
            warning: warning.clone(),
        })
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<StartupStatus, AppError> {
        let mut warning = self.warning.lock().map_err(|_| operation_error())?;
        let registration = self
            .registration
            .as_ref()
            .ok_or_else(|| AppError::new("STARTUP_UNAVAILABLE", UNAVAILABLE))?;
        self.mark_initialized()?;
        registration.set_enabled(enabled)?;
        let actual = registration.is_enabled()?;
        if actual != enabled {
            return Err(operation_error());
        }
        *warning = None;
        Ok(StartupStatus {
            available: true,
            enabled: actual,
            warning: None,
        })
    }
}

fn marker_error() -> AppError {
    AppError::new(
        "STARTUP_SAVE",
        "Aura could not save startup initialization. Check that your Aura app data folder is writable, then try again in General settings.",
    )
}

fn operation_error() -> AppError {
    AppError::new(
        "STARTUP_REGISTRATION",
        "Aura could not read or change Windows startup registration. Try again, or check Windows Settings > Apps > Startup and your device's startup policy.",
    )
}

#[cfg(windows)]
pub struct WindowsRegistration(pub tauri::AppHandle);

#[cfg(windows)]
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

#[cfg(windows)]
fn windows_command(path: &std::path::Path) -> String {
    format!("\"{}\"", path.display())
}

#[cfg(windows)]
impl Registration for WindowsRegistration {
    fn is_enabled(&self) -> Result<bool, AppError> {
        // Report registration, independently of StartupApproved overrides.
        // The plugin combines these states and hides some registry read errors.
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        match RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(RUN_KEY)
            .and_then(|key| key.get_value::<String, _>("Aura"))
        {
            Ok(_) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => {
                eprintln!("Aura could not read startup registration: {error}");
                Err(operation_error())
            }
        }
    }

    fn set_enabled(&self, enabled: bool) -> Result<(), AppError> {
        use tauri_plugin_autostart::ManagerExt;
        let manager = self.0.autolaunch();
        if enabled {
            // A fresh Windows account need not have a Run key yet.
            use winreg::{enums::HKEY_CURRENT_USER, RegKey};
            RegKey::predef(HKEY_CURRENT_USER)
                .create_subkey(RUN_KEY)
                .map_err(|error| {
                    eprintln!("Aura could not open its startup registry key: {error}");
                    operation_error()
                })?;
        }
        // Removing an already removed entry is a successful explicit choice.
        if !enabled && !self.is_enabled()? {
            return Ok(());
        }
        let result = if enabled {
            manager.enable()
        } else {
            manager.disable()
        };
        if let Err(error) = result {
            // Upstream can fail after writing Run (e.g. an override policy).
            // Do not leave its intermediate, unquoted registration behind.
            if enabled {
                let _ = manager.disable();
            }
            eprintln!("Aura could not change startup registration: {error}");
            return Err(operation_error());
        }
        if enabled {
            use winreg::{
                enums::{HKEY_CURRENT_USER, KEY_SET_VALUE},
                RegKey,
            };
            // Upstream 2.5.1/auto-launch 0.5 writes an unquoted executable.
            // Normalize only Aura's own HKCU value, without arguments, so paths
            // containing spaces are safe to execute at Windows sign-in.
            let result = std::env::current_exe().and_then(|path| {
                RegKey::predef(HKEY_CURRENT_USER)
                    .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)?
                    .set_value("Aura", &windows_command(&path))
            });
            if let Err(error) = result {
                let _ = manager.disable();
                eprintln!("Aura could not quote its startup executable: {error}");
                return Err(operation_error());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn windows_executable_paths_are_quoted_without_arguments() {
        assert_eq!(
            windows_command(std::path::Path::new(r"C:\Users\A Person\Aura\aura.exe")),
            r#""C:\Users\A Person\Aura\aura.exe""#
        );
        // NSIS removes a startup value named after productName on uninstall.
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(config["productName"], "Aura");
    }
    use std::sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    };

    #[derive(Default)]
    struct FakeRegistration {
        enabled: AtomicBool,
        fail_read: AtomicBool,
        fail_write: AtomicBool,
        ignore_write: AtomicBool,
        writes: AtomicUsize,
    }
    impl Registration for Arc<FakeRegistration> {
        fn is_enabled(&self) -> Result<bool, AppError> {
            if self.fail_read.load(Ordering::SeqCst) {
                return Err(operation_error());
            }
            Ok(self.enabled.load(Ordering::SeqCst))
        }
        fn set_enabled(&self, enabled: bool) -> Result<(), AppError> {
            self.writes.fetch_add(1, Ordering::SeqCst);
            if self.fail_write.load(Ordering::SeqCst) {
                return Err(operation_error());
            }
            if !self.ignore_write.load(Ordering::SeqCst) {
                self.enabled.store(enabled, Ordering::SeqCst);
            }
            Ok(())
        }
    }
    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "Aura startup test with spaces {} {}",
                std::process::id(),
                rand::random::<u64>()
            )))
        }
        fn service(&self, backend: &Arc<FakeRegistration>) -> StartupService {
            StartupService::new(Some(self.0.clone()), Some(Box::new(backend.clone())))
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn first_launch_defaults_once_and_choices_survive_restart_and_upgrade() {
        let directory = Directory::new();
        let backend = Arc::new(FakeRegistration::default());
        let store = directory.service(&backend);
        assert!(directory.0.join(MARKER).is_file());
        assert!(store.status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 1);
        assert!(directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 1);
        store.set_enabled(false).unwrap();
        assert!(!directory.service(&backend).status().unwrap().enabled);
        directory.service(&backend).set_enabled(true).unwrap();
        assert!(directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 3);
        assert!(!directory.0.join("preferences.json").exists());
    }

    #[test]
    fn removed_registration_is_never_automatically_restored() {
        let directory = Directory::new();
        let backend = Arc::new(FakeRegistration::default());
        directory.service(&backend);
        backend.enabled.store(false, Ordering::SeqCst);
        assert!(!directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 1);
        // Even an empty/corrupt marker conservatively suppresses the default.
        fs::write(directory.0.join(MARKER), b"").unwrap();
        assert!(!directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_default_is_visible_and_not_retried_without_user_action() {
        let directory = Directory::new();
        let backend = Arc::new(FakeRegistration::default());
        backend.fail_write.store(true, Ordering::SeqCst);
        let store = directory.service(&backend);
        let status = store.status().unwrap();
        assert!(!status.enabled);
        assert!(status.warning.is_some());
        backend.fail_write.store(false, Ordering::SeqCst);
        assert!(!directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 1);
        assert!(store.set_enabled(true).unwrap().enabled);
        assert!(store.status().unwrap().warning.is_none());
    }

    #[test]
    fn read_and_write_failures_do_not_report_success() {
        let directory = Directory::new();
        let backend = Arc::new(FakeRegistration::default());
        let store = directory.service(&backend);
        backend.fail_write.store(true, Ordering::SeqCst);
        assert!(store.set_enabled(false).is_err());
        assert!(store.status().unwrap().enabled);
        backend.fail_write.store(false, Ordering::SeqCst);
        backend.ignore_write.store(true, Ordering::SeqCst);
        assert!(store.set_enabled(false).is_err());
        backend.fail_read.store(true, Ordering::SeqCst);
        assert!(store.status().is_err());
        assert!(store.set_enabled(false).is_err());
    }

    #[test]
    fn failed_marker_persistence_prevents_registration() {
        let directory = Directory::new();
        fs::write(&directory.0, b"not a directory").unwrap();
        let backend = Arc::new(FakeRegistration::default());
        let store = directory.service(&backend);
        assert!(store.status().unwrap().warning.is_some());
        assert!(store.set_enabled(true).is_err());
        assert_eq!(backend.writes.load(Ordering::SeqCst), 0);
        fs::remove_file(&directory.0).unwrap();
    }

    #[test]
    fn unavailable_profiles_never_create_a_marker() {
        let directory = Directory::new();
        let store = StartupService::new(Some(directory.0.clone()), None);
        assert!(!store.status().unwrap().available);
        assert!(store.set_enabled(true).is_err());
        assert!(!directory.0.exists());
    }

    #[test]
    fn an_existing_registration_is_preserved_on_first_launch() {
        let directory = Directory::new();
        let backend = Arc::new(FakeRegistration::default());
        backend.enabled.store(true, Ordering::SeqCst);
        assert!(directory.service(&backend).status().unwrap().enabled);
        assert_eq!(backend.writes.load(Ordering::SeqCst), 0);
    }
}
