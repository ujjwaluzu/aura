# Native integration investigation

All integrations below are planned. No monitoring, media, startup or Explorer
reparenting code ships in the foundation.

## CPU and RAM

Evaluate the Rust [`sysinfo` crate](https://docs.rs/sysinfo/latest/sysinfo/), using
one long-lived `System` instance. Refresh only CPU usage and memory fields, rather
than scanning every process, disk and sensor. CPU usage is calculated between
samples: warm up with two refreshes separated by at least
[`MINIMUM_CPU_UPDATE_INTERVAL`](https://docs.rs/sysinfo/latest/sysinfo/constant.MINIMUM_CPU_UPDATE_INTERVAL.html).
Do not display the first sample as a trustworthy zero. Memory values are bytes;
compute units and percentages consistently from used/total memory.

Start at approximately one update per second when a monitor widget is visible;
measure before increasing frequency. Run collection off the UI thread, share one
sampler across widgets, and stop it when no consumer exists. Emit compact typed
snapshots (`cpuPercent`, `usedMemoryBytes`, `totalMemoryBytes`, sample timestamp),
and represent unavailable readings explicitly. Recheck crate MSRV and API version
when adding the dependency; the crate is deliberately not installed now.

## Universal music

Use the Rust `windows` crate's `Windows.Media.Control` WinRT bindings for
[`GlobalSystemMediaTransportControlsSessionManager`](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager?view=winrt-26100).
Call `RequestAsync`, then `GetSessions`/`GetCurrentSession`. The API is available
from Windows 10 version 1809. The Windows documentation lists `globalMediaControl`;
validate access and packaging requirements in the eventual unpackaged/NSIS and
any future MSIX distribution separately. A Tauri capability does not grant a
Windows capability or guarantee WinRT access.

For each [session](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession?view=winrt-26100),
use `TryGetMediaPropertiesAsync` for title/artist/album and optional thumbnail,
`GetPlaybackInfo` for status/control support, and `GetTimelineProperties` for
position, duration and last-update time. Respect playback capabilities before
offering `TryTogglePlayPauseAsync`, `TrySkipPreviousAsync` or `TrySkipNextAsync`.
Handle false results, no current session, disposed sessions and API failures.

Prefer `SessionsChanged`, `CurrentSessionChanged`, `MediaPropertiesChanged`,
`PlaybackInfoChanged` and `TimelinePropertiesChanged` over frequent polling.
Unsubscribe event tokens when sessions disappear or the service stops. Extrapolate
playback progress only while playing; reconcile on events and suspend when hidden.
Bound thumbnail size, decode/cache locally and avoid unrestricted URL loading.

Spotify and YouTube Music are initial consumers of this universal adapter when
their Windows app/browser exposes a media session. Availability, artwork and
transport controls depend on the provider, browser and playback state. These
APIs do not supply streaming, account libraries, authentication, guaranteed source
identity or separate per-tab control. Do not promise universal support before
testing Spotify desktop and YouTube Music in Edge/Chrome, including paused,
private, installed-PWA and multiple-session cases. No Spotify web API or OAuth is
needed for this initial strategy.

## Transparency, blur and input

Tauri's [window configuration](https://v2.tauri.app/reference/config/) provides
`transparent`, `decorations`, position, monitor and topmost support. Foundation
windows use per-pixel alpha, a transparent WebView background and local CSS glass
surfaces. `noRedirectionBitmap` is a Windows startup-flash mitigation, not a
guarantee across drivers. Native transparency must be tested on the actual app.

CSS `backdrop-filter` does not blur the desktop behind the HWND. A future native
effect may use Tauri-supported window effects or a carefully gated Windows 11
backdrop implementation, with a translucent fallback. Do not rely on
[`DwmEnableBlurBehindWindow`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmenableblurbehindwindow)
for modern blur: Microsoft documents that it no longer produces blur beginning
with Windows 8. Effects, transparent WebView composition and child parenting may
interact; test them together before adopting a native effect.

Transparent pixels do not imply click-through. Tauri can ignore cursor events for
the entire window, but that would also disable its controls. Future per-widget
windows or a native hit-test region may avoid large invisible input-blocking
areas; assess WebView2 child-window hit testing and accessibility before choosing.
Always preserve a taskbar/tray/edit-mode recovery route. No click-through is
enabled now.

## Position, topmost and monitors

Prefer Tauri APIs for normal position/size, scale factors and monitor enumeration.
When direct Win32 is justified, [`SetWindowPos`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
controls Z-order/position; `HWND_TOPMOST` provides topmost behaviour, not desktop
integration. Avoid focus stealing with appropriate flags. Do not claim topmost
works over every exclusive fullscreen application or secure desktop.

For [multi-monitor support](https://learn.microsoft.com/en-us/windows/win32/gdi/multiple-display-monitors),
consider `EnumDisplayMonitors`, `GetMonitorInfo`, `MonitorFromWindow` and
`WM_DPICHANGED`/display-change notifications. Store logical positions per monitor,
convert to physical pixels at native boundaries, handle negative desktop origins,
and clamp restored windows into a connected monitor's work area. Test unplugging,
taskbar relocation, mixed scaling, sleep/resume and Remote Desktop. Monitor IDs
need a stable mapping and a fallback when displays are replaced.

## Desktop-icon-layer integration

A transparent top-level window remains a normal application window. Putting it
behind icons requires a separate Explorer-shell integration strategy. Simply
setting bottom Z-order or parenting to `GetDesktopWindow()` is not a reliable
way to join the wallpaper/icon layer.

An experimental approach used by desktop-customisation software discovers
Explorer's `Progman`/`WorkerW` windows and `SHELLDLL_DefView`, then reparents a
native host to a suitable WorkerW sibling. The often-used `0x052C` shell message,
window hierarchy and sibling-selection rules are **undocumented implementation
details**, not a supported Windows contract. Treat this as a proposed experiment,
not a verified or shippable integration. The official Win32 documentation does
not establish a general supported API for arbitrary WebView widgets behind icons.

[`SetParent`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent)
does not adjust `WS_CHILD`/`WS_POPUP` styles itself. Cross-process parent/child DPI
awareness differences can trigger errors or DPI resets. Shell reparenting also
needs validation of coordinate conversion, WebView2 rendering, focus/input,
keyboard navigation, icon clicks, Show Desktop, virtual desktops, Explorer
restart, wallpaper changes and native backdrop effects.

If investigated, isolate unsafe Win32 operations in a Windows-only Rust service
behind a `Floating`/`DesktopAttached` mode boundary. Discover handles at runtime,
validate owning processes/classes, preserve original styles/parent, and recover
on shell restart. Use an opt-in experiment with automatic return to a normal
floating window on failure. Consider one host per monitor versus per-widget
windows based on measured WebView memory and input behaviour. Settings must
always remain a normal accessible window. Do not ship this mode until a Windows
version/DPI/shell-restart acceptance matrix passes.
