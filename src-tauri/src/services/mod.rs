pub mod foundation;
pub mod github;
pub mod github_api;
pub mod github_vault;
pub mod music;
pub mod music_media;
#[cfg(any(windows, test))]
mod music_media_state;
pub mod music_oauth;
pub mod music_policy;
pub mod music_vault;
pub mod preferences;
pub mod profile;
pub mod startup;
pub mod system_monitor;
pub mod youtube_api;

#[cfg(windows)]
pub mod music_volume;

pub mod window_recovery;
