use crate::models::{music::*, AppError};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use tauri::{AppHandle, Emitter};

enum Message {
    Refresh,
    PropertiesChanged(String),
    Select(Option<String>, mpsc::SyncSender<Result<(), AppError>>),
    Control(MediaAction, mpsc::SyncSender<Result<(), AppError>>),
    Seek(f64, mpsc::SyncSender<Result<(), AppError>>),
    Volume(
        Option<f32>,
        Option<String>,
        mpsc::SyncSender<Result<f32, AppError>>,
    ),
    Stop,
}
#[derive(Default)]
pub struct MediaService {
    started: AtomicBool,
    stopped: AtomicBool,
    state: Mutex<PlaybackState>,
    sender: Mutex<Option<mpsc::SyncSender<Message>>>,
}
impl MediaService {
    pub fn start(self: &Arc<Self>, app: AppHandle) {
        if self.stopped.load(Ordering::SeqCst) {
            return;
        }
        if self.started.swap(true, Ordering::SeqCst) {
            let _ = self.send(Message::Refresh);
            return;
        }
        let (tx, rx) = mpsc::sync_channel(32);
        if let Ok(mut sender) = self.sender.lock() {
            *sender = Some(tx.clone());
        }
        let service = self.clone();
        std::thread::spawn(move || {
            #[cfg(windows)]
            let result = worker(&service, &app, tx, rx);
            #[cfg(not(windows))]
            let result: Result<(), ()> = {
                let _ = (tx, rx);
                Err(())
            };
            if result.is_err() {
                service.publish(&app, PlaybackState { message: Some("Windows media sessions are unavailable. Use the official player controls.".into()), ..Default::default() });
            }
        });
    }
    fn publish(&self, app: &AppHandle, state: PlaybackState) {
        if let Ok(mut saved) = self.state.lock() {
            *saved = state.clone();
        }
        for label in ["widget-host", "settings"] {
            let _ = app.emit_to(label, "aura://playback-changed", &state);
        }
    }
    pub fn snapshot(&self) -> Result<PlaybackState, AppError> {
        self.state
            .lock()
            .map(|s| s.clone())
            .map_err(|_| media_error())
    }
    fn send(&self, message: Message) -> Result<(), AppError> {
        self.sender
            .lock()
            .map_err(|_| media_error())?
            .as_ref()
            .ok_or_else(media_error)?
            .try_send(message)
            .map_err(|_| media_error())
    }
    pub fn select(&self, id: Option<String>) -> Result<(), AppError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.send(Message::Select(id, tx))?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| media_error())?
    }
    pub fn control(&self, action: MediaAction) -> Result<(), AppError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.send(Message::Control(action, tx))?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| media_error())?
    }
    pub fn seek(&self, seconds: f64) -> Result<(), AppError> {
        if !seconds.is_finite() || !(0.0..=172_800.0).contains(&seconds) {
            return Err(media_error());
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.send(Message::Seek(seconds, tx))?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| media_error())?
    }
    pub fn volume(&self, level: Option<f32>, session_id: Option<String>) -> Result<f32, AppError> {
        if level.is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value)) {
            return Err(media_error());
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.send(Message::Volume(level, session_id, tx))?;
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| media_error())?
    }
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        let _ = self.send(Message::Stop);
    }
}
fn media_error() -> AppError {
    AppError::new(
        "MEDIA_UNAVAILABLE",
        "The media session is unavailable or does not support this control.",
    )
}

#[cfg(windows)]
mod native {
    use super::*;
    use crate::services::music_media_state::{
        artwork_mime, replacement_index, SnapshotCache, MAX_ARTWORK_BYTES, RECONNECT_GRACE,
    };
    use std::time::{Duration, Instant};
    use windows::{Foundation::TypedEventHandler, Media::Control::*, Storage::Streams::DataReader};
    pub struct Session {
        pub id: String,
        pub native: GlobalSystemMediaTransportControlsSession,
        source: String,
        missing_since: Option<Instant>,
        snapshot_cache: SnapshotCache,
        tokens: Vec<(u8, i64)>,
        artwork: Option<String>,
        artwork_key: String,
        artwork_loaded_key: String,
        artwork_retry_after: Option<std::time::Instant>,
        artwork_missing_since: Option<std::time::Instant>,
        refresh_sender: mpsc::SyncSender<Message>,
    }
    impl Session {
        fn subscribe(
            id: String,
            native: GlobalSystemMediaTransportControlsSession,
            tx: &mpsc::SyncSender<Message>,
        ) -> Self {
            let mut tokens = Vec::new();
            let send = tx.clone();
            let changed_id = id.clone();
            if let Ok(token) =
                native.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = send.try_send(Message::PropertiesChanged(changed_id.clone()));
                    Ok(())
                }))
            {
                tokens.push((0, token));
            }
            let send = tx.clone();
            if let Ok(token) = native.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                let _ = send.try_send(Message::Refresh);
                Ok(())
            })) {
                tokens.push((1, token));
            }
            let send = tx.clone();
            if let Ok(token) =
                native.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = send.try_send(Message::Refresh);
                    Ok(())
                }))
            {
                tokens.push((2, token));
            }
            Self {
                id,
                source: native
                    .SourceAppUserModelId()
                    .map(|source| source.to_string())
                    .unwrap_or_default(),
                native,
                missing_since: None,
                snapshot_cache: SnapshotCache::default(),
                tokens,
                artwork: None,
                artwork_key: String::new(),
                artwork_loaded_key: String::new(),
                artwork_retry_after: None,
                artwork_missing_since: None,
                refresh_sender: tx.clone(),
            }
        }
        fn snapshot(&mut self) -> windows::core::Result<PlaybackSession> {
            let properties = self.native.TryGetMediaPropertiesAsync()?.join()?;
            let info = self.native.GetPlaybackInfo()?;
            let controls = info.Controls()?;
            let timeline = self.native.GetTimelineProperties()?;
            let title = properties.Title()?.to_string();
            let artist = properties.Artist()?.to_string();
            let key = format!("{title}\0{artist}");
            if key != self.artwork_key {
                self.artwork_key = key.clone();
                self.artwork = None;
                self.artwork_loaded_key.clear();
                let now = std::time::Instant::now();
                self.artwork_retry_after = Some(now + std::time::Duration::from_millis(750));
                self.artwork_missing_since = Some(now);
                let sender = self.refresh_sender.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(750));
                    let _ = sender.try_send(Message::Refresh);
                });
            }
            if self.artwork_loaded_key != key
                && self
                    .artwork_retry_after
                    .is_none_or(|retry_at| std::time::Instant::now() >= retry_at)
            {
                let now = std::time::Instant::now();
                self.artwork_retry_after = Some(now + std::time::Duration::from_secs(5));
                if let Ok(artwork) = thumbnail(&properties) {
                    // A slow thumbnail read must not install artwork for metadata
                    // that changed while Windows was returning the image.
                    let latest_key = self
                        .native
                        .TryGetMediaPropertiesAsync()
                        .and_then(|op| op.join())
                        .and_then(|latest| {
                            Ok(format!("{}\0{}", latest.Title()?, latest.Artist()?))
                        });
                    if latest_key
                        .as_ref()
                        .is_ok_and(|latest_key| latest_key == &key)
                    {
                        self.artwork = Some(artwork);
                        self.artwork_loaded_key = key;
                        self.artwork_missing_since = None;
                    } else {
                        self.artwork = None;
                        let _ = self.refresh_sender.try_send(Message::Refresh);
                    }
                } else if self.artwork_missing_since.is_some_and(|since| {
                    now.duration_since(since) >= std::time::Duration::from_secs(30)
                }) {
                    self.artwork = None;
                } else {
                    let sender = self.refresh_sender.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(5));
                        let _ = sender.try_send(Message::Refresh);
                    });
                }
            }
            let start = timeline.StartTime()?.Duration;
            Ok(PlaybackSession {
                id: self.id.clone(),
                source: self.source.clone(),
                title,
                artist,
                playing: info.PlaybackStatus()?
                    == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing,
                position_seconds: ((timeline.Position()?.Duration - start).max(0) as f64)
                    / 10_000_000.0,
                updated_at_unix_ms: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                duration_seconds: ((timeline.EndTime()?.Duration - start).max(0) as f64)
                    / 10_000_000.0,
                artwork: self.artwork.clone(),
                can_play: controls.IsPlayEnabled()?,
                can_pause: controls.IsPauseEnabled()?,
                can_previous: controls.IsPreviousEnabled()?,
                can_next: controls.IsNextEnabled()?,
                can_seek: controls.IsPlaybackPositionEnabled()?,
            })
        }
        fn control(&self, action: MediaAction) -> Result<(), AppError> {
            let result = (|| -> windows::core::Result<bool> {
                let controls = self.native.GetPlaybackInfo()?.Controls()?;
                match action {
                    MediaAction::Play if controls.IsPlayEnabled()? => {
                        self.native.TryPlayAsync()?.join()
                    }
                    MediaAction::Pause if controls.IsPauseEnabled()? => {
                        self.native.TryPauseAsync()?.join()
                    }
                    MediaAction::Next if controls.IsNextEnabled()? => {
                        self.native.TrySkipNextAsync()?.join()
                    }
                    MediaAction::Previous if controls.IsPreviousEnabled()? => {
                        self.native.TrySkipPreviousAsync()?.join()
                    }
                    _ => Ok(false),
                }
            })();
            if result.unwrap_or(false) {
                Ok(())
            } else {
                Err(media_error())
            }
        }
        fn seek(&self, seconds: f64) -> Result<(), AppError> {
            let controls = self
                .native
                .GetPlaybackInfo()
                .and_then(|info| info.Controls())
                .map_err(|_| media_error())?;
            if !controls.IsPlaybackPositionEnabled().unwrap_or(false) {
                return Err(media_error());
            }
            let timeline = self
                .native
                .GetTimelineProperties()
                .map_err(|_| media_error())?;
            let start = timeline.StartTime().map_err(|_| media_error())?.Duration;
            let end = timeline.EndTime().map_err(|_| media_error())?.Duration;
            let requested = start
                .saturating_add((seconds * 10_000_000.0) as i64)
                .clamp(start, end);
            self.native
                .TryChangePlaybackPositionAsync(requested)
                .and_then(|op| op.join())
                .map_err(|_| media_error())?
                .then_some(())
                .ok_or_else(media_error)
        }
    }
    impl Drop for Session {
        fn drop(&mut self) {
            for (kind, token) in self.tokens.drain(..) {
                let _ = match kind {
                    0 => self.native.RemoveMediaPropertiesChanged(token),
                    1 => self.native.RemovePlaybackInfoChanged(token),
                    _ => self.native.RemoveTimelinePropertiesChanged(token),
                };
            }
        }
    }
    fn thumbnail(
        properties: &GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> windows::core::Result<String> {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let stream = properties.Thumbnail()?.OpenReadAsync()?.join()?;
        let size = stream.Size()?;
        if size == 0 || size > MAX_ARTWORK_BYTES {
            return Err(windows::core::Error::from_thread());
        }
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
        let count = reader.LoadAsync(size as u32)?.join()?;
        if count != size as u32 {
            return Err(windows::core::Error::from_thread());
        }
        let mut data = vec![0; count as usize];
        reader.ReadBytes(&mut data)?;
        let mime = artwork_mime(&data).ok_or_else(windows::core::Error::from_thread)?;
        Ok(format!("data:{mime};base64,{}", STANDARD.encode(data)))
    }
    pub fn run(
        service: &MediaService,
        app: &AppHandle,
        tx: mpsc::SyncSender<Message>,
        rx: mpsc::Receiver<Message>,
    ) -> Result<(), ()> {
        use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
        unsafe {
            RoInitialize(RO_INIT_MULTITHREADED).map_err(|_| ())?;
        }
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe {
                    RoUninitialize();
                }
            }
        }
        let _apartment = Apartment;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|op| op.join())
            .map_err(|_| ())?;
        let send = tx.clone();
        let token = manager
            .SessionsChanged(&TypedEventHandler::new(move |_, _| {
                let _ = send.try_send(Message::Refresh);
                Ok(())
            }))
            .map_err(|_| ())?;
        struct Subscription(GlobalSystemMediaTransportControlsSessionManager, i64);
        impl Drop for Subscription {
            fn drop(&mut self) {
                let _ = self.0.RemoveSessionsChanged(self.1);
            }
        }
        let _subscription = Subscription(manager.clone(), token);
        let mut sessions: Vec<Session> = Vec::new();
        let mut next_id = 0u64;
        let mut selected: Option<String> = None;
        let mut selection_message: Option<String> = None;
        let _ = tx.try_send(Message::Refresh);
        loop {
            // Notifications can be lost during browser track/session changes.
            // Use a slow fallback scan, and a short retry only while recovering.
            let recovering = sessions.iter().any(|s| s.missing_since.is_some());
            let message = match rx.recv_timeout(if recovering {
                Duration::from_millis(500)
            } else {
                Duration::from_secs(2)
            }) {
                Ok(message) => message,
                Err(mpsc::RecvTimeoutError::Timeout) => Message::Refresh,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            };
            if service.stopped.load(Ordering::SeqCst) {
                break;
            }
            match message {
                Message::Stop => break,
                Message::Select(id, reply) => {
                    let selected_session = id
                        .as_ref()
                        .and_then(|id| sessions.iter().find(|session| &session.id == id));
                    let result = if id.is_none() || selected_session.is_some() {
                        selected = id;
                        selection_message = None;
                        Ok(())
                    } else {
                        Err(media_error())
                    };
                    let _ = reply.send(result);
                }
                Message::Control(action, reply) => {
                    let result = selected
                        .as_ref()
                        .and_then(|id| sessions.iter().find(|s| &s.id == id))
                        .ok_or_else(media_error)
                        .and_then(|s| s.control(action));
                    let _ = reply.send(result);
                }
                Message::Seek(position, reply) => {
                    let result = selected
                        .as_ref()
                        .and_then(|id| sessions.iter().find(|s| &s.id == id))
                        .ok_or_else(media_error)
                        .and_then(|s| s.seek(position));
                    let _ = reply.send(result);
                }
                Message::Volume(level, expected, reply) => {
                    let result = if expected
                        .as_ref()
                        .is_some_and(|id| Some(id) != selected.as_ref())
                    {
                        Err(AppError::new("MEDIA_SESSION_CHANGED", "The selected player changed. Choose the player again before adjusting volume."))
                    } else {
                        selected.as_ref().and_then(|id| sessions.iter().find(|session| &session.id == id))
                            .ok_or_else(|| AppError::new("BROWSER_VOLUME_UNAVAILABLE", "Select a Windows media session before adjusting browser volume."))
                            .and_then(|session| session.native.SourceAppUserModelId().map_err(|_| media_error()))
                            .and_then(|source| crate::services::music_volume::browser_volume(&source.to_string(), level))
                    };
                    let _ = reply.send(result);
                }

                Message::PropertiesChanged(id) => {
                    if let Some(session) = sessions.iter_mut().find(|session| session.id == id) {
                        // Artwork can arrive after title/artist without changing
                        // either string. Re-read it on the properties event.
                        session.artwork_loaded_key.clear();
                        session.artwork_retry_after = None;
                    }
                }
                Message::Refresh => {}
            }
            let available: Vec<_> = match manager.GetSessions() {
                Ok(available) => available.into_iter().collect(),
                // An intermittent enumeration failure must not permanently stop
                // the worker or discard the user's current selection.
                Err(_) => continue,
            };
            let now = Instant::now();
            for session in &mut sessions {
                if available.iter().any(|native| native == &session.native) {
                    session.missing_since = None;
                } else {
                    session.missing_since.get_or_insert(now);
                }
            }
            sessions.retain(|s| {
                s.missing_since
                    .is_none_or(|since| now.duration_since(since) <= RECONNECT_GRACE)
            });
            let incoming: Vec<_> = available
                .iter()
                .filter(|native| !sessions.iter().any(|s| &s.native == *native))
                .map(|native| {
                    (
                        native.clone(),
                        native
                            .SourceAppUserModelId()
                            .map(|s| s.to_string())
                            .unwrap_or_default(),
                    )
                })
                .collect();
            let previous: Vec<_> = sessions
                .iter()
                .map(|s| (s.source.clone(), s.missing_since.is_none()))
                .collect();
            for (native, source) in &incoming {
                let identities: Vec<_> = previous
                    .iter()
                    .map(|(source, present)| (source.as_str(), *present))
                    .collect();
                if let Some(index) = replacement_index(
                    source,
                    &identities,
                    incoming.iter().filter(|(_, s)| s == source).count(),
                ) {
                    let id = sessions[index].id.clone();
                    // A new COM session for the same unique browser keeps the
                    // logical ID. Reset artwork and unsubscribe the old object.
                    let cache = std::mem::take(&mut sessions[index].snapshot_cache);
                    sessions[index] = Session::subscribe(id, native.clone(), &tx);
                    sessions[index].snapshot_cache = cache;
                    continue;
                }
                if sessions.iter().any(|s| &s.native == native) {
                    continue;
                }
                next_id += 1;
                sessions.push(Session::subscribe(
                    format!("session-{next_id}"),
                    native.clone(),
                    &tx,
                ));
            }
            let disappeared =
                selected.is_some() && !sessions.iter().any(|s| Some(&s.id) == selected.as_ref());
            if disappeared {
                selected = None;
            }
            if disappeared {
                selection_message =
                    Some("The selected player closed. Choose a media session again.".into());
            }
            let snapshots = sessions
                .iter_mut()
                .filter_map(|s| {
                    let next = if s.missing_since.is_none() {
                        s.snapshot().ok()
                    } else {
                        None
                    };
                    s.snapshot_cache.accept(next, now)
                })
                .collect();
            service.publish(
                app,
                PlaybackState {
                    sessions: snapshots,
                    selected_id: selected.clone(),
                    message: selection_message.clone(),
                },
            );
        }
        drop(sessions);
        Ok(())
    }
}
#[cfg(windows)]
use native::run as worker;
