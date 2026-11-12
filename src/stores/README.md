# State ownership

The transient host pin control uses React state. No state library or persistence is
needed in the foundation. Future shared layout/preferences state should have one
authoritative Rust/SQLite owner and typed frontend snapshots/events.
