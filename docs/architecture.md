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

| Label         | Creation               | Purpose                        | Close behaviour                     |
| ------------- | ---------------------- | ------------------------------ | ----------------------------------- |
| `widget-host` | On launch              | Transparent foundation surface | Exit the app and close all windows  |
| `settings`    | Rust command on demand | Opaque Theme and Layout tabs   | Destroy settings only; host remains |

Only the host is frameless and uses a transparent native background plus transparent
HTML/body/root surfaces. The inset glass panel supplies its own subtle border and
shadow. `noRedirectionBitmap` is configured to reduce Windows transparent-window
startup flashes. This still needs testing across GPU drivers and WebView2 builds.

Host and settings have fixed initial sizes in logical pixels. The host is now a
760 x 264 rectangle. By default, the clock/date is at the left, with CPU/RAM cards at the
upper right and a music-entry panel beneath. The clock and non-interactive card
surfaces are drag regions; buttons are not.
Settings is 840 x 640 with an opaque dark background, native Windows frame and
title bar. Its content scrolls while the tabs and footer remain accessible.
There is no full-screen invisible overlay. Taskbar presence is
retained so minimizing has an obvious recovery path; no tray or hide-to-background
behaviour is introduced yet. Closing the host owns the application lifetime even
when settings is open. The host can opt into topmost mode, off by default.

Rust owns settings creation, including label, URL and configuration. The frontend
cannot create arbitrary windows. Repeated settings requests reuse and focus the
existing window. The command is asynchronous to avoid the Windows WebView2
synchronous creation deadlock. Each window has an independent React runtime;
cross-window preferences synchronize through Rust commands/events,
not shared JavaScript memory.

This is a **transparent top-level widget host**, not a desktop-icon-layer host.
Transparent padding can still intercept mouse input. CSS `pointer-events: none`
cannot make an HWND pass input to other processes. Never enable whole-window
click-through without a reliable way to recover interaction. See
[native integration research](native-integrations.md).

## Visual system

`styles/tokens.css` contains colour, type, spacing, radius, opacity, blur, shadow
and motion values. `GlassSurface` owns the common glass treatment and accepts an
opacity override plus panel/inset variants. The host uses a colour-tinted
translucent surface and a static local SVG wave. `Text`, `IconButton`, `Toggle`, `ControlRow`
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

The registry is a static in-process map with clock, system-monitor and music-entry definitions. `WidgetRenderer` resolves a visible
instance and safely omits unknown or unavailable kinds. It does not implement
layout, dragging or resizing. There is no dynamic code loading, third-party plugin
API or placeholder widget. The clock alone schedules a timeout at the
next minute boundary, pauses while hidden, and refreshes on visibility/focus.
The monitor owns a separate request lifecycle, scoped to its mounted component.
Its sparklines plot up to 32 actual snapshots in UI memory. Repeated cached
snapshots do not add graph points, unavailable CPU samples split the line, and
errors/unmount discard the buffer. There is no synthetic waveform or stored
usage history.

The music panel opens a separate Aura Music window and can show explicitly selected
Windows media-session controls. Official YouTube Data API account browsing/editing and desktop OAuth are
implemented behind a release gate. Spotify remains a future milestone. See
[music setup and validation](youtube-music.md) for credentials, native API requests,
the native boundary and the remaining provider/Windows release prerequisites.
The weather reading in the visual reference is not represented by fabricated data.

The components live under `components/widgets/clock`,
`components/widgets/system-monitor` and `components/widgets/music-player`, with definitions in the registry. Future
freeform layout code will enforce minimum dimensions,
clamp positions to monitor work areas and persist logical coordinates. Saved
layouts carry a schema version and monitor identity. Future custom themes will validate
allowlisted token overrides. Detailed widget configuration schemas should be
introduced with real widgets, rather than inventing a general plugin language.

## State and persistence

Topmost state lasts for this host session; opacity is a fixed design token.
Rust owns theme and layout preferences in a versioned `preferences.json` under
Tauri's application-config directory. Two allowlisted IDs do not need a database
or state library. Reads are bounded to 16 KiB; unknown values/schema versions and
corrupt files fall back to defaults with a Settings warning. Writes use a
same-directory temporary file and rename; failed writes retain the prior state.

`get_preferences` returns a typed snapshot. Only Settings can invoke
`set_preferences`, which merges a patch, persists it, then emits a snapshot to
both windows. Revision numbers discard stale replies/events. Each React window
subscribes before loading and cleans up its listener. Browser development uses
separate preview-only localStorage; production persistence stays in Rust.

Faulty Terminal is the sole theme. Its green CSS tokens accompany the React Bits
WebGL2 background on every widget page. The old five palette IDs migrate to
`faulty-terminal` in Rust and browser preview preferences, preserving layouts.
Six layouts offer four Clock arrangements and two Music focus arrangements.
Settings thumbnails pause the terminal animation and never run extra monitors.
The live effect respects reduced motion and suspends animation when hidden.

SQLite remains planned for notes and multiple named layouts, with versioned
migrations at the same Rust boundary. No database is created by this milestone.

## Security and performance

Capabilities name exact windows, with no remote origins, filesystem, shell, HTTP,
SQL, process or arbitrary-window-creation access. Core window capabilities gate
the caller's API access, not a sandbox around target labels; this trusted local
UI uses `getCurrentWindow()`. Do not load untrusted widget code into either
window. App commands are enrolled using
`AppManifest::commands` so they are subject to the capability ACL. The host alone
gets metadata/settings/system-snapshot permissions and topmost control. Both windows
can read preferences and subscribe/unsubscribe to events; only Settings can write
preferences, and Rust checks its caller label as well. Settings also receives close
permission; its native frame handles dragging/minimizing. Neither window can emit
frontend events. Production assets have a CSP; style attributes are
allowed for React/CSS-variable styling. Development additionally permits Vite's
loopback HMR connection. No unsafe script evaluation or remote script source is
allowed.

There are no background processes or network requests in product code. The clock
owns its timeout and visibility/focus listeners and cleans them up on unmount.
The monitor calls Rust, then schedules the next request one second after completion.
It pauses on document visibility changes, ignores stale in-flight completions,
and removes timers/listeners when unmounted. Failures stop scheduled requests
until retry or a visibility/focus resume event;
a native minimized/hidden result pauses until visibility/focus resumes.

`SystemMonitor` owns a lazy, mutex-protected `sysinfo::System` with only CPU usage
and physical RAM refreshes enabled. Commands use Tauri's blocking pool so native
collection does not block the UI thread. Cached snapshots prevent rapid callers
from refreshing more than once per second. No process, disk, GPU or network
sampling is requested. The native command also checks host visibility/minimized
state before collecting, independently of WebView visibility propagation.

CPU is unavailable during its initial baseline sample and after idle gaps over
three seconds; the following spaced sample reports current usage. Unavailable
memory and invalid CPU values are serialized as null, not zero. Percentages are
bounded, physical memory is represented in bytes, and sampling intervals use a
monotonic clock. The UI displays GiB and retains only the bounded transient
sparkline buffer; no monitoring history is persisted.

Future services should publish change events, batch
updates and stop work when unused. Core features must continue offline. CPU and
memory targets need measurement on real low-end systems; no resource claim is
made from framework choice alone.

References: [Tauri capabilities](https://v2.tauri.app/security/capabilities/),
[configuration](https://v2.tauri.app/reference/config/),
[IPC](https://v2.tauri.app/develop/calling-rust/).
