# Widget components

`clock/` is the first implemented widget. It shows local time and date inside the
left side of the shared host surface. Its minute-aligned timer pauses while
hidden and resynchronizes on visibility/focus changes.

`system-monitor/` occupies the right side, showing CPU/RAM percentages, thin
usage bars and used/total physical RAM in GiB. Unavailable values use an em dash;
the browser preview does not fabricate system readings.

Add `music-player/` and `notes/` when implemented. Each widget exports a React
component and a definition for `features/widget-engine/registry.ts`.
