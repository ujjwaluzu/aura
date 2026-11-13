# Native integration boundary

`system-monitor.ts` consumes the typed `get_system_snapshot` Rust command.
The widget hook requests snapshots while visible, with no overlapping polling
requests. Rust caches and limits actual OS sampling to at most once per second.
Settings has no permission to access these readings.

`music.ts` exposes typed native account, library and media operations. React never
receives OAuth tokens or sends arbitrary URLs to the browser. `useMusic` consumes
scoped native account/media events; Windows sessions do not use an interval poll.
Account enablement remains gated pending official API validation and public release requirements.
See [music setup and validation](../../../docs/youtube-music.md).
See [native integrations](../../../docs/native-integrations.md) for the investigation.
