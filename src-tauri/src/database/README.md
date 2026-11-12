# Future local persistence

Theme/layout IDs currently use a versioned JSON file owned by the preferences
service. SQLite is planned, not installed or initialized. Introduce versioned migrations
and repositories when saved layouts or notes are implemented. Store one database
under Tauri's application-data directory. Keep raw SQL and filesystem paths out
of React. Prefer a Rust-owned connection with narrow commands; evaluate
`tauri-plugin-sql` if it materially simplifies that milestone. Back up before
destructive migrations and make failed migrations recoverable.
