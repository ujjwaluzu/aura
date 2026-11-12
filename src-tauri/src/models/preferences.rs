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
    ClockLeftStatsMusic,
    ClockLeftMusicStats,
    ClockRightStatsMusic,
    ClockRightMusicStats,
    StatsLeftClockMusic,
    StatsLeftMusicClock,
    StatsRightClockMusic,
    StatsRightMusicClock,
    MusicLeftClockStats,
    MusicLeftStatsClock,
    MusicRightClockStats,
    MusicRightStatsClock,
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
