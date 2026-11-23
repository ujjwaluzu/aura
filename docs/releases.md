# Windows releases

Aura prepares a **per-user NSIS installer** for Windows x64. The repository does
not publish automatically. Pull requests and pushes to `main` run Windows
verification. The manually triggered **Publish unsigned beta and Pages** workflow
verifies, packages and tests the native app, uploads and checks draft assets,
publishes `v0.1.3-beta.2` as an unsigned prerelease, downloads the public installer
without authentication, checks its SHA-256, then builds and deploys GitHub Pages.
The old `v0.1.0-rc.1` draft is left untouched.

## Publish the approved early beta

Configure the existing Aura-owned OAuth client ID as the repository variable
`AURA_GITHUB_CLIENT_ID`. This public client identifier is compiled into the app;
personal credentials, user tokens and Google validation credentials are never
release inputs. Enable GitHub Pages with **GitHub Actions** as the source.
Commit source and local acceptance evidence, then dispatch `publish-beta.yml`
from `main`. The application identity remains `com.projectaura.desktop`.

The workflow installs the official Microsoft WebView2 Evergreen Runtime if
missing, validating its bootstrapper signature. Native integration failure stops
publication and retains startup/endpoint diagnostics in the workflow artifact.
No failure is bypassed or marked successful.

Hosted Windows runners are elevated. WebView2 150+ deliberately ignores test
debugging environment flags in elevated hosts, as recorded in
[Wry #1782](https://github.com/tauri-apps/wry/issues/1782) and
[Microsoft's confirmation](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645).
The CI helper downloads checksum-pinned gsudo 2.6.1 from its official release and
runs the same native test at Medium integrity, verified in its report. Only the
current runner identity receives Modify access to its disposable checkout.
Machine-wide browser security policies remain intact; a missing launcher,
incorrect integrity level or native assertion failure stops publication.
CI packaging uses PowerShell 7 to match the runner's module environment. An
early preflight exercises the same Authenticode and archive helpers before the
costly verification/build steps. Local Windows PowerShell workflows keep their
existing host.

Release assets are `Aura_0.1.3-beta.2_x64-setup.exe`, `SHA256SUMS.txt`,
`release-manifest.json`, and `Aura-0.1.3-beta.2-evidence.zip`. The manifest includes
actual installer bytes, hash, source fingerprint, toolchain and gated features.
The evidence archive contains dependency notices and successful check reports.
Website download details are generated from the checksum-verified public copy.

If deployment fails after release publication, dispatch the workflow with
`pages_only=true`. This downloads and verifies the existing versioned public
assets and retries Pages, without rebuilding or replacing the installer.
Published assets are never overwritten. A partially uploaded beta draft requires
inspection before retry; the workflow fails safely instead of clobbering assets.

This early beta deliberately precedes signing and clean-Windows acceptance.
The [release notes](beta-release-notes.md) disclose unsigned installation,
pending clean-machine tests, Windows 11 as the primary local test environment,
and gated Google account/library access. No provider approval is claimed.

## Build a release candidate

Use the Windows toolchain in [development.md](development.md), install
`cargo-audit` 0.23.0 and run:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd verify
pnpm.cmd release:candidate --reuse-verification
```

Verification runs formatting, ESLint, TypeScript/Vite production build, Rust
formatting, Clippy, Rust unit tests, JavaScript and Rust security audits, and
the Chromium suite. Candidate generation rebuilds the locked NSIS package,
launches that exact executable against an isolated Aura data directory and
WebView2 profile, then exercises native permissions, settings, playback IPC,
themes and all layouts. It restores data inside the temporary profile and shuts
down only the process it launched.

The output in `artifacts/release-candidate/` includes the installer, executable,
dependency notices and inventory, lockfiles, check records, source fingerprint,
toolchain versions, Authenticode status and SHA-256 sums. Candidates are
unsigned testing builds. Inspect `candidate-manifest.json` and
verify `SHA256SUMS.txt` before installing. The installer requests WebView2 only
when the destination machine needs it.

`pnpm.cmd verify` alone runs all checks without building or publishing an
installer. `pnpm.cmd release:candidate` performs verification itself; use the
reuse option only when its passing record is under 12 hours old and matches the
current source fingerprint.

See [current release-candidate verification](windows-release-candidate-verification.md)
for the latest Windows check results and artifact hashes.

The Rust advisory scan reports the Linux-only GTK `glib` advisory, unmaintained
D-Bus crates from the single-instance plugin, and an unused unmaintained macro
crate in the cross-platform lockfile. The Windows target
dependency graph is checked to exclude both; any new or changed advisory fails
the audit step. The JavaScript lockfile pins the patched `minimatch` release.

## Build locally

1. Use Windows with the toolchain in [development.md](development.md).
2. Install the committed JavaScript lockfile with `pnpm.cmd install --frozen-lockfile`.
3. Run `pnpm.cmd verify` and review the native smoke test record.
4. Keep versions in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json` synchronized; update the lockfiles.
5. Run `pnpm.cmd release:candidate` and inspect the checksum-verified candidate.

Review the bundle identifier `com.projectaura.desktop` and publisher/product
metadata before the first public release. The identifier is provisional; once
shipped it affects app identity and local data paths and should remain stable.
The executable, installer and uninstaller use the Aura mark in
`src-tauri/icons/icon.ico`. Installer icon settings are explicit; the app's bundle
icon alone does not configure NSIS installer branding.

Tauri's Windows bundler may download NSIS/build tooling on the first run. The
configured Evergreen WebView2 bootstrapper downloads the runtime **only if needed
on the destination machine**. Product functionality itself is offline. A fully
offline installer would need a separately evaluated embedded/offline WebView2
installation mode and a larger package.

## Before a signed general release

- Code-sign and timestamp the executable and installer with a trusted Windows
  signing identity; never commit signing keys or secrets. An unsigned development
  beta can trigger SmartScreen; the approved early public beta discloses this.
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
  versions. The manual beta workflow retains these records with every installer.

MSI can be evaluated later if enterprise deployment requires it. This foundation
uses NSIS only, avoiding an unnecessary second installer path and MSI's additional
WiX/VBScript build considerations.

References: [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/),
[Windows signing](https://v2.tauri.app/distribute/sign/windows/).
