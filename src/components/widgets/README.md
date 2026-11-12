# Widget components

`clock/` is the first implemented widget. It shows local time and date inside the
left side of the shared host surface. Its minute-aligned timer pauses while
hidden and resynchronizes on visibility/focus changes.

`system-monitor/` occupies the upper right, showing CPU/RAM percentages, bounded
sparklines from real samples and used/total physical RAM in GiB. Unavailable values use an em dash;
the browser preview does not fabricate system readings.

`music-player/` currently contains the two provider connection entry buttons.
Actual account/media integration is not implemented. Add `notes/` when implemented. Each widget exports a React
component and a definition for `features/widget-engine/registry.ts`.
