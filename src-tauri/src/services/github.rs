use super::{
    github_api::{DeviceCode, Failure, GithubApi, OfficialApi, Poll, Tokens},
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
    pending: Option<Tokens>,
    due: u64,
    work_due: [u64; 4],
    append: [bool; 4],
    cooldown: u64,
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
    Verify(Tokens),
    Refresh(SavedAccount),
    Category(SavedAccount, WorkCategory, Option<String>),
}
enum Outcome {
    Device(DeviceCode),
    Poll(Poll),
    Authorized(Box<SavedAccount>),
    Calendar(Calendar),
    Category(WorkCategoryState),
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
fn permitted(account: &SavedAccount) -> bool {
    account.tokens.scopes.iter().any(|s| s == "repo")
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
        let identity = account.as_ref().and_then(|a| a.identity.clone());
        let permission = account.as_ref().is_some_and(permitted);
        let mut work = empty_work(permission);
        if let Some(a) = &account {
            for cached in &a.work {
                let c = &mut work[cached.category.index()];
                *c = cached.clone();
                c.loading = false;
                c.stale = c.updated_at.is_some();
                if !permission {
                    *c = empty_work(false)[cached.category.index()].clone();
                }
            }
        }
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
                    account: identity,
                    work_permission: permission,
                    work,
                },
                generation: 0,
                account,
                device: None,
                pending: None,
                due: 0,
                work_due: [0; 4],
                append: [false; 4],
                cooldown: 0,
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
        // Keep the current account on disk and in memory until a verified replacement is ready.
        i.generation += 1;
        i.pending = None;
        i.device = None;
        i.view.authorization = None;
        i.view.refreshing = false;
        for c in &mut i.view.work {
            c.loading = false;
        }
        i.view.status = "requesting".into();
        i.view.message = None;
        i.due = i.cooldown;
        self.publish(&mut i);
        self.wake.notify_one();
        Ok(i.view.clone())
    }
    pub fn cancel(&self) -> GithubState {
        let mut i = self.lock();
        if matches!(i.view.status.as_str(), "requesting" | "authorizing") {
            i.generation += 1;
            i.pending = None;
            i.device = None;
            i.view.authorization = None;
            i.view.status = if i.account.is_some() {
                "connected"
            } else {
                "disconnected"
            }
            .into();
            i.view.message = Some("GitHub authorization canceled.".into());
            i.due = i.cooldown;
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
    pub fn refresh_work(
        &self,
        only_if_stale: bool,
        category: Option<WorkCategory>,
        more: bool,
    ) -> GithubState {
        let mut i = self.lock();
        if i.view.status == "connected" && i.view.work_permission {
            for c in WorkCategory::ALL {
                if category.is_some_and(|selected| selected != c) {
                    continue;
                }
                let index = c.index();
                let cache = &i.view.work[index];
                if cache.loading {
                    continue;
                }
                if more
                    && (!cache.has_next_page || cache.items.len() >= 1000 || cache.cursor.is_none())
                {
                    continue;
                }
                if more
                    || !only_if_stale
                    || cache.stale
                    || cache
                        .updated_at
                        .is_none_or(|t| now().saturating_sub(t) >= REFRESH_SECONDS)
                {
                    i.work_due[index] = 0;
                    i.append[index] = more;
                }
            }
            self.wake.notify_one();
        }
        i.view.clone()
    }
    pub fn disconnect(&self) -> Result<GithubState, AppError> {
        let mut i = self.lock();
        i.generation += 1;
        i.account = None;
        i.pending = None;
        i.device = None;
        i.view.account = None;
        i.view.calendar = None;
        i.view.work = empty_work(false);
        i.view.work_permission = false;
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
                .account
                .as_ref()
                .filter(|a| super::github_api::valid_login(&a.login))
                .map(|a| format!("https://github.com/{}", a.login))
                .ok_or_else(|| {
                    AppError::new("GITHUB_ACCOUNT", "Connect GitHub to open your profile.")
                }),
            _ => Err(AppError::new("GITHUB_SETUP", "GitHub is not configured.")),
        }
    }
    pub fn work_destination(
        &self,
        category: WorkCategory,
        id: Option<String>,
    ) -> Result<String, AppError> {
        let i = self.lock();
        let account = i
            .view
            .account
            .as_ref()
            .filter(|_| i.view.work_permission)
            .ok_or_else(|| {
                AppError::new(
                    "GITHUB_ACCOUNT",
                    "Connect GitHub with repository access to open Work.",
                )
            })?;
        if let Some(id) = id {
            let item = i.view.work[category.index()]
                .items
                .iter()
                .find(|item| {
                    item.id == id
                        && super::github_api::valid_repository(&item.repository)
                        && item.number > 0
                })
                .ok_or_else(|| AppError::new("GITHUB_ITEM", "Refresh Work to open this item."))?;
            Ok(format!(
                "https://github.com/{}/{}/{}{}",
                item.repository,
                if category == WorkCategory::Issues {
                    "issues"
                } else {
                    "pull"
                },
                item.number,
                if category == WorkCategory::FailingPrs {
                    "/checks"
                } else {
                    ""
                }
            ))
        } else {
            if !super::github_api::valid_login(&account.login) {
                return Err(AppError::new("GITHUB_ACCOUNT", "Reconnect GitHub."));
            }
            let query = super::github_api::work_query(&account.login, category);
            let encoded: String = query
                .bytes()
                .map(|b| {
                    if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                        (b as char).to_string()
                    } else {
                        format!("%{b:02X}")
                    }
                })
                .collect();
            Ok(format!(
                "https://github.com/search?type={}&q={encoded}",
                if category == WorkCategory::Issues {
                    "issues"
                } else {
                    "pullrequests"
                }
            ))
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
            drop(
                self.wake
                    .wait_timeout(guard, Duration::from_secs(1))
                    .unwrap_or_else(|e| e.into_inner()),
            );
        }
    }
    fn rotate(
        &self,
        mut saved: SavedAccount,
        generation: u64,
        time: u64,
    ) -> Result<SavedAccount, Failure> {
        if saved
            .tokens
            .expires_at
            .is_some_and(|expiry| expiry <= time + 60)
        {
            let previous_access = saved.tokens.access.clone();
            let tokens = self.api.rotate(&self.client_id, &saved.tokens, time)?;
            let mut i = self.lock();
            // Upgrading or canceling can invalidate this fetch while rotation is in flight.
            // Preserve the returned credentials only if the same old connection is still present.
            // Disconnect/account replacement must never be undone by an outstanding response.
            let mut current = i
                .account
                .clone()
                .filter(|current| {
                    !i.closed
                        && current.account_id == saved.account_id
                        && current.tokens.access == previous_access
                })
                .ok_or(Failure::Reconnect)?;
            current.tokens = tokens;
            self.vault.save(&current)?;
            i.view.work_permission = permitted(&current);
            i.account = Some(current.clone());
            saved = current;
            if i.generation != generation {
                return Err(Failure::Temporary(None));
            }
            drop(i);
            let identity = self.api.identity(&saved.tokens, time)?;
            if identity.account_id != saved.account_id {
                return Err(Failure::Reconnect);
            }
        }
        Ok(saved)
    }
    fn step(&self, time: u64) -> bool {
        let (generation, work, category, append) = {
            let mut i = self.lock();
            if i.closed || i.busy {
                return false;
            }
            if i.pending.is_none() && i.device.as_ref().is_some_and(|d| d.expires_at <= time) {
                self.fail(&mut i, Failure::Expired, time);
                return true;
            }
            if time < i.cooldown {
                return false;
            }
            let mut category = None;
            let mut append = false;
            let work = match i.view.status.as_str() {
                "requesting" if time >= i.due => Work::Device,
                "authorizing" if time >= i.due => {
                    if let Some(tokens) = i.pending.clone() {
                        Work::Verify(tokens)
                    } else {
                        match i.device.clone() {
                            Some(d) => Work::Poll(d),
                            None => return false,
                        }
                    }
                }
                "connected" => {
                    let Some(a) = i.account.clone() else {
                        return false;
                    };
                    if time >= i.due {
                        Work::Refresh(a)
                    } else if i.view.work_permission && a.identity.is_some() {
                        let Some(c) = WorkCategory::ALL
                            .into_iter()
                            .find(|c| time >= i.work_due[c.index()])
                        else {
                            return false;
                        };
                        category = Some(c);
                        append = i.append[c.index()];
                        let cache = &mut i.view.work[c.index()];
                        cache.loading = true;
                        Work::Category(a, c, if append { cache.cursor.clone() } else { None })
                    } else {
                        return false;
                    }
                }
                _ => return false,
            };
            i.busy = true;
            if matches!(work, Work::Refresh(_)) {
                i.view.refreshing = true;
            }
            if matches!(work, Work::Refresh(_) | Work::Category(..)) {
                self.publish(&mut i);
            }
            (i.generation, work, category, append)
        };
        let started = Instant::now();
        let result = match work {
            Work::Device => self.api.device(&self.client_id, time).map(Outcome::Device),
            Work::Poll(d) => self.api.poll(&self.client_id, &d, time).map(Outcome::Poll),
            Work::Verify(tokens) => self.api.identity(&tokens, time).map(|identity| {
                Outcome::Authorized(Box::new(SavedAccount {
                    version: 2,
                    client_id: self.client_id.clone(),
                    account_id: identity.account_id.clone(),
                    identity: Some(identity),
                    tokens,
                    calendar: None,
                    work: vec![],
                }))
            }),
            Work::Refresh(saved) => self
                .rotate(saved, generation, time)
                .and_then(|a| self.api.calendar(&a.tokens, time))
                .map(Outcome::Calendar),
            Work::Category(saved, c, cursor) => self
                .rotate(saved, generation, time)
                .and_then(|a| {
                    self.api.work(
                        &a.tokens,
                        &a.identity.as_ref().ok_or(Failure::InvalidData)?.login,
                        c,
                        cursor.as_deref(),
                        time,
                    )
                })
                .map(Outcome::Category),
        };
        let time = time.saturating_add(started.elapsed().as_secs());
        let mut i = self.lock();
        i.busy = false;
        if i.generation != generation || i.closed {
            return true;
        }
        i.view.refreshing = false;
        if let Some(c) = category {
            i.view.work[c.index()].loading = false;
        }
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
                i.pending = Some(tokens);
                i.due = 0;
            }
            Ok(Outcome::Authorized(saved)) => {
                let mut saved = *saved;
                if let Some(old) = &i.account {
                    if old.account_id == saved.account_id {
                        saved.calendar = old.calendar.clone();
                        saved.work = old.work.clone();
                    }
                }
                if self.vault.save(&saved).is_err() {
                    self.fail(&mut i, Failure::Storage, time);
                } else {
                    i.view.account = saved.identity.clone();
                    i.view.calendar = saved.calendar.clone();
                    i.view.work_permission = permitted(&saved);
                    i.view.work = empty_work(i.view.work_permission);
                    if i.view.work_permission {
                        for c in &saved.work {
                            i.view.work[c.category.index()] = c.clone();
                        }
                    }
                    i.account = Some(saved);
                    i.pending = None;
                    i.device = None;
                    i.view.authorization = None;
                    i.view.status = "connected".into();
                    i.view.message = None;
                    i.view.retry_at = None;
                    i.due = 0;
                    i.work_due = [0; 4];
                    i.append = [false; 4];
                    i.failures = 0;
                    self.publish(&mut i);
                }
            }
            Ok(Outcome::Calendar(calendar)) => {
                let mut saved = i.account.clone().unwrap();
                if !saved.account_id.is_empty() && saved.account_id != calendar.account_id {
                    i.view.calendar = None;
                    self.fail(&mut i, Failure::Reconnect, time);
                } else {
                    saved.account_id.clone_from(&calendar.account_id);
                    saved.identity = Some(GithubAccount {
                        account_id: calendar.account_id.clone(),
                        login: calendar.login.clone(),
                    });
                    saved.calendar = Some(calendar.clone());
                    if self.vault.save(&saved).is_err() {
                        self.fail(&mut i, Failure::Storage, time);
                    } else {
                        i.view.account = saved.identity.clone();
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
            Ok(Outcome::Category(mut page)) => {
                let index = page.category.index();
                if append {
                    let old = &i.view.work[index];
                    page.limited |= old.limited;
                    if page.cursor == old.cursor && page.has_next_page {
                        page.has_next_page = false;
                        page.limited = true;
                    }
                    let mut items = old.items.clone();
                    for item in page.items {
                        if !items.iter().any(|old| old.id == item.id) {
                            items.push(item);
                        }
                    }
                    items.truncate(1000);
                    page.items = items;
                }
                if page.items.len() >= 1000 && page.has_next_page {
                    page.has_next_page = false;
                    page.limited = true;
                }
                i.view.work[index] = page;
                i.work_due[index] = time + REFRESH_SECONDS;
                i.append[index] = false;
                let mut saved = i.account.clone().unwrap();
                saved.work = i.view.work.clone();
                if self.vault.save(&saved).is_err() {
                    i.view.work[index].message =
                        Some("Work updated, but its encrypted cache could not be saved.".into());
                } else {
                    i.account = Some(saved);
                }
                self.publish(&mut i);
            }
            Err(failure) => {
                if let Some(c) = category {
                    self.fail_work(&mut i, c, failure, time);
                } else {
                    self.fail(&mut i, failure, time);
                }
            }
        }
        true
    }
    fn fail_work(&self, i: &mut Inner, c: WorkCategory, failure: Failure, time: u64) {
        if matches!(failure, Failure::Reconnect) {
            self.fail(i, failure, time);
            return;
        }
        let index = c.index();
        let cache = &mut i.view.work[index];
        cache.loading = false;
        cache.stale = cache.updated_at.is_some();
        cache.status = if matches!(failure, Failure::Permission) {
            "permission"
        } else {
            "error"
        }
        .into();
        cache.message = Some(if matches!(failure, Failure::Permission) { "Repository access is unavailable. Update GitHub permissions or check organization restrictions." } else { "Work could not refresh. Aura will retry automatically." }.into());
        if cache.updated_at.is_none() {
            cache.count = None;
        }
        i.work_due[index] = time + REFRESH_SECONDS;
        if let Failure::Temporary(Some(retry)) = failure {
            i.cooldown = retry.max(time + 60);
            i.view.retry_at = Some(i.cooldown);
        }
        self.publish(i);
    }
    fn fail(&self, i: &mut Inner, failure: Failure, time: u64) {
        let authorizing = matches!(i.view.status.as_str(), "requesting" | "authorizing");
        i.view.stale = i.view.calendar.is_some();
        i.view.refreshing = false;
        let (status, message) = match failure {
            Failure::Temporary(retry) => {
                i.failures = i.failures.saturating_add(1);
                let backoff = (15u64.saturating_mul(1u64 << i.failures.min(7))).min(1800);
                i.due = retry.unwrap_or(0).max(time + backoff).max(time + i.device.as_ref().map_or(0, |d| d.interval));
                if let Some(retry) = retry { i.cooldown = retry.max(time + 60); }
                i.view.retry_at = Some(i.due);
                (i.view.status.clone(), "GitHub is unreachable or limiting requests. Aura will retry automatically.")
            },
            Failure::Reconnect => ("reconnectRequired".into(), "GitHub authorization expired or changed. Reconnect your account."),
            Failure::Denied => ("failed".into(), "GitHub authorization was denied. Try connecting again."),
            Failure::Expired => ("failed".into(), "The GitHub verification code expired. Try connecting again."),
            Failure::Configuration => ("failed".into(), "GitHub connection failed. Check the OAuth client ID and enable device flow, then retry."),
            Failure::InvalidData | Failure::Permission => {
                i.due = time + REFRESH_SECONDS; i.view.retry_at = Some(i.due);
                (if i.account.is_some() && !authorizing { "connected" } else { "failed" }.into(), "GitHub returned incomplete data. Refresh to try again.")
            },
            Failure::Storage => ("reconnectRequired".into(), "Aura could not save its encrypted GitHub data. Disconnect and reconnect."),
        };
        // Denial, cancellation or a failed identity check during an upgrade never replace the old connection.
        i.view.status = if authorizing
            && i.account.is_some()
            && status != "requesting"
            && status != "authorizing"
        {
            i.due = time + REFRESH_SECONDS;
            "connected".into()
        } else {
            status
        };
        i.view.message = Some(message.into());
        if i.view.status == "reconnectRequired" {
            i.account = None;
            i.view.account = None;
            i.view.work_permission = false;
            i.view.work = empty_work(false);
            let _ = self.vault.clear();
        }
        if !matches!(i.view.status.as_str(), "requesting" | "authorizing") {
            i.pending = None;
            i.device = None;
            i.view.authorization = None;
        }
        self.publish(i);
    }
}

include!("github_tests.rs");
