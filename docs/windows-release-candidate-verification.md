# Windows release candidate verification

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
