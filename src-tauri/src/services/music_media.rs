use crate::models::{music::*, AppError};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use tauri::{AppHandle, Emitter};

enum Message {
    Refresh,
    Select(Option<String>, mpsc::SyncSender<Result<(), AppError>>),
    Control(MediaAction, mpsc::SyncSender<Result<(), AppError>>),
    Seek(f64, mpsc::SyncSender<Result<(), AppError>>),
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
        for label in ["widget-host", "music"] {
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
    use windows::{Foundation::TypedEventHandler, Media::Control::*, Storage::Streams::DataReader};
    pub struct Session {
        pub id: String,
        pub native: GlobalSystemMediaTransportControlsSession,
        tokens: Vec<(u8, i64)>,
        artwork: Option<String>,
        artwork_key: String,
    }
    impl Session {
        fn subscribe(
            id: String,
            native: GlobalSystemMediaTransportControlsSession,
            tx: &mpsc::SyncSender<Message>,
        ) -> Self {
            let mut tokens = Vec::new();
            let send = tx.clone();
            if let Ok(token) =
                native.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = send.try_send(Message::Refresh);
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
                native,
                tokens,
                artwork: None,
                artwork_key: String::new(),
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
                self.artwork = thumbnail(&properties).ok();
                self.artwork_key = key;
            }
            let start = timeline.StartTime()?.Duration;
            Ok(PlaybackSession {
                id: self.id.clone(),
                source: self.native.SourceAppUserModelId()?.to_string(),
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
        let mime = stream.ContentType()?.to_string();
        if size == 0
            || size > 524_288
            || !matches!(mime.as_str(), "image/jpeg" | "image/png" | "image/webp")
        {
            return Err(windows::core::Error::from_thread());
        }
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
        let count = reader.LoadAsync(size as u32)?.join()?;
        let mut data = vec![0; count as usize];
        reader.ReadBytes(&mut data)?;
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
        let _ = tx.try_send(Message::Refresh);
        while let Ok(message) = rx.recv() {
            if service.stopped.load(Ordering::SeqCst) {
                break;
            }
            match message {
                Message::Stop => break,
                Message::Select(id, reply) => {
                    let result = if id
                        .as_ref()
                        .is_none_or(|id| sessions.iter().any(|s| &s.id == id))
                    {
                        selected = id;
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

                Message::Refresh => {}
            }
            let available = manager.GetSessions().map_err(|_| ())?;
            sessions.retain(|s| available.clone().into_iter().any(|n| n == s.native));
            for native in available {
                if sessions.iter().any(|s| s.native == native) {
                    continue;
                }
                next_id += 1;
                sessions.push(Session::subscribe(
                    format!("session-{next_id}"),
                    native,
                    &tx,
                ));
            }
            if !sessions.iter().any(|s| Some(&s.id) == selected.as_ref()) {
                selected = None;
            }
            let snapshots = sessions
                .iter_mut()
                .filter_map(|s| s.snapshot().ok())
                .collect();
            service.publish(
                app,
                PlaybackState {
                    sessions: snapshots,
                    selected_id: selected.clone(),
                    message: None,
                },
            );
        }
        drop(sessions);
        Ok(())
    }
}
#[cfg(windows)]
use native::run as worker;
