# State ownership

The transient host pin control uses React state. Theme and layout preferences
have one authoritative Rust owner (`services/preferences.rs`), persisted as a
small versioned JSON file. `usePreferences` reads typed snapshots and subscribes
to native change events in each window. No state library is needed. Future notes
and named layouts can introduce SQLite at the same native boundary.
