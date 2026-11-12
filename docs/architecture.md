# Architecture

## Boundaries

Aura is a single Windows desktop application. Vite builds static local React
assets into `dist`; Tauri embeds them in a native executable rendered by WebView2.
There is no production frontend server, cloud service, authentication, telemetry,
remote font, marketplace or website workspace.

`src/app/App.tsx` selects a window view using a fixed local URL. Shared UI lives in
`components/ui`, behaviour in hooks/features, and IPC calls in `lib/native.ts`.
Keep OS access and future sampling in Rust services. Commands validate input and
return serializable models. The frontend never receives a raw filesystem or SQL
interface. A protocol version makes accidental frontend/backend mismatches fail
with a clear error instead of silently returning incompatible data.

`get_foundation_info({ protocolVersion: 1 })` returns application metadata,
platform and host mode. An incompatible version returns `{ code, message }`.
TypeScript documents the contract; Rust tests verify its serialized field names.
The connection hook handles unmounts/stale completions and exposes retry. Browser
preview does not fabricate a successful native response.

## Windows and lifetime

| Label         | Creation               | Purpose                          | Close behaviour                     |
| ------------- | ---------------------- | -------------------------------- | ----------------------------------- |
| `widget-host` | On launch              | Transparent foundation surface   | Exit the app and close all windows  |
| `settings`    | Rust command on demand | Separate preferences placeholder | Destroy settings only; host remains |

Both windows are frameless and use transparent native backgrounds plus transparent
HTML/body/root surfaces. The inset glass panel supplies its own subtle border and
shadow. `noRedirectionBitmap` is configured to reduce Windows transparent-window
startup flashes. This still needs testing across GPU drivers and WebView2 builds.

Host and settings have fixed initial sizes in logical pixels. Only the title bar
is a drag region. There is no full-screen invisible overlay. Taskbar presence is
retained so minimizing has an obvious recovery path; no tray or hide-to-background
behaviour is introduced yet. Closing the host owns the application lifetime even
when settings is open. The host can opt into topmost mode, off by default.

Rust owns settings creation, including label, URL and configuration. The frontend
cannot create arbitrary windows. Repeated settings requests reuse and focus the
existing window. The command is asynchronous to avoid the Windows WebView2
synchronous creation deadlock. Each window has an independent React runtime;
future cross-window preferences must synchronize through Rust commands/events,
not shared JavaScript memory.

This is a **transparent top-level widget host**, not a desktop-icon-layer host.
Transparent padding can still intercept mouse input. CSS `pointer-events: none`
cannot make an HWND pass input to other processes. Never enable whole-window
click-through without a reliable way to recover interaction. See
[native integration research](native-integrations.md).

## Visual system

`styles/tokens.css` contains colour, type, spacing, radius, opacity, blur, shadow
and motion values. `GlassSurface` owns the common glass treatment and accepts a
bounded opacity supplied by controls. `Text`, `IconButton`, `Toggle`, `ControlRow`
and `Stack` keep widgets consistent. Tailwind provides layout utilities; visual
tokens remain ordinary CSS custom properties. Typography uses local Windows
fonts, icons ship in the bundle, and reduced-motion preferences are respected.

CSS backdrop blur affects content inside the WebView composition; it does not
promise native blur of the wallpaper or other applications. The translucent dark
fallback remains usable without backdrop-filter. Native Acrylic/Mica is a
separate later experiment.

## Widget engine

`WidgetDefinition` describes a kind's display name, component, default/minimum
dimensions, default position/configuration and default theme. `WidgetInstance`
holds a unique instance ID, kind, dimensions, position, visibility, configuration
and theme ID. Separating the two allows multiple notes without duplicating a
definition. IDs should be generated when instances are created, not during render.

The registry is a static in-process map. `WidgetRenderer` resolves a visible
instance and safely omits unknown or unavailable kinds. It does not implement
layout, dragging or resizing. No dynamic code loading, third-party plugin API,
background widget timers or placeholder widgets are registered.

When building the first clock, add its component under `components/widgets/clock`
and its definition to the registry. Layout code will enforce minimum dimensions,
clamp positions to monitor work areas and persist logical coordinates. Saved
layouts carry a schema version and monitor identity. Themes will validate
allowlisted token overrides. Detailed widget configuration schemas should be
introduced with real widgets, rather than inventing a general plugin language.

## State and persistence

Opacity/topmost state lasts for this host session. No store library is warranted
yet. SQLite is planned for local notes, layouts and preferences, with versioned
migrations and one authoritative Rust persistence boundary. Introduce the
dependency when the first persistent feature exists. No database is created by
this foundation.

## Security and performance

Capabilities name exact windows, with no remote origins, filesystem, shell, HTTP,
SQL, process or arbitrary-window-creation access. Core window capabilities gate
the caller's API access, not a sandbox around target labels; this trusted local
UI uses `getCurrentWindow()`. Do not load untrusted widget code into either
window. App commands are enrolled using
`AppManifest::commands` so they are subject to the capability ACL. The host alone
gets metadata/settings permissions and topmost control. Settings receives only
drag, minimize and close. Production assets have a CSP; style attributes are
allowed for React/CSS-variable styling. Development additionally permits Vite's
loopback HMR connection. No unsafe script evaluation or remote script source is
allowed.

There are no sampling loops, background processes, global listeners or network
requests in product code. Future services should publish change events, batch
updates and stop work when unused. Core features must continue offline. CPU and
memory targets need measurement on real low-end systems; no resource claim is
made from framework choice alone.

References: [Tauri capabilities](https://v2.tauri.app/security/capabilities/),
[configuration](https://v2.tauri.app/reference/config/),
[IPC](https://v2.tauri.app/develop/calling-rust/).
