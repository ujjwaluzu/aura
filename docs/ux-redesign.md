# Aura UX redesign verification

The desktop widget stays 760 × 264 logical pixels. Settings owns Theme, Layout,
and the Music sections Player, Search, Playlists, and Liked videos. The five themes and preference schema are unchanged. Layouts are limited to
four Clock arrangements and two Music focus arrangements. Retired System usage
and Music arrangements load as Clock layouts while preserving the saved theme.

Settings starts at 960 × 720 with a 720 × 560 minimum. Rust reduces these limits
when the current monitor's work area is smaller. `open_settings` accepts an
optional destination: `theme`, `layout`, `music-player`, `music-search`,
`music-playlists`, or `music-liked`. New windows receive it in their URL; existing
windows receive `aura://settings-navigate`. With no destination, the open window
keeps its current section. `open_music` is a compatibility alias for
`music-playlists`. There is no separate music window or capability.

Each window has one MusicProvider. Account requests, playback requests, and their
failures are independent. A failed account request leaves availability unknown.
Authorization cancellation invalidates late responses. Playback selection lives
in the native media service, so closing Settings leaves it running. If the
selected native session disappears, Aura asks the user to choose again rather
than guessing another session from its source app. Track changes clear cached
artwork, and thumbnail reads recheck metadata before installing their result.

Clock layouts use a horizontal music card; Music focus layouts give the player
more room. These share the
player presentation with static layout previews. Volume is visible between the
transport controls and More in every widget presentation, with a 28 px slider
hit area, keyboard control, and inline recovery when volume is unavailable. More contains volume, a library link, and an in-card player chooser. Its overlay stays inside the card, supports Escape,
outside dismissal and Tab navigation, and restores focus. Account setup remains
in Settings. Diagnostic copying includes capability flags and error codes, and
excludes account identifiers, raw error messages, artwork, and credentials. Only
error codes and timestamps are shared across windows for one hour, so Settings
can show a widget failure even when it opens later.

Search, playlist drill-down, and result page positions are retained while switching
sections or Settings tabs. Writes show success only after native confirmation;
an uncertain write requires an explicit reload. Provider authorization, release
gates, and official-player restrictions are unchanged.

## Executed on Windows, 13 November 2026

- TypeScript, ESLint, Prettier and Rust formatting checks passed.
- Frontend production build and the Windows NSIS package build passed.
- All 81 Chromium browser tests passed. They cover all 30 theme/layout combinations twice, with loaded and
  missing artwork, long titles, essential control bounds, 28 px compact targets,
  and absence of widget scrollbars. Screenshots of the retained presentations, More,
  Theme, Layout, and the account screen were inspected.
- Browser flows cover account loading/failure, independent playback failure,
  disconnected/expired/unavailable accounts, authorization cancellation, offline
  and empty libraries, multiple sessions, unsupported transport controls, failed
  volume recovery, uncertain writes, search/navigation retention, keyboard sliders,
  overlay focus, metadata changes, reduced motion, and sanitized diagnostic copying.
- Native unit tests passed: 32 passed, one opt-in live-account test ignored. They cover destination serialization, rejection of retired window
  labels, existing preference compatibility, OAuth cancellation, provider writes,
  and account availability for the actual build gate.
- The availability unit test also passed with `music-validation` and the local
  developer client configuration. It uses an empty temporary credential location;
  it does not authorize, refresh, or modify a real account.
- The packaged executable launched and remained responsive in a startup smoke
  check. This does not validate interactive Rust IPC or installer installation.

## Direct widget playback follow-up

Once the account is connected, the widget displays its playback card instead of
an Open Music button. A sole reported Windows player supplies real track metadata
and capabilities immediately. Loading volume binds that sole session; transport,
seek, and volume commands use the selected player. Multiple sessions are chosen inside the
card. Aura keeps an explicit selection and asks again if the selected player
closes. It does not infer a YouTube provider from a browser's app name.

With no session, Play opens the official YouTube Music player; previous, next,
and seeking stay disabled until a player is available. Account authorization does
not itself start browser playback. The official player and release gates remain
in place. The follow-up browser checks cover direct selection, failed binding,
transport, seek, volume, and ready/picker bounds across all 30 theme/layout pairs.

## Fixed viewports without scrolling

The widget and Settings both stay within their window. The widget follows the
actual client height, including a one-pixel display rounding difference. Long
native errors remain in a bounded banner with the full message in its tooltip.

Theme and all six Layout choices fit at the minimum 720 x 560 Settings size.
Player and account controls share the available space. Library result pages adapt
to the window height; Previous and Next reach all loaded items without extra API
requests. Load more still fetches the provider's next batch. Result page positions
and search text survive switching sections.

Playlist renaming and adding videos use fixed panels with Escape, keyboard focus
containment and focus restoration. Diagnostics use text pages and keep the same
credential-free copy action. Checks cover minimum and initial window sizes,
account states, every item in a 50-video fixture, wheel and PageDown input, and
visible control bounds. No app pane uses a scrolling container.

## Widget pages

Previous and Next sit below the clock. The first page uses the saved layout;
Next opens a second page with the clock fixed on the left and a Connect GitHub
button on the right. Previous restores the selected arrangement. The theme and
saved layout are not changed by page navigation, and keyboard focus moves to the
enabled navigation button after switching pages.

Connect GitHub is a placeholder and reports that connection is coming soon. It
does not authorize an account or call a GitHub service. Both pages were checked
across all five themes and six layouts for navigation bounds and no scrolling.

## Required before release

The updated `tests/native.spec.ts` verifies real Settings command permissions,
account status, session selection, native playback events, typed navigation,
window reuse, preference delivery, and playback persistence after Settings closes.
It has not been run for this redesign. Automatic approval review rejected launching
Aura with a remote-debugging endpoint, reporting “blocked by policy.” Browser
mocks and Rust unit tests do not substitute for that integration check.

On an authorized test desktop, run the native suite against a task-owned regular
Aura instance using `AURA_NATIVE_CDP`, then repeat against the configured validation
instance with `AURA_EXPECT_VALIDATION=1`. The harness restores preferences and the
selected session; it does not initiate authorization or modify a real library.

Real Chrome/Edge playback, next/previous session continuity, late artwork under
live playback, seek, browser volume, physical dragging, Windows scaling at 100%,
125%, and 150%, screen-reader behavior, mixed monitor bounds, and clean-machine
installer upgrade/install/uninstall still require manual acceptance. A new real
account authorization and disposable-playlist write check is also outstanding.
No public release gate was opened by this redesign.
