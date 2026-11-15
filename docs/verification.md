# Foundation verification

The subsequent [UX redesign verification](ux-redesign.md) records the consolidated
Settings experience, updated checks, and outstanding release acceptance. The
measurements below describe earlier milestones.

The latest official YouTube API milestone passed 29 Rust tests, 27 browser tests,
one native release WebView integration test and a separately enabled live token
refresh test. Real-account browsing, disposable-playlist edits, rating restoration,
restart and disconnect passed. See [the music verification record](youtube-music.md#verification-record)
for current installer measurements and remaining public release gates.

The historical foundation results below were executed on 13 November 2026 for the Theme and Layout settings milestone.
The widget remains a 760 x 264 logical-pixel glass host. Settings is a separate,
opaque 840 x 640 window with a native Windows frame.

## Environment

- Windows 11 Home Single Language x64, build 26300; Node 22.18.0, pnpm 11.15.1.
- Rust/Cargo 1.99.1, stable `x86_64-pc-windows-msvc`.
- Visual Studio Build Tools 2026, MSVC C++ workload; Windows SDK 10.0.26100.0.
- WebView2 Runtime 157.0.4341.46.

## Executed results

| Check                                                                                     | Result                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm.cmd typecheck`                                                                      | Passed, strict application and tooling TypeScript                      |
| `pnpm.cmd lint`                                                                           | Passed, zero warnings                                                  |
| `pnpm.cmd format:check`                                                                   | Passed                                                                 |
| `pnpm.cmd build`                                                                          | Passed; JS 266.66 kB / 82.06 kB gzip, CSS 26.73 kB / 6.63 kB gzip      |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked`                               | Passed                                                                 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` | Passed                                                                 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                                  | Passed                                                                 |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked`                                | Passed: 9 unit tests                                                   |
| `pnpm.cmd test:e2e`                                                                       | Passed: 13 Chromium browser tests                                      |
| Opt-in native WebView test                                                                | Passed: 1 integration test against the release executable              |
| Native full-process restart                                                               | Passed; Rose / clock-right with music above CPU/RAM restored on launch |
| `pnpm.cmd desktop:build`                                                                  | Passed; optimized executable and per-user NSIS installer               |

Browser tests cover the local clock and midnight rollover, compact host bounds,
absence of remote assets, monitor warm-up/errors/retry/suspension, music entry
buttons, opaque Settings, keyboard tab navigation, all five distinct palettes,
cross-tab updates, preference reloads and all twelve arrangements. Layout checks
verify that the three module surfaces stay inside the host without overflow and
both music buttons remain in view. CPU/RAM stays one group.

Rust cases cover protocol/monitor serialization, unavailable/invalid samples,
preference patch merging and cold reload, corrupt-file fallback, failed-save
retention of prior choices, and rejection of unknown themes/layouts/fields.

The native test attaches to this application's release WebView2 instance using
a process-local debugging option. It verifies real metadata and monitoring IPC,
structured errors, transparent host body and compact bounds, opaque Settings,
pin/unpin command completion, all twelve native preference updates reaching the
host, theme synchronization, invalid theme rejection, denied host preference
writes, denied Settings monitoring/metadata access, Settings reuse/close/reopen,
monitor suspension after minimizing and host-owned application shutdown.
It restores the original theme/layout before quitting. DOM activation exercises
React handlers and real IPC; it does not verify physical pointer input.

A separate local restart check applied Rose and the clock-right/music-above-stats
arrangement, fully exited the native process, launched it again and verified both
saved values and host layout attributes. It then restored the original selections.

Frontend and native screenshots were rendered and inspected locally. Examples
under ignored `artifacts/` include `aura-settings-theme.png`,
`aura-settings-layout.png` and `aura-ocean-clock-right.png`. These confirm WebView
rendering, not final wallpaper compositing. An initial tooling type check caught
a NodeList iteration issue in the new browser test; it was corrected before the
successful release build.

## Historical foundation build artifacts

These measurements precede the music integration. The build paths below are
reused; see the music verification record for the current installer.

- `src-tauri/target/release/aura.exe`: 3,243,520 bytes.
- `src-tauri/target/release/bundle/nsis/Aura_0.1.0_x64-setup.exe`: 1,217,413 bytes
  (1.16 MiB). Unsigned local artifact; not installed or published.
- Executable SHA-256:
  `6F9230A0B1513303D592BBFC39240799B9A99E210894E6296C5D612661809431`.
- Installer SHA-256:
  `9748700D6E5C9C42862F11212D53C3F66890C0A2B19433BC13A96C6BB86D7250`.

Resolved runtime packages: React/React DOM 19.3.1, Tauri API 2.12.4, Lucide React
1.72.0; native Tauri 2.12.5, Serde 1.0.229 and sysinfo 0.40.3 (system feature only).
No new package was downloaded for this milestone; serde_json was promoted from a
test dependency to a runtime dependency. Both lockfiles retain the exact graphs.

## Repeat native smoke test

First terminal (fresh process; port 9222 must be unused):

```powershell
pnpm.cmd desktop:build
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1'
& .\src-tauri\target\release\aura.exe
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
```

While Aura is open, use a second terminal:

```powershell
$env:AURA_NATIVE_CDP = 'http://127.0.0.1:9222'
pnpm.cmd test:e2e
Remove-Item Env:AURA_NATIVE_CDP
```

The test quits that instance. Remote debugging is process-local and is not
configured in product code. Only target your own Aura instance on loopback.

## Remaining acceptance

The Windows computer-use helper could not start in the earlier foundation run:
`windows sandbox failed: helper_unknown_error: setup refresh had errors`.
Therefore actual desktop compositing, physical dragging/button hit-testing,
taskbar recovery, visual topmost ordering and mixed-monitor/DPI behaviour remain
unverified. Native transparency is configured and WebView alpha was checked.
Native wallpaper blur is not implemented.

Clean-machine installer install/upgrade/uninstall, code signing, Windows 10,
other GPUs/WebView2 versions, assistive technology, Remote Desktop and performance
budgets remain untested. No public compatibility or resource promise is implied.
The YouTube Music account and media implementation is described in
[music setup and validation](youtube-music.md); its public account gate remains
closed pending provider and clean-machine acceptance; real-account API validation
passed (see the linked verification record). Spotify, weather, notes, multiple
named layouts and desktop-icon-layer integration remain
unimplemented. Core features and local preferences work offline.
