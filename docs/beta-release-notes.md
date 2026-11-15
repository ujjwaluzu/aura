# Aura 0.1.3-beta.1 — unsigned public beta

Aura's first public beta brings its desktop clock, CPU and RAM history,
GitHub Activity and Work views, Windows browser music controls, four animated
themes and six layouts to Windows x64. Settings are saved locally. The existing
application identity, preferences, startup settings and Aura icon are preserved.

## Installation

Download `Aura_0.1.3-beta.1_x64-setup.exe` from this release. This installer is
**unsigned**. Windows may display an unknown-publisher or SmartScreen warning;
review the source, notes and checksums before choosing to install. No security
settings need to be changed by Aura. Clean-Windows installation acceptance is
still pending; installation is not claimed to work on every Windows configuration.

The installer is per-user. It installs Microsoft's official Evergreen WebView2
Runtime only when needed, which can require internet access. Windows 11 is the
primary locally tested environment. Windows 10 clean-machine acceptance is pending.

On its first release launch Aura enables startup for the current Windows user.
Use **Settings → General → Start Aura with Windows** to disable it. Windows
Startup apps can override this registration. Existing startup choices are retained
when upgrading. Open Settings to choose a theme, layout and browser media session.

## Known limitations

- The installer and application are unsigned. Code signing remains separate work;
  no SignPath approval is claimed.
- Clean-Windows testing is pending, including clean install/uninstall, missing
  WebView2, offline install, non-admin and varied DPI/display configurations.
- Google sign-in and YouTube account/library features remain gated pending
  provider requirements. No Google approval is claimed. Windows browser media
  controls remain available; supported actions depend on the selected session.
- No per-widget drag/resize, notes or desktop-icon-layer integration.

## Verification and privacy

Release packaging requires the full repository suite and packaged native WebView2
integration test to pass. The evidence archive includes the exact executable,
manifest, dependency notices, lockfiles, source fingerprint and check reports.
`SHA256SUMS.txt` records the installer checksum; `release-manifest.json` records
its exact byte size and SHA-256. The publication workflow downloads the public
installer and checks its hash before deploying the website.

Aura has no hosted app backend or telemetry. Optional GitHub authorization uses
the Aura-owned client ID and keeps user credentials local under Windows DPAPI.
No personal credentials are packaged. Read the [privacy policy](https://ujjwaluzu.github.io/aura/privacy.html)
and [Music terms](https://ujjwaluzu.github.io/aura/music-terms.html).
Report problems through [GitHub issues](https://github.com/ujjwaluzu/aura/issues).
