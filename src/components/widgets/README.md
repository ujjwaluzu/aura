# Widget components

When implemented, add `clock/`, `system-monitor/`, `music-player/` and `notes/`
here. Each widget exports a React component and a definition for the registry in
`features/widget-engine/registry.ts`. All widgets share the UI glass primitives.
No widget is registered or rendered in the foundation release.
