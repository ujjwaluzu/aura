use super::{
    github_api::{DeviceCode, Failure, GithubApi, OfficialApi, Poll},
    github_vault::{SavedAccount, Vault},
};
use crate::models::{github::*, AppError};
use std::{
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, MutexGuard},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

const REFRESH_SECONDS: u64 = 300;
struct Inner {
    view: GithubState,
    generation: u64,
    account: Option<SavedAccount>,
    device: Option<DeviceCode>,
    due: u64,
    failures: u32,
    busy: bool,
    closed: bool,
}
pub struct GithubService {
    inner: Mutex<Inner>,
    wake: Condvar,
    vault: Vault,
    client_id: String,
    api: Box<dyn GithubApi>,
    on_state: Box<dyn Fn(&GithubState) + Send + Sync>,
}
enum Work {
    Device,
    Poll(DeviceCode),
    Refresh(SavedAccount),
}
enum Outcome {
    Device(DeviceCode),
    Poll(Poll),
    Calendar(Calendar),
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn storage_error() -> AppError {
    AppError::new(
        "GITHUB_STORAGE",
        "Aura could not access its encrypted GitHub data. Try disconnecting again.",
    )
}
impl GithubService {
    pub fn new(directory: Option<PathBuf>, app: AppHandle) -> Result<Arc<Self>, AppError> {
        let client = std::env::var("AURA_GITHUB_CLIENT_ID")
            .ok()
            .or_else(|| option_env!("AURA_GITHUB_CLIENT_ID").map(String::from))
            .unwrap_or_default();
        let service = Arc::new(Self::with_api(
            directory,
            client,
            Box::new(OfficialApi::new().map_err(|_| {
                AppError::new("GITHUB_SETUP", "GitHub networking could not start.")
            })?),
            Box::new(move |state| {
                let _ = app.emit_to("widget-host", "aura://github-state", state);
            }),
        ));
        let worker = service.clone();
        std::thread::Builder::new()
            .name("aura-github".into())
            .spawn(move || worker.run())
            .map_err(|_| AppError::new("GITHUB_SETUP", "GitHub refresh could not start."))?;
        Ok(service)
    }
    fn with_api(
        directory: Option<PathBuf>,
        client_id: String,
        api: Box<dyn GithubApi>,
        on_state: Box<dyn Fn(&GithubState) + Send + Sync>,
    ) -> Self {
        let vault = Vault(directory);
        let configured =
            !client_id.is_empty() && client_id.bytes().all(|b| b.is_ascii_alphanumeric());
        let loaded = vault.load(&client_id);
        let failed = loaded.is_err();
        let account = loaded.ok().flatten();
        let calendar = account.as_ref().and_then(|a| a.calendar.clone());
        let status = if !configured {
            "unavailable"
        } else if failed {
            "reconnectRequired"
        } else if account.is_some() {
            "connected"
        } else {
            "disconnected"
        };
        Self {
            inner: Mutex::new(Inner {
                view: GithubState {
                    revision: 0,
                    status: status.into(),
                    configured,
                    refreshing: false,
                    stale: calendar.is_some(),
                    calendar,
                    authorization: None,
                    message: if !configured {
                        Some("Set Aura's GitHub OAuth client ID to enable connection.".into())
                    } else if failed {
                        Some("Saved GitHub data is unavailable. Reconnect your account.".into())
                    } else {
                        None
                    },
                    retry_at: None,
                },
                generation: 0,
                account,
                device: None,
                due: 0,
                failures: 0,
                busy: false,
                closed: false,
            }),
            wake: Condvar::new(),
            vault,
            client_id,
            api,
            on_state,
        }
    }
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
    fn publish(&self, i: &mut Inner) {
        i.view.revision += 1;
        (self.on_state)(&i.view);
    }
    pub fn status(&self) -> GithubState {
        self.lock().view.clone()
    }
    pub fn start_authorization(&self) -> Result<GithubState, AppError> {
        let mut i = self.lock();
        if !i.view.configured {
            return Err(AppError::new(
                "GITHUB_SETUP",
                "Configure AURA_GITHUB_CLIENT_ID and enable device flow in the OAuth app.",
            ));
        }
        if matches!(i.view.status.as_str(), "requesting" | "authorizing") {
            return Ok(i.view.clone());
        }
        // Invalidate every outstanding result before touching disk. Old work can never restore an account.
        i.generation += 1;
        i.account = None;
        i.device = None;
        i.view.calendar = None;
        i.view.authorization = None;
        i.view.refreshing = false;
        i.view.stale = false;
        i.view.status = "disconnected".into();
        self.vault.clear().map_err(|_| storage_error())?;
        i.view.status = "requesting".into();
        i.view.message = None;
        // Preserve server-mandated cooldowns even across connection attempts.
        i.due = i.view.retry_at.unwrap_or(0);
        self.publish(&mut i);
        self.wake.notify_one();
        Ok(i.view.clone())
    }
    pub fn cancel(&self) -> GithubState {
        let mut i = self.lock();
        if matches!(i.view.status.as_str(), "requesting" | "authorizing") {
            i.generation += 1;
            i.device = None;
            i.view.authorization = None;
            i.view.status = "disconnected".into();
            i.view.message = Some("GitHub authorization canceled.".into());
            self.publish(&mut i);
            self.wake.notify_one();
        }
        i.view.clone()
    }
    pub fn refresh(&self, only_if_stale: bool) -> GithubState {
        let mut i = self.lock();
        if i.view.status == "connected"
            && !i.busy
            && (!only_if_stale
                || i.view.stale
                || i.view
                    .calendar
                    .as_ref()
                    .is_none_or(|c| now().saturating_sub(c.updated_at) >= REFRESH_SECONDS))
        {
            i.due = i.view.retry_at.unwrap_or(0);
            self.wake.notify_one();
        }
        i.view.clone()
    }
    pub fn disconnect(&self) -> Result<GithubState, AppError> {
        let mut i = self.lock();
        i.generation += 1;
        i.account = None;
        i.device = None;
        i.view.calendar = None;
        i.view.authorization = None;
        i.view.refreshing = false;
        i.view.stale = false;
        i.view.status = "disconnected".into();
        i.view.message = None;
        let result = self.vault.clear();
        if result.is_err() {
            i.view.message =
                Some("Local cleanup failed. Retry Disconnect to remove saved GitHub data.".into());
        }
        self.publish(&mut i);
        self.wake.notify_one();
        result.map_err(|_| storage_error())?;
        Ok(i.view.clone())
    }
    pub fn shutdown(&self) {
        let mut i = self.lock();
        i.generation += 1;
        i.closed = true;
        self.wake.notify_one();
    }
    pub fn destination(&self, destination: GithubDestination) -> Result<String, AppError> {
        let i = self.lock();
        match destination {
            GithubDestination::Verification => Ok("https://github.com/login/device".into()),
            GithubDestination::Authorization if i.view.configured => Ok(format!(
                "https://github.com/settings/connections/applications/{}",
                self.client_id
            )),
            GithubDestination::Profile => i
                .view
                .calendar
                .as_ref()
                .filter(|c| super::github_api::valid_login(&c.login))
                .map(|c| format!("https://github.com/{}", c.login))
                .ok_or_else(|| {
                    AppError::new("GITHUB_ACCOUNT", "Connect GitHub to open your profile.")
                }),
            _ => Err(AppError::new("GITHUB_SETUP", "GitHub is not configured.")),
        }
    }
    fn run(&self) {
        loop {
            if self.lock().closed {
                break;
            }
            if self.step(now()) {
                continue;
            }
            let guard = self.lock();
            if guard.closed {
                break;
            }
            // Re-check wall time after sleep, resume or network recovery. Condvar wakes commands immediately.
            drop(
                self.wake
                    .wait_timeout(guard, Duration::from_secs(1))
                    .unwrap_or_else(|e| e.into_inner()),
            );
        }
    }
    fn step(&self, time: u64) -> bool {
        let (generation, work) = {
            let mut i = self.lock();
            if i.closed || i.busy {
                return false;
            }
            if i.device.as_ref().is_some_and(|d| d.expires_at <= time) {
                self.fail(&mut i, Failure::Expired, time);
                return true;
            }
            if time < i.due {
                return false;
            }
            let work = match i.view.status.as_str() {
                "requesting" => Work::Device,
                "authorizing" => match i.device.clone() {
                    Some(d) => Work::Poll(d),
                    None => return false,
                },
                "connected" => match i.account.clone() {
                    Some(a) => Work::Refresh(a),
                    None => return false,
                },
                _ => return false,
            };
            i.busy = true;
            if matches!(work, Work::Refresh(_)) {
                i.view.refreshing = true;
                self.publish(&mut i);
            }
            (i.generation, work)
        };
        let started = Instant::now();
        let result = match work {
            Work::Device => self.api.device(&self.client_id, time).map(Outcome::Device),
            Work::Poll(d) => self.api.poll(&self.client_id, &d, time).map(Outcome::Poll),
            Work::Refresh(mut saved) => {
                // Persist rotated tokens before the calendar call; a network error must not lose them.
                let rotate = if saved
                    .tokens
                    .expires_at
                    .is_some_and(|expiry| expiry <= time + 60)
                {
                    self.api
                        .rotate(&self.client_id, &saved.tokens, time)
                        .and_then(|tokens| {
                            let mut i = self.lock();
                            if i.generation != generation || i.closed {
                                return Err(Failure::Reconnect);
                            }
                            saved.tokens = tokens;
                            self.vault.save(&saved)?;
                            i.account = Some(saved.clone());
                            Ok(())
                        })
                } else {
                    Ok(())
                };
                rotate
                    .and_then(|_| self.api.calendar(&saved.tokens, time))
                    .map(Outcome::Calendar)
            }
        };
        let time = time.saturating_add(started.elapsed().as_secs());
        let mut i = self.lock();
        i.busy = false;
        if i.generation != generation || i.closed {
            return true;
        }
        i.view.refreshing = false;
        match result {
            Ok(Outcome::Device(d)) => {
                i.view.status = "authorizing".into();
                i.view.authorization = Some(DeviceAuthorization {
                    user_code: d.user_code.clone(),
                    expires_at: d.expires_at,
                });
                i.due = time + d.interval;
                i.device = Some(d);
                i.view.retry_at = None;
                self.publish(&mut i);
            }
            Ok(Outcome::Poll(Poll::Pending)) => {
                i.due = time + i.device.as_ref().map_or(5, |d| d.interval);
            }
            Ok(Outcome::Poll(Poll::SlowDown(interval))) => {
                if let Some(d) = &mut i.device {
                    d.interval = interval;
                }
                i.due = time + interval;
            }
            Ok(Outcome::Poll(Poll::Authorized(tokens))) => {
                i.device = None;
                i.view.authorization = None;
                i.account = Some(SavedAccount {
                    version: 1,
                    client_id: self.client_id.clone(),
                    account_id: String::new(),
                    tokens,
                    calendar: None,
                });
                // Identity is obtained by the immediately following viewer query.
                let result = self.vault.save(i.account.as_ref().unwrap());
                if result.is_err() {
                    self.fail(&mut i, Failure::Storage, time);
                } else {
                    i.view.status = "connected".into();
                    i.due = 0;
                    i.failures = 0;
                    self.publish(&mut i);
                }
            }
            Ok(Outcome::Calendar(calendar)) => {
                let mut saved = i.account.clone().unwrap();
                // Revalidate identity on every fetch, including after rotation. Never mix account caches.
                if !saved.account_id.is_empty() && saved.account_id != calendar.account_id {
                    i.view.calendar = None;
                    i.account = None;
                    let _ = self.vault.clear();
                    self.fail(&mut i, Failure::Reconnect, time);
                } else {
                    saved.account_id.clone_from(&calendar.account_id);
                    saved.calendar = Some(calendar.clone());
                    if self.vault.save(&saved).is_err() {
                        self.fail(&mut i, Failure::Storage, time);
                    } else {
                        i.account = Some(saved);
                        i.view.calendar = Some(calendar);
                        i.view.message = None;
                        i.view.stale = false;
                        i.view.retry_at = None;
                        i.failures = 0;
                        i.due = time + REFRESH_SECONDS;
                        self.publish(&mut i);
                    }
                }
            }
            Err(failure) => self.fail(&mut i, failure, time),
        }
        true
    }
    fn fail(&self, i: &mut Inner, failure: Failure, time: u64) {
        i.view.stale = i.view.calendar.is_some();
        i.view.refreshing = false;
        let (status, message) = match failure {
            Failure::Temporary(retry) => {
                i.failures = i.failures.saturating_add(1);
                let backoff = (15u64.saturating_mul(1u64 << i.failures.min(7))).min(1800);
                i.due = retry.unwrap_or(0).max(time + backoff).max(time + i.device.as_ref().map_or(0, |d| d.interval));
                i.view.retry_at = Some(i.due);
                (i.view.status.clone(), "GitHub is unreachable or limiting requests. Aura will retry automatically.")
            }
            Failure::Reconnect => ("reconnectRequired".into(), "GitHub authorization expired or changed. Reconnect your account."),
            Failure::Denied => ("failed".into(), "GitHub authorization was denied. Try connecting again."),
            Failure::Expired => ("failed".into(), "The GitHub verification code expired. Try connecting again."),
            Failure::Configuration => ("failed".into(), "GitHub connection failed. Check the OAuth client ID and enable device flow, then retry."),
            Failure::InvalidData => {
                i.due = time + REFRESH_SECONDS;
                i.view.retry_at = Some(i.due);
                (if i.account.is_some() { "connected" } else { "failed" }.into(), "GitHub returned incomplete contribution data. Refresh to try again.")
            }
            Failure::Storage => ("reconnectRequired".into(), "Aura could not save its encrypted GitHub data. Disconnect and reconnect."),
        };
        i.view.status = status;
        i.view.message = Some(message.into());
        if !matches!(i.view.status.as_str(), "requesting" | "authorizing") {
            i.device = None;
            i.view.authorization = None;
        }
        self.publish(i);
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::super::github_api::Tokens;
    use super::*;
    use std::{collections::VecDeque, sync::Barrier};

    #[derive(Default)]
    struct Script {
        polls: VecDeque<Result<Poll, Failure>>,
        calendars: VecDeque<Result<Calendar, Failure>>,
        calls: Vec<&'static str>,
        gate: Option<Arc<Barrier>>,
    }
    struct Fake(Arc<Mutex<Script>>);
    fn tokens() -> Tokens {
        Tokens {
            access: "fixture-access".into(),
            refresh: Some("fixture-refresh".into()),
            expires_at: None,
            refresh_expires_at: None,
        }
    }
    fn calendar(count: u32) -> Calendar {
        Calendar {
            account_id: "U_fixture".into(),
            login: "octocat".into(),
            total_contributions: count,
            weeks: vec![ContributionWeek {
                contribution_days: vec![ContributionDay {
                    date: "2028-02-29".into(),
                    weekday: 2,
                    contribution_count: count,
                    contribution_level: "THIRD_QUARTILE".into(),
                }],
            }],
            updated_at: 1000,
        }
    }
    impl GithubApi for Fake {
        fn device(&self, _: &str, now: u64) -> Result<DeviceCode, Failure> {
            let gate = {
                let mut s = self.0.lock().unwrap();
                s.calls.push("device");
                s.gate.clone()
            };
            if let Some(gate) = gate {
                gate.wait();
                gate.wait();
            }
            Ok(DeviceCode {
                device_code: "secret-device".into(),
                user_code: "ABCD-EFGH".into(),
                expires_at: now + 900,
                interval: 5,
            })
        }
        fn poll(&self, _: &str, _: &DeviceCode, _: u64) -> Result<Poll, Failure> {
            let mut s = self.0.lock().unwrap();
            s.calls.push("poll");
            s.polls.pop_front().unwrap_or(Ok(Poll::Pending))
        }
        fn rotate(&self, _: &str, _: &Tokens, _: u64) -> Result<Tokens, Failure> {
            let mut s = self.0.lock().unwrap();
            s.calls.push("rotate");
            let mut t = tokens();
            t.access = "rotated-access".into();
            t.refresh = Some("rotated-refresh".into());
            Ok(t)
        }
        fn calendar(&self, _: &Tokens, _: u64) -> Result<Calendar, Failure> {
            let mut s = self.0.lock().unwrap();
            s.calls.push("calendar");
            s.calendars.pop_front().unwrap_or_else(|| Ok(calendar(3)))
        }
    }
    struct Fixture {
        service: Arc<GithubService>,
        script: Arc<Mutex<Script>>,
        dir: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "aura-github-test-{}-{}",
                std::process::id(),
                rand::random::<u64>()
            ));
            let script = Arc::new(Mutex::new(Script::default()));
            let service = Arc::new(GithubService::with_api(
                Some(dir.clone()),
                "fixtureClient".into(),
                Box::new(Fake(script.clone())),
                Box::new(|_| {}),
            ));
            Self {
                service,
                script,
                dir,
            }
        }
        fn connect(&self) {
            self.script
                .lock()
                .unwrap()
                .polls
                .push_back(Ok(Poll::Authorized(tokens())));
            self.service.start_authorization().unwrap();
            assert!(self.service.step(1000));
            assert!(!self.service.step(1004));
            assert!(self.service.step(1005));
            assert!(self.service.step(1005));
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.service.vault.clear();
            let _ = std::fs::remove_dir(&self.dir);
        }
    }
    #[test]
    fn approval_fetches_immediately_then_auto_and_manual_refresh_update_zero_to_three() {
        let f = Fixture::new();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Ok(calendar(0)));
        f.connect();
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 0);
        assert!(!f.service.step(1304));
        assert!(f.service.step(1305));
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 3);
        f.service.refresh(false);
        assert!(f.service.step(1305));
        assert_eq!(
            f.script
                .lock()
                .unwrap()
                .calls
                .iter()
                .filter(|s| **s == "calendar")
                .count(),
            3
        );
    }
    #[test]
    fn polling_pending_slowdown_denial_expiry_and_retry() {
        let f = Fixture::new();
        f.script.lock().unwrap().polls.extend([
            Ok(Poll::Pending),
            Ok(Poll::SlowDown(10)),
            Err(Failure::Denied),
        ]);
        f.service.start_authorization().unwrap();
        f.service.step(1000);
        f.service.step(1005);
        f.service.step(1010);
        assert!(!f.service.step(1019));
        f.service.step(1020);
        assert_eq!(f.service.status().status, "failed");
        assert!(f.service.status().authorization.is_none());
        f.service.start_authorization().unwrap();
        f.service.step(2000);
        f.service.step(2900);
        assert!(f.service.status().message.unwrap().contains("expired"));
    }
    #[test]
    fn cancel_during_http_prevents_late_code_and_overlapping_work() {
        let f = Fixture::new();
        let gate = Arc::new(Barrier::new(2));
        f.script.lock().unwrap().gate = Some(gate.clone());
        f.service.start_authorization().unwrap();
        let service = f.service.clone();
        let thread = std::thread::spawn(move || service.step(1000));
        gate.wait();
        assert!(!f.service.step(1000));
        f.service.cancel();
        gate.wait();
        thread.join().unwrap();
        assert_eq!(f.service.status().status, "disconnected");
        assert!(f.service.status().authorization.is_none());
        assert!(f.service.vault.load("fixtureClient").unwrap().is_none());
    }
    #[test]
    fn token_rotation_is_saved_even_if_calendar_is_offline() {
        let f = Fixture::new();
        f.connect();
        f.service.lock().account.as_mut().unwrap().tokens.expires_at = Some(1006);
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(None)));
        f.service.step(1305);
        let saved = f.service.vault.load("fixtureClient").unwrap().unwrap();
        assert_eq!(saved.tokens.refresh.as_deref(), Some("rotated-refresh"));
        assert_eq!(saved.tokens.access, "rotated-access");
        assert!(f.service.status().stale);
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 3);
    }
    #[test]
    fn rate_limit_cannot_be_bypassed_by_manual_refresh() {
        let f = Fixture::new();
        f.connect();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(Some(5000))));
        f.service.step(1305);
        f.service.refresh(false);
        assert!(!f.service.step(4999));
        assert!(f.service.step(5000));
        assert!(!f.service.status().stale);
    }
    #[test]
    fn offline_restart_uses_account_bound_cache_and_refreshes_on_startup() {
        let f = Fixture::new();
        f.connect();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(None)));
        let service = GithubService::with_api(
            Some(f.dir.clone()),
            "fixtureClient".into(),
            Box::new(Fake(f.script.clone())),
            Box::new(|_| {}),
        );
        assert!(service.status().stale);
        assert_eq!(service.status().calendar.unwrap().login, "octocat");
        assert!(service.step(2000));
        assert!(service.status().stale);
        let changed = GithubService::with_api(
            Some(f.dir.clone()),
            "otherClient".into(),
            Box::new(Fake(f.script.clone())),
            Box::new(|_| {}),
        );
        assert_eq!(changed.status().status, "reconnectRequired");
        assert!(changed.status().calendar.is_none());
    }
    #[test]
    fn changed_identity_never_reuses_cache_and_disconnect_clears_disk() {
        let f = Fixture::new();
        f.connect();
        let mut other = calendar(7);
        other.account_id = "U_other".into();
        f.script.lock().unwrap().calendars.push_back(Ok(other));
        f.service.step(1305);
        assert_eq!(f.service.status().status, "reconnectRequired");
        assert!(f.service.status().calendar.is_none());
        f.service.disconnect().unwrap();
        assert!(f.service.vault.load("fixtureClient").unwrap().is_none());
        assert!(!f.service.step(9000));
    }
    #[test]
    fn encrypted_record_and_ipc_do_not_expose_tokens() {
        let f = Fixture::new();
        f.connect();
        let bytes = std::fs::read(f.dir.join("github-account.bin")).unwrap();
        assert!(!bytes.windows(14).any(|w| w == b"fixture-access"));
        let ipc = serde_json::to_string(&f.service.status()).unwrap();
        assert!(
            !ipc.contains("fixture-access")
                && !ipc.contains("fixture-refresh")
                && !ipc.contains("secret-device")
        );
        std::fs::write(f.dir.join("github-account.tmp"), b"encrypted-remnant").unwrap();
        f.service.disconnect().unwrap();
        assert!(!f.dir.join("github-account.bin").exists());
        assert!(!f.dir.join("github-account.tmp").exists());
    }
    #[test]
    fn fixed_destinations_do_not_accept_external_urls() {
        let f = Fixture::new();
        f.connect();
        assert_eq!(
            f.service.destination(GithubDestination::Profile).unwrap(),
            "https://github.com/octocat"
        );
        assert!(serde_json::from_str::<GithubDestination>("\"https://evil.example\"").is_err());
        assert_eq!(
            f.service
                .destination(GithubDestination::Authorization)
                .unwrap(),
            "https://github.com/settings/connections/applications/fixtureClient"
        );
    }
}
