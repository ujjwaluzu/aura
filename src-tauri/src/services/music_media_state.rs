//! Recovery rules for transient Windows media-session and thumbnail updates.
use crate::models::music::PlaybackSession;
use std::time::{Duration, Instant};

pub const RECONNECT_GRACE: Duration = Duration::from_secs(3);
pub const MAX_ARTWORK_BYTES: u64 = 1_048_576;

/// Reuse a logical player only when both the old and new source are unique.
/// Different applications and ambiguous same-browser sessions require selection.
pub fn replacement_index(
    source: &str,
    previous: &[(&str, bool)],
    incoming_count: usize,
) -> Option<usize> {
    if source.is_empty() || incoming_count != 1 {
        return None;
    }
    let mut matches = previous
        .iter()
        .enumerate()
        .filter(|(_, (name, _))| *name == source);
    let (index, (_, present)) = matches.next()?;
    (!present && matches.next().is_none()).then_some(index)
}

#[derive(Default)]
pub struct SnapshotCache {
    last: Option<PlaybackSession>,
    failed_since: Option<Instant>,
}
impl SnapshotCache {
    pub fn accept(
        &mut self,
        next: Option<PlaybackSession>,
        now: Instant,
    ) -> Option<PlaybackSession> {
        if let Some(next) = next {
            self.last = Some(next.clone());
            self.failed_since = None;
            return Some(next);
        }
        let since = *self.failed_since.get_or_insert(now);
        if now.duration_since(since) > Duration::from_secs(10) {
            return None;
        }
        // Keep the player visible during a read/identity transition, but never
        // present stale controls as usable or extrapolate stale playback time.
        let mut last = self.last.clone()?;
        last.playing = false;
        last.can_play = false;
        last.can_pause = false;
        last.can_previous = false;
        last.can_next = false;
        last.can_seek = false;
        Some(last)
    }
}

/// Windows providers sometimes leave ContentType empty or use image/jpg.
/// Identify bounded raster bytes rather than trusting that optional label.
pub fn artwork_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 16 || bytes.len() as u64 > MAX_ARTWORK_BYTES {
        return None;
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session() -> PlaybackSession {
        PlaybackSession {
            id: "selected".into(),
            source: "Chrome".into(),
            title: "Track".into(),
            artist: "Artist".into(),
            playing: true,
            position_seconds: 2.0,
            updated_at_unix_ms: 1000,
            duration_seconds: 180.0,
            artwork: Some("image".into()),
            can_play: true,
            can_pause: true,
            can_previous: true,
            can_next: true,
            can_seek: true,
        }
    }
    #[test]
    fn reconnects_only_one_missing_player_from_the_same_application() {
        assert_eq!(
            replacement_index("Chrome", &[("Chrome", false)], 1),
            Some(0)
        );
        assert_eq!(replacement_index("Firefox", &[("Chrome", false)], 1), None);
        assert_eq!(replacement_index("Chrome", &[("Chrome", true)], 1), None);
        assert_eq!(
            replacement_index("Chrome", &[("Chrome", false), ("Chrome", false)], 1),
            None
        );
        assert_eq!(
            replacement_index("Chrome", &[("Chrome", false), ("Chrome", true)], 1),
            None
        );
        assert_eq!(replacement_index("Chrome", &[("Chrome", false)], 2), None);
        assert_eq!(replacement_index("", &[("", false)], 1), None);
    }
    #[test]
    fn read_failure_keeps_the_selected_player_without_stale_controls_then_recovers() {
        let now = Instant::now();
        let mut cache = SnapshotCache::default();
        cache.accept(Some(session()), now).unwrap();
        let waiting = cache.accept(None, now + Duration::from_secs(1)).unwrap();
        assert_eq!(waiting.id, "selected");
        assert_eq!(waiting.title, "Track");
        assert!(
            !waiting.can_next
                && !waiting.can_play
                && !waiting.can_pause
                && !waiting.can_seek
                && !waiting.playing
        );
        let mut next = session();
        next.title = "Next track".into();
        assert_eq!(
            cache
                .accept(Some(next), now + Duration::from_secs(2))
                .unwrap()
                .title,
            "Next track"
        );
        assert!(cache.accept(None, now + Duration::from_secs(3)).is_some());
        assert!(cache.accept(None, now + Duration::from_secs(14)).is_none());
    }
    #[test]
    fn thumbnails_accept_only_bounded_known_raster_signatures() {
        for (header, mime) in [
            (b"\x89PNG\r\n\x1a\n".as_slice(), "image/png"),
            (b"\xff\xd8\xff".as_slice(), "image/jpeg"),
            (b"RIFF1234WEBP".as_slice(), "image/webp"),
            (b"GIF89a".as_slice(), "image/gif"),
            (b"BM".as_slice(), "image/bmp"),
        ] {
            let mut bytes = header.to_vec();
            bytes.resize(32, 0);
            assert_eq!(artwork_mime(&bytes), Some(mime));
        }
        assert_eq!(artwork_mime(b"<svg xmlns='x'/>"), None);
        assert_eq!(artwork_mime(&[0; 32]), None);
        assert_eq!(artwork_mime(b"\x89PNG"), None);
        let mut oversized = vec![0; MAX_ARTWORK_BYTES as usize + 1];
        oversized[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        assert_eq!(artwork_mime(&oversized), None);
    }
}
