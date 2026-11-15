use super::{
    music_oauth::{self, Tokens},
    music_vault::{SavedMusicCredentials, Vault},
    youtube_api::{HttpTransport, YoutubeApi},
};
use crate::models::{music::*, AppError};
use std::{
    io::Read,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
struct Account {
    saved: Option<SavedMusicCredentials>,
    verified: bool,
    expired: bool,
    verified_at: Option<Instant>,
}
pub struct MusicService {
    account: Mutex<Account>,
    vault: Vault,
    generation: AtomicU64,
    connecting: AtomicBool,
}
impl MusicService {
    pub fn new(directory: Option<std::path::PathBuf>) -> Self {
        Self {
            account: Mutex::new(Account::default()),
            vault: Vault(directory),
            generation: AtomicU64::new(0),
            connecting: AtomicBool::new(false),
        }
    }
    fn current(&self, generation: u64) -> Result<(), AppError> {
        if self.generation.load(Ordering::SeqCst) == generation {
            Ok(())
        } else {
            Err(music_oauth::cancelled())
        }
    }
    fn snapshot(
        &self,
        revision: u64,
        status: &str,
        account: &Account,
        message: Option<String>,
    ) -> MusicAccountState {
        MusicAccountState {
            revision,
            status: status.into(),
            name: account
                .saved
                .as_ref()
                .filter(|_| account.verified)
                .map(|s| s.channel_title.clone()),
            channel_id: account
                .saved
                .as_ref()
                .filter(|_| account.verified)
                .map(|s| s.channel_id.clone()),
            message,
            validation_build: music_oauth::validation_build(),
        }
    }
    pub fn status(&self) -> Result<MusicAccountState, AppError> {
        let generation = self.generation.load(Ordering::SeqCst);
        if let Err(error) = music_oauth::gate() {
            return Ok(self.snapshot(
                generation,
                "unavailable",
                &Account::default(),
                Some(error.message),
            ));
        }
        if self.connecting.load(Ordering::SeqCst) {
            return Ok(self.snapshot(
                generation,
                "connecting",
                &Account::default(),
                Some("Complete Google sign-in in your browser.".into()),
            ));
        }
        let mut account = self.account.lock().map_err(|_| busy())?;
        self.current(generation)?;
        if account.expired {
            return Ok(self.snapshot(
                generation,
                "expired",
                &account,
                Some("Reconnect your YouTube account.".into()),
            ));
        }
        if account.saved.is_none() {
            match self.vault.load() {
                Ok(saved) => account.saved = saved,
                Err(error) if error.code == "RECONNECT_REQUIRED" => {
                    return Ok(self.snapshot(
                        generation,
                        "disconnected",
                        &account,
                        Some(error.message),
                    ))
                }
                Err(error) => return Err(error),
            }
        }
        if account.saved.is_none() {
            return Ok(self.snapshot(generation, "disconnected", &account, None));
        }
        if account.saved.as_ref().is_some_and(|saved| {
            !saved
                .tokens
                .scope
                .split_whitespace()
                .any(|scope| scope == music_oauth::SCOPE)
        }) {
            self.expire(&mut account)?;
            return Ok(self.snapshot(
                generation,
                "expired",
                &account,
                Some(
                    "Aura's YouTube permission changed. Review the current policy and reconnect."
                        .into(),
                ),
            ));
        }
        if account
            .saved
            .as_ref()
            .is_some_and(|s| music_oauth::client().is_none_or(|(id, _)| s.client_id != id))
        {
            self.vault.clear()?;
            *account = Account::default();
            return Ok(self.snapshot(
                generation,
                "disconnected",
                &account,
                Some("Aura's Google client changed. Reconnect YouTube.".into()),
            ));
        }
        if !account.verified
            || account
                .verified_at
                .is_none_or(|checked| checked.elapsed() >= Duration::from_secs(1800))
        {
            let verification = (|| {
                let tokens = self.fresh(&mut account, generation)?;
                let transport = HttpTransport::new(tokens.access_token)?;
                let channel = YoutubeApi {
                    transport: &transport,
                }
                .account()?;
                self.current(generation)?;
                let saved = account.saved.as_mut().ok_or_else(not_connected)?;
                if channel.id != saved.channel_id {
                    return Err(AppError::new(
                        "ACCOUNT_CHANGED",
                        "Your YouTube channel changed. Disconnect and reconnect Aura.",
                    ));
                }
                saved.channel_title = channel.title;
                saved.system_playlist_ids = channel.system_playlist_ids;
                self.vault.save(saved)?;
                account.verified = true;
                account.verified_at = Some(Instant::now());
                Ok(())
            })();
            if let Err(error) = verification {
                if error.code == "SESSION_EXPIRED" {
                    self.expire(&mut account)?;
                    return Ok(self.snapshot(generation, "expired", &account, Some(error.message)));
                }
                return Err(error);
            }
        }
        self.current(generation)?;
        Ok(self.snapshot(generation, "connected", &account, None))
    }
    pub fn connect(&self) -> Result<MusicAccountState, AppError> {
        music_oauth::gate()?;
        if self.connecting.swap(true, Ordering::SeqCst) {
            return Err(busy());
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let result = (|| {
            let tokens = music_oauth::authorize(&self.generation, generation)?;
            self.current(generation)?;
            let transport = HttpTransport::new(tokens.access_token.clone())?;
            let channel = YoutubeApi {
                transport: &transport,
            }
            .account()?;
            let saved = SavedMusicCredentials {
                format_version: 2,
                provider: "youtubeDataApi".into(),
                client_id: music_oauth::client()
                    .ok_or_else(music_oauth::unavailable)?
                    .0
                    .into(),
                channel_id: channel.id,
                channel_title: channel.title,
                system_playlist_ids: channel.system_playlist_ids,
                tokens,
            };
            let mut account = self.account.lock().map_err(|_| busy())?;
            self.current(generation)?;
            self.vault.save(&saved)?;
            *account = Account {
                saved: Some(saved),
                verified: true,
                expired: false,
                verified_at: Some(Instant::now()),
            };
            Ok(self.snapshot(generation, "connected", &account, None))
        })();
        self.connecting.store(false, Ordering::SeqCst);
        result
    }
    pub fn disconnect(&self) -> Result<MusicAccountState, AppError> {
        self.disconnect_with(music_oauth::revoke)
    }
    fn disconnect_with(
        &self,
        revoke: impl FnOnce(&Tokens) -> Result<(), AppError>,
    ) -> Result<MusicAccountState, AppError> {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut account = self.account.lock().map_err(|_| busy())?;
        let saved = match account.saved.take() {
            Some(saved) => Ok(Some(saved)),
            None => self.vault.load(),
        };
        *account = Account::default();
        // Delete local data even offline, or when the encrypted record cannot
        // be decoded. Keep the token only on this stack for the revoke attempt.
        self.vault.clear()?;
        let revocation_unconfirmed = match saved {
            Ok(Some(saved)) => revoke(&saved.tokens).is_err(),
            Ok(None) => false,
            Err(_) => true,
        };
        let message = revocation_unconfirmed.then(|| {
            "Local YouTube data was removed, but Google access removal could not be confirmed. Remove Aura in your Google account's third-party connections.".into()
        });
        Ok(self.snapshot(generation, "disconnected", &account, message))
    }
    fn expire(&self, account: &mut Account) -> Result<(), AppError> {
        *account = Account {
            expired: true,
            ..Account::default()
        };
        self.vault.clear()
    }
    fn fresh(&self, account: &mut Account, generation: u64) -> Result<Tokens, AppError> {
        self.fresh_with(account, generation, music_oauth::refresh)
    }
    fn fresh_with(
        &self,
        account: &mut Account,
        generation: u64,
        refresh: impl FnOnce(&Tokens) -> Result<Tokens, AppError>,
    ) -> Result<Tokens, AppError> {
        if account.expired {
            return Err(AppError::new(
                "SESSION_EXPIRED",
                "Reconnect your YouTube account.",
            ));
        }
        let saved = account.saved.as_mut().ok_or_else(not_connected)?;
        let refreshed = refresh(&saved.tokens);
        self.current(generation)?;
        match refreshed {
            Ok(tokens) => {
                if tokens.access_token != saved.tokens.access_token {
                    saved.tokens = tokens.clone();
                    self.vault.save(saved)?;
                }
                Ok(tokens)
            }
            Err(error) => {
                if error.code == "SESSION_EXPIRED" {
                    self.expire(account)?;
                }
                Err(error)
            }
        }
    }
    pub fn browse(&self, query: MusicQuery) -> Result<MusicPage, AppError> {
        music_oauth::gate()?;
        let generation = self.generation.load(Ordering::SeqCst);
        let mut account = self.account.lock().map_err(|_| busy())?;
        self.current(generation)?;
        if !account.verified {
            return Err(not_connected());
        }
        let tokens = self.fresh(&mut account, generation)?;
        let transport = HttpTransport::new(tokens.access_token)?;
        let result = YoutubeApi {
            transport: &transport,
        }
        .browse(query, account.saved.as_ref().ok_or_else(not_connected)?);
        self.current(generation)?;
        if result
            .as_ref()
            .err()
            .is_some_and(|e| e.code == "SESSION_EXPIRED")
        {
            self.expire(&mut account)?;
        }
        result
    }
    pub fn change(&self, change: MusicChange) -> Result<(), AppError> {
        music_oauth::gate()?;
        let generation = self.generation.load(Ordering::SeqCst);
        let mut account = self.account.lock().map_err(|_| busy())?;
        self.current(generation)?;
        if !account.verified {
            return Err(not_connected());
        }
        let tokens = self.fresh(&mut account, generation)?;
        let transport = HttpTransport::new(tokens.access_token)?;
        // Exactly one attempt. Even an interrupted response may follow a write
        // the provider accepted; never silently resend account mutations.
        let result = YoutubeApi {
            transport: &transport,
        }
        .change(change, account.saved.as_ref().ok_or_else(not_connected)?);
        self.current(generation)?;
        if result
            .as_ref()
            .err()
            .is_some_and(|e| e.code == "SESSION_EXPIRED")
        {
            self.expire(&mut account)?;
        }
        result
    }
    pub fn shutdown(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
}
fn busy() -> AppError {
    AppError::new(
        "MUSIC_BUSY",
        "Another YouTube account operation is in progress.",
    )
}
fn not_connected() -> AppError {
    AppError::new(
        "NOT_CONNECTED",
        "Connect and verify your YouTube account first.",
    )
}

pub fn valid_id(id: &str, video: bool) -> bool {
    (!video || id.len() == 11)
        && !id.is_empty()
        && id.len() <= 256
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
pub fn player_url(target: MusicTarget) -> Result<String, AppError> {
    let (player, path) = match target {
        MusicTarget::Home { player } => (player, "/".into()),
        MusicTarget::Track { id, player } if valid_id(&id, true) => {
            (player, format!("/watch?v={id}"))
        }
        MusicTarget::Playlist { id, player } if valid_id(&id, false) => {
            (player, format!("/playlist?list={id}"))
        }
        _ => {
            return Err(AppError::new(
                "INVALID_INPUT",
                "This YouTube link is invalid.",
            ))
        }
    };
    let host = match player {
        Player::YoutubeMusic => "music.youtube.com",
        Player::Youtube => "www.youtube.com",
    };
    Ok(format!("https://{host}{path}"))
}

pub fn open_url(url: &str) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let url = url.to_owned();
        // URL activation can use COM shell extensions requiring STA. Use a fresh
        // apartment instead of relying on the Tauri worker's apartment state.
        std::thread::spawn(move || open_windows_url(&url))
            .join()
            .map_err(|_| browser_error())?
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Music playback requires Windows.",
        ))
    }
}

#[cfg(windows)]
fn browser_error() -> AppError {
    AppError::new("OPEN_BROWSER", "Windows could not open your default browser. Check the HTTPS default app in Windows Settings, then try connecting again.")
}

#[cfg(windows)]
fn open_windows_url(url: &str) -> Result<(), AppError> {
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            System::Com::{
                CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
            },
            UI::{
                Shell::{
                    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
                },
                WindowsAndMessaging::SW_SHOWNORMAL,
            },
        },
    };
    // No command interpreter, argument parsing, or hidden window is involved.
    // Keep the UTF-16 URL alive through the synchronous activation call.
    if url.contains('\0') {
        return Err(browser_error());
    }
    let wide: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)
            .ok()
            .map_err(|_| browser_error())?;
    }
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }
    let _apartment = Apartment;
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: w!("open"),
        lpFile: PCWSTR(wide.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    // Unlike spawning explorer.exe, the result reports URL activation failure.
    unsafe { ShellExecuteExW(&mut info).map_err(|_| browser_error()) }
}

pub fn artwork(url: &str) -> Result<String, AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let error = || AppError::new("ARTWORK_UNAVAILABLE", "Artwork is unavailable.");
    let parsed = url::Url::parse(url).map_err(|_| error())?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || !matches!(
            parsed.host_str(),
            Some("lh3.googleusercontent.com" | "yt3.ggpht.com" | "i.ytimg.com" | "img.youtube.com")
        )
    {
        return Err(error());
    }
    let response = music_oauth::http()?
        .get(parsed)
        .send()
        .map_err(|_| error())?;
    if !response.status().is_success() || response.content_length().is_some_and(|n| n > 1_048_576) {
        return Err(error());
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_owned();
    if !matches!(mime.as_str(), "image/jpeg" | "image/png" | "image/webp") {
        return Err(error());
    }
    let mut data = Vec::new();
    response
        .take(1_048_577)
        .read_to_end(&mut data)
        .map_err(|_| error())?;
    if data.len() > 1_048_576 {
        return Err(error());
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(data)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn saved_fixture() -> SavedMusicCredentials {
        SavedMusicCredentials {
            format_version: 2,
            provider: "youtubeDataApi".into(),
            client_id: "fixture-client".into(),
            channel_id: "UCfixture".into(),
            channel_title: "Fixture channel".into(),
            system_playlist_ids: vec!["UUfixture".into()],
            tokens: Tokens {
                access_token: "fixture-access".into(),
                refresh_token: "fixture-refresh".into(),
                expires_at: 0,
                expires_in: 3600,
                scope: music_oauth::SCOPE.into(),
                token_type: "Bearer".into(),
            },
        }
    }

    #[cfg(windows)]
    #[test]
    fn disconnect_revokes_saved_grant_after_local_deletion_even_if_offline() {
        for offline in [false, true] {
            let directory = std::env::temp_dir().join(format!(
                "aura-revoke-{}-{}-{offline}",
                std::process::id(),
                music_oauth::now()
            ));
            let service = MusicService::new(Some(directory.clone()));
            service.vault.save(&saved_fixture()).unwrap();
            std::fs::write(
                directory.join("music-credentials.123.tmp"),
                b"encrypted remnant",
            )
            .unwrap();
            std::fs::write(directory.join("preferences.json"), b"keep").unwrap();
            let state = service
                .disconnect_with(|tokens| {
                    assert_eq!(tokens.refresh_token, "fixture-refresh");
                    assert!(!directory.join("music-credentials.bin").exists());
                    assert!(!directory.join("music-credentials.123.tmp").exists());
                    if offline {
                        Err(AppError::new("OFFLINE", "fixture"))
                    } else {
                        Ok(())
                    }
                })
                .unwrap();
            assert_eq!(state.status, "disconnected");
            assert!(state.name.is_none() && state.channel_id.is_none());
            assert_eq!(state.message.is_some(), offline);
            assert!(service.vault.load().unwrap().is_none());
            assert_eq!(
                std::fs::read(directory.join("preferences.json")).unwrap(),
                b"keep"
            );
            std::fs::remove_file(directory.join("preferences.json")).unwrap();
            std::fs::remove_dir(directory).unwrap();
        }
    }

    #[cfg(windows)]
    #[test]
    fn revoked_refresh_erases_account_data_but_network_failure_keeps_it() {
        for code in ["SESSION_EXPIRED", "OFFLINE"] {
            let directory = std::env::temp_dir().join(format!(
                "aura-expire-{}-{}-{code}",
                std::process::id(),
                music_oauth::now()
            ));
            let service = MusicService::new(Some(directory.clone()));
            service.vault.save(&saved_fixture()).unwrap();
            let mut account = Account {
                saved: Some(saved_fixture()),
                verified: true,
                verified_at: Some(Instant::now()),
                ..Account::default()
            };
            let error = service
                .fresh_with(&mut account, 0, |_| Err(AppError::new(code, "fixture")))
                .err()
                .unwrap();
            assert_eq!(error.code, code);
            let revoked = code == "SESSION_EXPIRED";
            assert_eq!(account.expired, revoked);
            assert_eq!(account.saved.is_none(), revoked);
            assert_eq!(service.vault.load().unwrap().is_none(), revoked);
            service.vault.clear().unwrap();
            std::fs::remove_dir(directory).unwrap();
        }
    }
    #[test]
    fn native_availability_matches_build_gate_without_saved_credentials() {
        let directory = std::env::temp_dir().join(format!(
            "aura-availability-{}-{}",
            std::process::id(),
            music_oauth::now()
        ));
        let service = MusicService::new(Some(directory));
        let state = service.status().unwrap();
        assert_eq!(state.validation_build, music_oauth::validation_build());
        assert_eq!(
            state.status,
            if music_oauth::gate().is_ok() {
                "disconnected"
            } else {
                "unavailable"
            }
        );
        assert!(state.name.is_none());
        assert!(state.channel_id.is_none());
    }

    /// Explicit developer-only acceptance check. Never runs in the normal suite.
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires an explicitly authorized developer account and AURA_LIVE_REFRESH_TEST=1"]
    fn live_account_refresh_preserves_verified_channel() {
        assert!(
            std::env::var("AURA_LIVE_REFRESH_TEST").as_deref() == Ok("1"),
            "Enable the explicit live-account acceptance test first."
        );
        let directory = std::path::PathBuf::from(
            std::env::var_os("APPDATA").expect("Windows app data unavailable"),
        )
        .join("com.projectaura.desktop");
        let vault = Vault(Some(directory));
        let mut record = vault
            .load()
            .expect("Encrypted developer account could not be loaded")
            .expect("Authorize the developer test account first");
        let client_id = music_oauth::client()
            .expect("Developer client is missing")
            .0;
        assert!(
            record.client_id == client_id,
            "The developer client differs from the saved account."
        );
        let mut expired = record.tokens.clone();
        expired.expires_at = music_oauth::now();
        let refreshed = music_oauth::refresh(&expired).expect("Google token refresh failed");
        assert!(
            refreshed.expires_at > music_oauth::now() + 90,
            "Google did not return a fresh access token."
        );
        let transport = HttpTransport::new(refreshed.access_token.clone()).unwrap();
        let channel = YoutubeApi {
            transport: &transport,
        }
        .account()
        .expect("Official account verification after refresh failed");
        assert!(
            channel.id == record.channel_id,
            "Refresh changed the verified channel."
        );
        record.tokens = refreshed;
        vault
            .save(&record)
            .expect("Refreshed credentials could not be saved");
    }
    #[test]
    fn only_constructed_player_links_can_open() {
        for (player, host) in [
            (Player::YoutubeMusic, "music.youtube.com"),
            (Player::Youtube, "www.youtube.com"),
        ] {
            assert_eq!(
                player_url(MusicTarget::Track {
                    id: "dQw4w9WgXcQ".into(),
                    player
                })
                .unwrap(),
                format!("https://{host}/watch?v=dQw4w9WgXcQ")
            );
        }
        for id in [
            "https://evil.test",
            "abc&redirect=evil",
            "../file",
            "",
            "short",
        ] {
            assert!(player_url(MusicTarget::Track {
                id: id.into(),
                player: Player::YoutubeMusic
            })
            .is_err());
        }
        assert!(
            serde_json::from_str::<MusicTarget>(r#"{"kind":"url","url":"https://evil.test"}"#)
                .is_err()
        );
        let default: MusicTarget = serde_json::from_str(r#"{"kind":"home"}"#).unwrap();
        assert_eq!(player_url(default).unwrap(), "https://music.youtube.com/");
    }
    #[test]
    fn cancellation_invalidates_late_results() {
        let service = MusicService::new(None);
        let generation = service.generation.load(Ordering::SeqCst);
        service.shutdown();
        assert!(service.current(generation).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn disconnect_clears_saved_records_and_interrupted_saves() {
        let directory = std::env::temp_dir().join(format!(
            "aura-youtube-disconnect-{}-{}",
            std::process::id(),
            music_oauth::now()
        ));
        let service = MusicService::new(Some(directory.clone()));
        let saved = SavedMusicCredentials {
            format_version: 2,
            provider: "youtubeDataApi".into(),
            client_id: "fixture".into(),
            channel_id: "UCfixture".into(),
            channel_title: "Channel".into(),
            system_playlist_ids: Vec::new(),
            tokens: Tokens {
                access_token: "fixture".into(),
                refresh_token: "fixture".into(),
                expires_at: music_oauth::now() + 3600,
                scope: music_oauth::SCOPE.into(),
                token_type: "Bearer".into(),
                expires_in: 3600,
            },
        };
        service.vault.save(&saved).unwrap();
        std::fs::write(
            directory.join("music-credentials.999999.tmp"),
            b"encrypted-remnant",
        )
        .unwrap();
        service.account.lock().unwrap().saved = Some(saved);
        assert_eq!(
            service.disconnect_with(|_| Ok(())).unwrap().status,
            "disconnected"
        );
        assert!(service.account.lock().unwrap().saved.is_none());
        assert!(!directory.join("music-credentials.bin").exists());
        assert!(!directory.join("music-credentials.999999.tmp").exists());
        std::fs::remove_dir(directory).unwrap();
    }
}
