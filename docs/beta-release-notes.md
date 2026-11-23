# Aura 0.1.3-beta.2 — unsigned public beta

This update adds a native notification-area icon: click it to restore Aura, or
use its menu to show the widget, reset its position after a display change, or
quit. Reopening Aura also restores the running instance. A follow-up investigation
on the affected HP computer traced the unrecoverable window to OMEN Gaming Hub
automatically boosting Aura and interfering with WebView2. Disable OMEN's
**Boost all** setting and reopen Aura after the boost restores. See
[Windows troubleshooting](windows-startup.md#omen-gaming-hub-starts-when-aura-opens).

Music now uses Windows browser media sessions without Google authorization or
YouTube account screens. A failed Windows media-manager initialization can be
retried. The website serves assets from the custom domain root and enforces HTTPS.

## Installation

Download `Aura_0.1.3-beta.2_x64-setup.exe` from this release. This installer is
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
- Google authorization and YouTube library operations are not available.
  Browser controls depend on the selected Windows media session.
- No per-widget drag/resize, notes or desktop-icon-layer integration.
- If a browser is closed beyond the short reconnect window, select its reopened
  media session again in Aura.

## Verification and privacy

Release packaging requires the full repository suite and packaged native WebView2
integration test to pass. The evidence archive includes the exact executable,
manifest, dependency notices, lockfiles, source fingerprint and check reports.
`SHA256SUMS.txt` records the installer checksum; `release-manifest.json` records
its exact byte size and SHA-256. The publication workflow downloads the public
installer and checks its hash before deploying the website.

Aura has no hosted app backend or telemetry. Optional GitHub authorization uses
the Aura-owned client ID and keeps user credentials local under Windows DPAPI.
No personal credentials are packaged. Read the [privacy policy](https://aura.sanoraworks.com/privacy.html)
and [Music terms](https://aura.sanoraworks.com/music-terms.html).
Report problems through [GitHub issues](https://github.com/ujjwaluzu/aura/issues).
