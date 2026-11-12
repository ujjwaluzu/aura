mod foundation;
mod preferences;
mod system_monitor;

pub use foundation::{AppError, FoundationInfo};
#[cfg(test)]
pub use preferences::{LayoutId, ThemeId};
pub use preferences::{PreferencesPatch, PreferencesSnapshot, SavedPreferences};
pub use system_monitor::SystemSnapshot;
