# Windows release candidate verification

## 0.1.1 music and installer branding fix

Built and installed on 15 November 2026. Use
`src-tauri/target/release/bundle/nsis/Aura_0.1.1_x64-setup.exe`; the 0.1.0 installer
predates the track-transition fix. Setup and uninstall icons now explicitly use
the same Aura icon as the executable. Windows shortcuts were refreshed after the
local upgrade.

- Installer: 2,145,418 bytes; SHA-256
  `d817225ea2dd71caf48983622adb3ce15ea71221454d58839cedf1c74b9f5a65`.
- Release executable SHA-256:
  `d2e9c16bcaba7ca4766664a44734897cfbf3ba4ff640d9ebc7a2b84c86fe12ed`.
- Installed executable SHA-256:
  `08e0ffe1f69b86ef4e166dc0108403c05e6e06a3f908de0cec0b182884c8c766`.
  The only byte differences are Tauri's expected `UNK` to `NSS` bundle-type marker.
- In-place `/UPDATE` from 0.1.0 to 0.1.1 passed. Saved app-data files and the
  Windows startup registration/override were preserved.
- Icons extracted from the release app, installer, installed app and uninstaller
  all match the Aura ICO at the Windows-selected display size.
- The packaged native WebView smoke passed against the new release executable.
  The installed 0.1.1 executable separately passed live Edge Next-track, late
  artwork, artwork-only metadata changes and media-session recreation checks.
- TypeScript, ESLint, formatting, production build and 83 Rust tests passed
  (3 existing live probes ignored). The preceding music fix passed all 61 music
  browser tests; diagnostic copying and cross-window diagnostics were rechecked
  after replacing the hard-coded diagnostic version with package metadata.

Evidence is under ignored `artifacts/release-checks/` and
`artifacts/music-live-smoke/installed-0.1.1-report.json`. These are local test
results; clean-machine and public-distribution acceptance remain separate.

## Earlier 0.1.0 candidate

The Windows x64 release-candidate checks passed on 15 November 2026. This is an
unsigned candidate for testing, not a public release.

| Check                                                           | Result                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Prettier, ESLint, strict TypeScript and Vite production build   | Passed                                                                                                                          |
| Rust format, Clippy with warnings denied, and locked unit tests | Passed: 70 tests; 3 live account/audio probes were skipped                                                                      |
| JavaScript security audit                                       | Passed: no known vulnerabilities; `minimatch` is pinned to 11.0.8                                                               |
| RustSec Windows-target audit                                    | Passed: no Windows release vulnerabilities; reviewed Linux and unused-crate advisories are absent from the Windows target graph |
| Chromium browser suite                                          | Passed: 126 tests, including error recovery, all four themes, all six layouts, compact-window, account and playback coverage    |
| Packaged Windows executable smoke test                          | Passed against the exact release executable, using a fresh isolated Aura profile and separate WebView2 data directory           |

Candidate package: `Aura-0.1.0-windows-x64-20261115T055221003Z`. The executable
SHA-256 is `339e259bf1f6ad3d23bcd56064ad04fcb692195c4682d3e45af46c923659da14`;
the NSIS installer SHA-256 is
`b5da7069c60b95ac64a7fb1ab41207b5d332d0c7460c2922a75ef6d1de37eb83`. The
candidate manifest and `SHA256SUMS.txt` contain the full artifact inventory.

Clean-machine install, upgrade and uninstall, Windows signing, mixed-monitor
physical interaction, and performance acceptance have not been completed.
`windowsReleaseValidated` and `publicDistributionApproved` remain false in the
release gate. YouTube account features remain gated for public distribution.

## Windows startup follow-up

The startup implementation was verified on 15 November 2026. The candidate and
hashes above predate this change. The rebuilt executable and NSIS installer use
the normal outputs under `src-tauri/target/release/`.

- Executable: 5,326,336 bytes; SHA-256
  `e34bc9cee90b33fb1795e96a5b0c737d554302c10276e54bd738a427f55be80b`.
- Installer: 2,139,724 bytes; SHA-256
  `6b9fc6f45ffcfd3a530c8691684d3fa63f82364bde7d95d5247f289d2d776214`.

- Rust: 80 tests passed; the same 3 live account/audio probes remain ignored.
- Browser: all 130 tests passed, including the four General/startup cases for
  preview availability, keyboard navigation, fresh reads, pending changes and
  error recovery. General was inspected in the real packaged WebView.
- Production Windows smoke: first launch registered a quoted current-user path
  containing spaces; enabled/disabled choices survived full process restarts;
  removing registration externally was preserved. Theme/layout files were
  unchanged. Repeated launches exited and restored the original minimized host.
- With the autostart plugin active, host access to startup commands and Settings
  access to raw autostart plugin commands were denied.
- Two normal debug launches ran independently without the production lock.
  Startup commands were unavailable and real startup values/marker were untouched.
- The isolated packaged native smoke passed, including startup command permissions,
  unavailable status and write rejection. Registry comparisons confirmed that the
  actual Windows startup values were untouched and no isolated marker was created.
- The generated NSIS script was inspected: current-user installation, `Aura` entry
  cleanup on uninstall, `/UPDATE` preservation and no startup writes on installation.
  Actual installer install/upgrade/uninstall was not exercised against the existing
  user installation; use a disposable account or VM for that acceptance.

Production smoke tests restored the original Windows startup state and removed
their test initialization marker. Evidence is under ignored
`artifacts/startup-smoke/`, `artifacts/startup-debug-smoke/` and
`artifacts/release-checks/`. The actual Windows sign-out/restart check remains
pending user participation. See the [startup acceptance steps](windows-startup.md).
