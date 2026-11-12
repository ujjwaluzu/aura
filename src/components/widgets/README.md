# Widget components

`clock/` is the first implemented widget. It shows local time and date inside the
left side of the shared host surface. Its minute-aligned timer pauses while
hidden and resynchronizes on visibility/focus changes.

Add `system-monitor/`, `music-player/` and `notes/` when implemented. Each widget
exports a React component and a definition for `features/widget-engine/registry.ts`.
The right side of the host is intentionally empty until a future widget exists.
