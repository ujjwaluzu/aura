# Foundation verification

Executed on 12 November 2026. This records actual results and separates automated
WebView/native checks from unverified Windows visual behaviour.

Updated for the compact purple-glass iteration: a 760 x 264 host with a clock/date
on the left, side-by-side CPU/RAM history cards above two music entry buttons on
the right, a static ambient wave, and corner controls. Window area is about 54%
smaller than the previous 1120 x 388 host. The
introduction, opacity slider and visible diagnostic footer have been removed.

## Environment

- Windows 11 Home Single Language x64, build 26300; Node 22.18.0 and pnpm 11.15.1.
- Rust/Cargo 1.99.1, stable `x86_64-pc-windows-msvc`.
- Visual Studio Build Tools 2026, MSVC C++ workload; Windows SDK 10.0.26100.0.
- WebView2 Runtime 157.0.4341.46.

## Executed results

| Check                                                                                     | Result                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm.cmd install --frozen-lockfile`                                                      | Passed, lockfile installed without changes                        |
| `pnpm.cmd audit --prod`                                                                   | Passed; no known production advisories reported at check time     |
| `pnpm.cmd typecheck`                                                                      | Passed, strict application and tooling TypeScript                 |
| `pnpm.cmd lint`                                                                           | Passed, zero warnings                                             |
| `pnpm.cmd format:check`                                                                   | Passed                                                            |
| `pnpm.cmd build`                                                                          | Passed; JS about 259 kB / 80 kB gzip, CSS about 19 kB / 5 kB gzip |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked`                               | Passed                                                            |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` | Passed                                                            |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                                  | Passed                                                            |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked`                                | Passed: 5 unit tests, no failures                                 |
| `pnpm.cmd test:e2e`                                                                       | Passed: 10 Chromium browser tests                                 |
| `pnpm.cmd tauri build --debug --no-bundle -- --locked`                                    | Previously passed for the clock; current module tested in release |
| Opt-in native WebView test                                                                | Passed: 1 integration test against the release executable         |
| `pnpm.cmd desktop:build`                                                                  | Passed; optimized executable and per-user NSIS installer          |

Browser tests cover preview honesty, local clock updates at minute boundaries,
date rollover at midnight, the settings placeholder, compact-window overflow,
absence of remote asset requests, CPU warm-up without fake zero readings,
one-second monitor requests, suspension/resume while hidden, and
structured error/retry behaviour using a deliberate test transport substitute.
The new layout test checks card placement and both music buttons' coming-soon
responses. Reduced motion is enabled for geometry checks so the entrance animation
does not shift measurements between captures.
These browser checks do not prove native behaviour.

The native test connected to the actual packaged-assets release executable using
an opt-in process-local WebView2 debugging option. It
verified real metadata IPC, structured rejection of an invalid protocol,
transparent WebView body, compact host bounds, clock visibility, real CPU/RAM
readings within valid ranges, real-sample sparkline paths, visible provider-entry
buttons, pin/unpin command completion, separate
settings creation/reuse/close/reopen, denial of both metadata and monitoring
commands from settings, a `MONITOR_PAUSED` response after minimizing the native
host, and application shutdown while settings was still open. DOM activation
exercised React handlers and real IPC; it does not verify physical pointer input.
The test process exited when the smoke test quit the host. The optimized release
executable was subsequently launched for local use without remote-debugging
environment options.

Frontend and native WebView screenshots were rendered and inspected locally at
`artifacts/aura-compact-purple-preview.png` and `artifacts/aura-compact-purple-native.png` (ignored by
Git). They confirm the UI rendering, not the final desktop compositor output.

Initial validation found and fixed a 22-pixel host overflow, a redundant effect
state update and test typing/selector issues. The native harness was corrected
to capture structured rejections inside the page before CDP serialization. Fresh
debug sessions must fully exit before another launch to avoid transient WebView2
targets from a previous browser process. Final pass results above supersede
those initial failures.

The compact clock timing test uses paused browser time so application startup
does not cross the tested minute boundary. The native viewport test allows a few
logical pixels for Windows frame/DPI rounding around the configured 264-pixel
host. Rust services are unchanged in this visual iteration; Rust check, Clippy and
all five unit tests were executed during the previous CPU/RAM iteration. The unit cases cover serialization,
unavailable data and invalid/out-of-range readings. An initial compile found a
sysinfo API name mismatch (`with_usage`); it was corrected before the passing checks.

## Build artifacts

- `src-tauri/target/release/aura.exe`: 3,194,368 bytes.
- `src-tauri/target/release/bundle/nsis/Aura_0.1.0_x64-setup.exe`: 1,200,143 bytes
  (1.14 MiB). Unsigned local development artifact; not installed or published.
- Executable SHA-256:
  `2F3630EE4E500BEBEC909EBF83EEFAC1F8931B5697B034C1A6E6A80A41530ABF`.
- Installer SHA-256:
  `BA3ED3DB267284D807062FAF81ACAB4D59933739ACB4410E76B263E5917372AB`.

Resolved runtime packages: React/React DOM 19.3.1, Tauri API 2.12.4, Lucide React
1.72.0; native Tauri 2.12.5, Serde 1.0.229 and sysinfo 0.40.3 (system feature only). Development tools include TypeScript
5.9.3, Vite 7.3.8 with React plugin 5.2.0, Tailwind 4.3.5, Tauri CLI 2.12.4,
ESLint 10.14.0, Prettier 3.10.0 and Playwright 1.65.0. Full exact dependency graphs
are in the two lockfiles.

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

The test quits that test app. The remote debugging option is process-local and
is not present in source configuration or the release environment. Tests must
only target the developer's own Aura instance on loopback.

## Remaining acceptance

The Windows computer-use helper could not start: `windows sandbox failed:
helper_unknown_error: setup refresh had errors`. Resetting/retrying did not
recover it. Therefore actual desktop compositing, native blur, physical drag and
button hit-testing, minimize/taskbar recovery, visual topmost ordering and
mixed-monitor/DPI behaviour were **not visually verified**. Native transparency
is configured and WebView alpha was checked; full desktop transparency must
still be confirmed on the visible app. Native wallpaper blur is not implemented.

Clean-machine installer install/upgrade/uninstall, code signing, Windows 10,
additional Windows 11 builds, alternate GPUs/WebView2 versions, accessibility
assistive technology, Remote Desktop, mixed-DPI monitors and performance budgets
remain untested. No public compatibility or idle-resource promise is implied.
Clock and CPU/RAM monitoring are implemented. The music panel only contains
connection entry buttons with a coming-soon response. Account/media integration,
weather, persistence, startup registration and desktop-icon-layer integration
remain unimplemented. The reference image is not bundled as an application
background; the native background stays transparent.
