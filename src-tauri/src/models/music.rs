use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicAccountState {
    pub revision: u64,
    pub status: String,
    pub name: Option<String>,
    pub channel_id: Option<String>,
    pub message: Option<String>,
    pub validation_build: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrack {
    pub id: Option<String>,
    pub title: String,
    pub channel_title: String,
    pub duration: Option<String>,
    pub artwork_url: Option<String>,
    pub liked: Option<bool>,
    pub available: bool,
    pub item_id: Option<String>,
    pub position: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylist {
    pub id: String,
    pub title: String,
    pub editable: bool,
    pub artwork_url: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPage {
    pub tracks: Vec<MusicTrack>,
    pub playlists: Vec<MusicPlaylist>,
    pub playlist: Option<MusicPlaylist>,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum MusicQuery {
    Search {
        query: String,
        filter: SearchFilter,
        page_token: Option<String>,
    },
    Liked {
        page_token: Option<String>,
    },
    Playlists {
        page_token: Option<String>,
    },
    Playlist {
        id: String,
        page_token: Option<String>,
    },
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchFilter {
    Music,
    All,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MoveDirection {
    Up,
    Down,
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum MusicChange {
    Like {
        id: String,
        liked: bool,
    },
    Create {
        title: String,
    },
    Rename {
        id: String,
        title: String,
    },
    Add {
        id: String,
        track_id: String,
    },
    Remove {
        id: String,
        item_id: String,
    },
    Move {
        id: String,
        item_id: String,
        direction: MoveDirection,
    },
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub sessions: Vec<PlaybackSession>,
    pub selected_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSession {
    pub id: String,
    pub source: String,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub position_seconds: f64,
    pub updated_at_unix_ms: u64,
    pub duration_seconds: f64,
    pub artwork: Option<String>,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_previous: bool,
    pub can_next: bool,
    pub can_seek: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    Play,
    Pause,
    Previous,
    Next,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum MusicTarget {
    Home {
        #[serde(default)]
        player: Player,
    },
    Track {
        id: String,
        #[serde(default)]
        player: Player,
    },
    Playlist {
        id: String,
        #[serde(default)]
        player: Player,
    },
}

#[derive(Default, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Player {
    #[default]
    YoutubeMusic,
    Youtube,
}
