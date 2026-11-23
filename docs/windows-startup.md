# Windows startup

Aura enables startup for the current Windows user on the first normal release
launch. Downloading the installer does not register anything. After installation,
launch Aura once; **Settings → General → Start Aura with Windows** controls the
registration. Aura opens its normal visible widget with the saved theme and layout.
Closing the widget exits Aura normally; the next sign-in opens it again if enabled.
Windows **Settings → Apps → Startup** can override the registration.

The independent `startup-initialized-v1` file in Aura's app configuration directory
records that the default was attempted, even if Windows rejected it. It is created
and flushed before registering startup. Later launches and upgrades never restore
a removed registration. Theme/layout preferences keep their existing file and
schema. A failed first attempt can be retried explicitly with the switch.

The official Tauri autostart plugin is pinned to 2.5.1 because the 2.7 backend
defaults to trying system-wide registration. The 2.5.1 backend writes only HKCU.
Aura normalizes its own `Aura` Run value to a quoted executable path after plugin
registration because the upstream backend leaves paths unquoted. Readback checks
the current-user Run value independently of Windows' StartupApproved override.
Failed changes are reported as errors; the switch waits for confirmation.

Only Settings may call `get_startup_status` and `set_startup_enabled`, enforced
by capabilities and native label checks. No raw autostart plugin commands are
exposed. General reads status every time it opens, disables its switch during
requests, announces errors, and offers a status refresh. Frontend preview, debug
builds and explicit isolated profiles cannot change startup or create its marker.

The official single-instance plugin is the first production plugin. Repeated
launches restore and focus the existing widget. Development and isolated profiles
skip the production instance lock. Isolation is validated before plugin setup;
invalid test arguments cannot fall back to production.

The existing NSIS uninstaller deletes the `Aura` HKCU Run value on uninstall.
Its `/UPDATE` path preserves that value. Uninstall retains the startup marker
unless the user also deletes app data, so reinstalling with retained app data
preserves a previously removed registration.

## Verification

Run `pnpm.cmd verify`, `pnpm.cmd desktop:build` and
`pnpm.cmd test:native:isolated`. Rust tests cover initialization, retained choices,
external removal, failed saves/registration/readback, quoted paths and development
isolation. Browser tests cover keyboard operation, pending states, read/write
failures, refresh and preview. The packaged isolated test checks native permissions
and compares real Windows startup values before and after the run.

Use a disposable Windows account or VM for installer lifecycle acceptance so the
test does not replace an existing Aura installation:

1. Start without Aura app data or an `Aura` value under
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Install the rebuilt
   NSIS package to a path containing spaces without launching Aura. Confirm no
   startup entry was created by installation alone.
2. Launch installed Aura. Confirm one widget, the initialization marker, a quoted
   Run value pointing to the installed executable, and an enabled General switch.
3. Disable startup, quit and relaunch. Confirm it stays disabled. Re-enable and
   repeat; it should stay enabled. Confirm saved theme and layout survive.
4. Minimize the widget and launch Aura repeatedly. Confirm the original widget is
   restored, with one host process/window.
5. Upgrade using the updater/installer's `/UPDATE` mode with startup enabled, then
   with it disabled. Confirm both choices, marker and preferences survive.
6. With Aura closed, remove its Run value externally. Relaunch; confirm it is not
   restored. Explicitly re-enable, quit, and uninstall normally. Confirm the Run
   value has been removed.
7. Reinstall and enable startup. Sign out and back in (or restart), then confirm
   one visible widget opens with the saved theme/layout. Quit normally and confirm
   no Aura background process remains. This requires the user's participation;
   do not interrupt their active Windows session.

See the [release verification record](windows-release-candidate-verification.md)
for executed checks and remaining platform acceptance.

## Recover a hidden widget

Click the Aura notification-area icon to show and restore the widget. Its menu
also offers **Show Aura**, **Reset widget position** (for display changes or an
off-screen window), and **Quit Aura**. Reopening the installed app restores the
same production instance. Minimizing remains intentional; Aura does not steal
focus on a timer. The Pin control keeps it above other windows when desired.

Tray restoration covers hidden/minimized windows independently of the WebView
and settings UI. It cannot recover a renderer terminated by another application.

### OMEN Gaming Hub starts when Aura opens

On the affected HP computer, OMEN Gaming Hub had classified Aura as a game.
Its optimizer log recorded `AutoBoostNow BOOST_MYGAME app - Aura`, with
`msedgewebview2`, Edge and WhatsApp in its process optimization list. WebView2
renders Aura's interface: interfering with it can leave the native Aura process
running with an unresponsive window. OMEN's restore operation also relaunched
other optimized apps, explaining the accompanying Edge/WhatsApp windows.

Turn off OMEN's **Boost all** setting in its game/Booster controls, then quit and
reopen Aura after the current boost finishes restoring. The exact control location
depends on the installed OMEN version. If enabling automatic game boosting later,
first remove Aura from OMEN's game list or exclude it from boosting. The older
`AutoBoost` preference alone was insufficient on the tested OMEN version:
`BoostAll` was enabled independently. Renaming Aura's executable also failed
because OMEN still recognized the saved game entry.

The local fix disables automatic boosting for all games; manual boosting remains
available. Aura does not change OMEN preferences at application startup. See the
[OMEN verification record](omen-booster-acceptance.json) for the follow-up test.
