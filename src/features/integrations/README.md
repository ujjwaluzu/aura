# Native integration boundary

`system-monitor.ts` consumes the typed `get_system_snapshot` Rust command.
The widget hook requests snapshots while visible, with no overlapping polling
requests. Rust caches and limits actual OS sampling to at most once per second.
Settings has no permission to access these readings.

Future adapters can also consume scoped events. No music APIs or network clients
are implemented.
See [native integrations](../../../docs/native-integrations.md) for the investigation.
