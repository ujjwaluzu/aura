//! Browser-scoped Core Audio volume. Audio endpoints and sessions can disappear
//! during a scan; one stale entry must not hide a healthy session elsewhere.
use crate::models::AppError;
use windows::{
    core::{Interface, HRESULT, PWSTR},
    Win32::{
        Foundation::CloseHandle,
        Media::Audio::{
            eRender, AudioSessionStateExpired, IAudioSessionControl, IAudioSessionControl2,
            IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume,
            MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
        },
        System::{
            Com::{CoCreateInstance, CLSCTX_ALL},
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Failure {
    NotReady,
    Windows(HRESULT),
}
impl From<windows::core::Error> for Failure {
    fn from(error: windows::core::Error) -> Self {
        Self::Windows(error.code())
    }
}
trait AudioBackend {
    type Endpoint;
    type Session;
    fn endpoints(&self) -> Result<Vec<Self::Endpoint>, Failure>;
    fn sessions(&self, endpoint: &Self::Endpoint) -> Result<Vec<Self::Session>, Failure>;
    fn executable(&self, session: &Self::Session) -> Option<String>;
    fn volume(&self, session: &Self::Session, level: Option<f32>) -> Result<f32, Failure>;
}
fn browser_executable(source: &str) -> Option<&'static str> {
    let source = source.to_ascii_lowercase();
    if source.contains("brave") {
        Some("brave.exe")
    } else if source.contains("msedge") || source.contains("edge") {
        Some("msedge.exe")
    } else if source.contains("firefox") {
        Some("firefox.exe")
    } else if source.contains("chrome") {
        Some("chrome.exe")
    } else {
        None
    }
}
fn matches_executable(path: &str, executable: &str) -> bool {
    path.rsplit(['\\', '/'])
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case(executable))
}
fn scan<B: AudioBackend>(
    backend: &B,
    executable: &str,
    level: Option<f32>,
) -> Result<f32, Failure> {
    let mut total = 0.0;
    let mut count = 0;
    let mut readable_endpoints = 0;
    let mut endpoint_error = None;
    let mut matching_error = None;
    for endpoint in backend.endpoints()? {
        let sessions = match backend.sessions(&endpoint) {
            Ok(sessions) => {
                readable_endpoints += 1;
                sessions
            }
            Err(error) => {
                endpoint_error = Some(error);
                continue;
            }
        };
        for session in sessions {
            if !backend
                .executable(&session)
                .is_some_and(|path| matches_executable(&path, executable))
            {
                continue;
            }
            match backend.volume(&session, level) {
                Ok(value) if value.is_finite() && (0.0..=1.0).contains(&value) => {
                    total += value;
                    count += 1;
                }
                Ok(_) => {}
                Err(error) => matching_error = Some(error),
            }
        }
    }
    if count > 0 {
        return Ok(total / count as f32);
    }
    // Never read GetLastError here: an empty search is not a failed Win32 call.
    Err(matching_error
        .or({
            if readable_endpoints == 0 {
                endpoint_error
            } else {
                None
            }
        })
        .unwrap_or(Failure::NotReady))
}
fn lookup<B: AudioBackend>(
    backend: &B,
    executable: &str,
    level: Option<f32>,
    retry: impl FnOnce(),
) -> Result<f32, Failure> {
    match scan(backend, executable, level) {
        Ok(value) => Ok(value),
        Err(_) => {
            retry();
            scan(backend, executable, level)
        }
    }
}
struct WindowsAudio;
impl AudioBackend for WindowsAudio {
    type Endpoint = IMMDevice;
    type Session = IAudioSessionControl;
    fn endpoints(&self) -> Result<Vec<IMMDevice>, Failure> {
        unsafe {
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let endpoints = devices.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            Ok((0..endpoints.GetCount()?)
                .filter_map(|index| endpoints.Item(index).ok())
                .collect())
        }
    }
    fn sessions(&self, endpoint: &IMMDevice) -> Result<Vec<IAudioSessionControl>, Failure> {
        unsafe {
            let manager: IAudioSessionManager2 = endpoint.Activate(CLSCTX_ALL, None)?;
            let sessions = manager.GetSessionEnumerator()?;
            Ok((0..sessions.GetCount()?)
                .filter_map(|index| sessions.GetSession(index).ok())
                .collect())
        }
    }
    fn executable(&self, session: &IAudioSessionControl) -> Option<String> {
        unsafe {
            // Inactive sessions are valid for paused playback. Expired ones are not.
            if session.GetState().ok()? == AudioSessionStateExpired {
                return None;
            }
            let control: IAudioSessionControl2 = session.cast().ok()?;
            let pid = control.GetProcessId().ok().filter(|pid| *pid != 0)?;
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut path = vec![0u16; 32768];
            let mut length = path.len() as u32;
            let result = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path.as_mut_ptr()),
                &mut length,
            );
            let _ = CloseHandle(process);
            result.ok()?;
            Some(String::from_utf16_lossy(&path[..length as usize]))
        }
    }
    fn volume(&self, session: &IAudioSessionControl, level: Option<f32>) -> Result<f32, Failure> {
        unsafe {
            let volume: ISimpleAudioVolume = session.cast()?;
            if let Some(level) = level {
                volume.SetMasterVolume(level, std::ptr::null())?;
            }
            Ok(volume.GetMasterVolume()?)
        }
    }
}
pub fn browser_volume(source: &str, level: Option<f32>) -> Result<f32, AppError> {
    let executable = browser_executable(source).ok_or_else(|| {
        AppError::new(
            "BROWSER_VOLUME_UNSUPPORTED",
            "This player does not expose browser volume controls.",
        )
    })?;
    lookup(&WindowsAudio, executable, level, || {
        std::thread::sleep(std::time::Duration::from_millis(120))
    })
    .map_err(|failure| match failure {
        Failure::NotReady => AppError::new(
            "BROWSER_VOLUME_PENDING",
            "The browser audio session is not ready. Aura will retry when it becomes available.",
        ),
        Failure::Windows(code) => {
            eprintln!("Aura browser audio session could not be accessed: {code:?}");
            AppError::new(
                "BROWSER_VOLUME_UNAVAILABLE",
                "Windows could not access the browser audio session. Aura will retry.",
            )
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::{Cell, RefCell},
        collections::VecDeque,
    };
    const GONE: Failure = Failure::Windows(HRESULT(0x88890004u32 as i32));
    type FakeSession = (Option<&'static str>, Result<f32, Failure>);
    type FakeEndpoint = Result<Vec<FakeSession>, Failure>;
    struct Fake {
        scans: RefCell<VecDeque<Vec<FakeEndpoint>>>,
        writes: RefCell<Vec<(&'static str, f32)>>,
    }
    impl AudioBackend for Fake {
        type Endpoint = Result<Vec<Self::Session>, Failure>;
        type Session = (Option<&'static str>, Result<f32, Failure>);
        fn endpoints(&self) -> Result<Vec<Self::Endpoint>, Failure> {
            Ok(self.scans.borrow_mut().pop_front().unwrap_or_default())
        }
        fn sessions(&self, endpoint: &Self::Endpoint) -> Result<Vec<Self::Session>, Failure> {
            endpoint.clone()
        }
        fn executable(&self, session: &Self::Session) -> Option<String> {
            session.0.map(String::from)
        }
        fn volume(&self, session: &Self::Session, level: Option<f32>) -> Result<f32, Failure> {
            let value = session.1?;
            if let Some(level) = level {
                self.writes.borrow_mut().push((session.0.unwrap(), level));
                return Ok(level);
            }
            Ok(value)
        }
    }
    #[test]
    fn stale_endpoint_and_session_do_not_hide_healthy_brave_audio() {
        let backend = Fake {
            scans: RefCell::new(VecDeque::from([vec![
                Err(GONE),
                Ok(vec![
                    (Some("brave.exe"), Err(GONE)),
                    (Some("brave.exe"), Ok(0.4)),
                ]),
            ]])),
            writes: RefCell::default(),
        };
        assert_eq!(scan(&backend, "brave.exe", None), Ok(0.4));
    }
    #[test]
    fn volume_only_changes_exact_browser_executables_across_endpoints() {
        let backend = Fake {
            scans: RefCell::new(VecDeque::from([vec![
                Ok(vec![
                    (Some("not-brave.exe"), Ok(0.9)),
                    (Some("chrome.exe"), Ok(0.2)),
                    (Some("C:\\Brave\\BRAVE.EXE"), Ok(0.5)),
                ]),
                Ok(vec![(Some("brave.exe"), Ok(0.7)), (None, Ok(0.9))]),
            ]])),
            writes: RefCell::default(),
        };
        assert_eq!(scan(&backend, "brave.exe", Some(0.3)), Ok(0.3));
        assert_eq!(
            *backend.writes.borrow(),
            vec![("C:\\Brave\\BRAVE.EXE", 0.3), ("brave.exe", 0.3)]
        );
    }
    #[test]
    fn audio_process_recreation_is_rescanned_once() {
        let backend = Fake {
            scans: RefCell::new(VecDeque::from([
                vec![Ok(vec![])],
                vec![Ok(vec![(Some("brave.exe"), Ok(0.6))])],
            ])),
            writes: RefCell::default(),
        };
        let retries = Cell::new(0);
        assert_eq!(
            lookup(&backend, "brave.exe", None, || retries
                .set(retries.get() + 1)),
            Ok(0.6)
        );
        assert_eq!(retries.get(), 1);
    }
    #[test]
    fn missing_audio_does_not_reuse_an_unrelated_windows_last_error() {
        unsafe {
            windows::Win32::Foundation::SetLastError(windows::Win32::Foundation::WIN32_ERROR(
                0x36B7,
            ));
        }
        let backend = Fake {
            scans: RefCell::new(VecDeque::from([vec![Ok(vec![])]])),
            writes: RefCell::default(),
        };
        assert_eq!(scan(&backend, "brave.exe", None), Err(Failure::NotReady));
    }
    #[test]
    fn source_matching_and_invalid_levels_do_not_create_fake_volume() {
        for (source, exe) in [
            ("Brave", "brave.exe"),
            ("Chrome", "chrome.exe"),
            ("MicrosoftEdge", "msedge.exe"),
            ("org.mozilla.firefox", "firefox.exe"),
        ] {
            assert_eq!(browser_executable(source), Some(exe));
        }
        assert_eq!(browser_executable("Spotify"), None);
        let backend = Fake {
            scans: RefCell::new(VecDeque::from([vec![Ok(vec![
                (Some("brave.exe"), Ok(f32::NAN)),
                (Some("brave.exe"), Ok(2.0)),
            ])]])),
            writes: RefCell::default(),
        };
        assert_eq!(scan(&backend, "brave.exe", None), Err(Failure::NotReady));
    }
    #[test]
    #[ignore = "Read-only live Core Audio probe; requires a running Brave audio session"]
    fn live_brave_volume_read() {
        use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
        unsafe {
            RoInitialize(RO_INIT_MULTITHREADED).unwrap();
        }
        let result = browser_volume("Brave", None);
        unsafe {
            RoUninitialize();
        }
        match result {
            Ok(level) => {
                assert!((0.0..=1.0).contains(&level));
                println!(
                    "Live Brave Core Audio volume read succeeded: {:.0}%",
                    level * 100.0
                );
            }
            Err(error) => panic!("Live Brave volume read did not complete: {}", error.code),
        }
    }
}
