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

Host and settings have fixed initial sizes in logical pixels. The host is now a
640 x 212 rectangle, with a clock/date at the left and CPU/RAM readings at the
right. The clock and monitor surface are drag regions; icon controls are not.
Settings retains its own title bar. There is no full-screen invisible overlay. Taskbar presence is
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
and motion values. `GlassSurface` owns the common glass treatment and accepts an
opacity override; the compact host uses its default. `Text`, `IconButton`, `Toggle`, `ControlRow`
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

The registry is a static in-process map with clock and system-monitor definitions. `WidgetRenderer` resolves a visible
instance and safely omits unknown or unavailable kinds. It does not implement
layout, dragging or resizing. There is no dynamic code loading, third-party plugin
API or placeholder widget. The clock alone schedules a timeout at the
next minute boundary, pauses while hidden, and refreshes on visibility/focus.
The monitor owns a separate request lifecycle, scoped to its mounted component.

The components live under `components/widgets/clock` and
`components/widgets/system-monitor`, with definitions in the registry. Future
layout code will enforce minimum dimensions,
clamp positions to monitor work areas and persist logical coordinates. Saved
layouts carry a schema version and monitor identity. Themes will validate
allowlisted token overrides. Detailed widget configuration schemas should be
introduced with real widgets, rather than inventing a general plugin language.

## State and persistence

Topmost state lasts for this host session; opacity is a fixed design token. No store library is warranted
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
gets metadata/settings/system-snapshot permissions and topmost control. Settings receives only
drag, minimize and close. Production assets have a CSP; style attributes are
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
monotonic clock. The UI displays GiB and does not retain a history.

Future services should publish change events, batch
updates and stop work when unused. Core features must continue offline. CPU and
memory targets need measurement on real low-end systems; no resource claim is
made from framework choice alone.

References: [Tauri capabilities](https://v2.tauri.app/security/capabilities/),
[configuration](https://v2.tauri.app/reference/config/),
[IPC](https://v2.tauri.app/develop/calling-rust/).
