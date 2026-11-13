use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeId {
    #[default]
    Violet,
    Ocean,
    Jade,
    Amber,
    Rose,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayoutId {
    #[default]
    #[serde(alias = "stats-left-clock-music", alias = "music-left-stats-clock")]
    ClockLeftStatsMusic,
    #[serde(alias = "stats-left-music-clock", alias = "music-left-clock-stats")]
    ClockLeftMusicStats,
    #[serde(alias = "stats-right-clock-music", alias = "music-right-stats-clock")]
    ClockRightStatsMusic,
    #[serde(alias = "stats-right-music-clock", alias = "music-right-clock-stats")]
    ClockRightMusicStats,
    MusicFocusClockLeft,
    MusicFocusClockRight,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedPreferences {
    pub schema_version: u8,
    pub theme_id: ThemeId,
    pub layout_id: LayoutId,
}

impl Default for SavedPreferences {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme_id: ThemeId::default(),
            layout_id: LayoutId::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesSnapshot {
    pub theme_id: ThemeId,
    pub layout_id: LayoutId,
    pub revision: u64,
    pub warning: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferencesPatch {
    pub theme_id: Option<ThemeId>,
    pub layout_id: Option<LayoutId>,
}
