# Windows releases

The foundation configures a **per-user NSIS installer** for Windows x64. There is
no release server, updater, signing service, GitHub workflow, download portal or
publishing step. Nothing is uploaded by the build commands.

## Build locally

1. Use Windows with the toolchain in [development.md](development.md).
2. Install the committed JavaScript lockfile with `pnpm.cmd install --frozen-lockfile`.
3. Run all frontend/native checks and manual window acceptance.
4. Keep versions in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json` synchronized; update the lockfiles.
5. Run `pnpm.cmd desktop:build`.
6. Inspect `src-tauri/target/release/aura.exe` and
   `src-tauri/target/release/bundle/nsis/`.

Review the bundle identifier `com.projectaura.desktop` and publisher/product
metadata before the first public release. The identifier is provisional; once
shipped it affects app identity and local data paths and should remain stable.
The bundled icon is an initial local Aura mark, not final brand artwork.

Tauri's Windows bundler may download NSIS/build tooling on the first run. The
configured Evergreen WebView2 bootstrapper downloads the runtime **only if needed
on the destination machine**. Product functionality itself is offline. A fully
offline installer would need a separately evaluated embedded/offline WebView2
installation mode and a larger package.

## Before public distribution

- Code-sign and timestamp the executable and installer with a trusted Windows
  signing identity; never commit signing keys or secrets. An unsigned development
  build can trigger SmartScreen and is not a production release.
- Finalize product ownership, application identity, support policy and licensing.
  Audit dependency licenses and security advisories; keep the WebView runtime
  support policy explicit.
- Test clean install, upgrade, uninstall, non-admin user, paths with spaces and
  Unicode, offline launch, missing WebView2, multiple displays/DPI and Explorer
  restart. Verify process exit and no orphan settings window.
- Measure installer size, cold start, idle CPU and total process-tree memory.
  Retain results rather than claiming performance from the stack alone.
- Verify production CSP/capabilities, no debug endpoints and no unnecessary
  network connections. Confirm icons, version metadata and failure messages.
- Test preservation of the versioned theme/layout preferences during upgrades.
  Back up local data before future schema migrations and test rollback.
- Produce hashes, release notes and an inventory of dependencies/toolchain
  versions. Publishing infrastructure belongs to a separate later phase.

MSI can be evaluated later if enterprise deployment requires it. This foundation
uses NSIS only, avoiding an unnecessary second installer path and MSI's additional
WiX/VBScript build considerations.

References: [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/),
[Windows signing](https://v2.tauri.app/distribute/sign/windows/).
