# Aura Music: official YouTube account integration

Aura uses **YouTube Data API v3** for account features and the official YouTube
Music website for playback. Account traffic runs in Rust. No Python, sidecar,
browser cookies, extracted audio, embedded player or borrowed OAuth client is
used. Spotify remains a separate milestone.

## Features and limits

- **Search:** Music-category videos by default, with an All videos selector.
  Requests run on explicit Search submission or Load more, without typeahead.
- **Your Playlists:** owned YouTube playlists, private playlist creation, rename,
  add/remove entries and move entries up/down. Playlist deletion is deferred.
- **Liked Videos:** API-accessible liked videos, including non-music videos.
  Google's current endpoint exposes at most the most recent 1,000 items.
- **Playback:** Play opens YouTube Music. A separate Open on YouTube action
  supports content Music cannot play; Aura never switches players automatically.
  The browser owns audio, queue progression, ads and subscription restrictions.
- **Windows controls:** explicitly selected sessions, event-driven metadata,
  position snapshots, bounded artwork and only the supported transport controls.

This does not expose the complete YouTube Music library: albums, recommendations
and saved third-party playlists are outside this milestone. Uploader names are
channel metadata, not asserted musical artist identities. Google sign-in in the
browser and Aura authorization remain separate; choose the same account/channel.

Browser volume follows the selected Brave, Chrome, Edge or Firefox player and
controls that browser's Windows audio sessions. If audio starts late, changes
output devices or recreates its process, Aura rescans and recovers automatically.
Read retries back off to 30 seconds and pause while hidden; unsupported players do
not poll indefinitely. Volume requests include the selected session ID so a stale
request cannot adjust a different player. Failed writes recover by reading the
actual volume, rather than replaying an old slider adjustment.

## Developer setup

Reuse the existing Aura-owned **Desktop app OAuth client**. Keep these settings in
the ignored `.env.music.local` file, using `.env.music.example` as the template:

```dotenv
AURA_MUSIC_CLIENT_ID=your-desktop-client-id.apps.googleusercontent.com
AURA_MUSIC_CLIENT_SECRET=your-desktop-client-secret
```

Ordinary users provide no developer credentials or API key. Never use `VITE_`
variables, commit the local file or put access/refresh tokens in commands,
screenshots, preferences or logs. Google considers desktop clients public clients;
the shipped client identity is distinct from protected user tokens.

In Aura's Google Cloud project, enable **YouTube Data API v3**, configure Google
Auth Platform branding/support contacts and External/Testing audience, add the
test account, and request `https://www.googleapis.com/auth/youtube` for playlist
and rating edits. Use a Desktop client, not a TV, web or service account.

Run `pnpm.cmd music:validate`; Python/helper preparation is no longer required.
Restart this command after changing developer settings. Open **Connect YouTube**
in the widget, then authorize in Aura Music's system browser. Connection succeeds
only after the official `channels.list(mine=true)` verifies a single channel.
Accounts without a channel must create/select one on YouTube and reconnect; Aura
does not create channels or silently select ambiguous channel results.

System-browser authorization retains S256 PKCE, state validation and a temporary
loopback callback. Attempts expire after three minutes and can be cancelled.
Windows `ShellExecuteExW` activates the default browser in an STA apartment and
reports activation failures instead of claiming Explorer-process success.

## Native boundary and persistence

Only the local widget host and Music window have typed music commands. Settings
retains narrow preference permissions; React receives no tokens or general HTTP,
filesystem or shell access. Account and Windows playback state remain independent.

Rust calls fixed `www.googleapis.com/youtube/v3` routes with bounded responses,
deadlines, no redirects and no automatic retries. Structured errors retain safe
`httpStatus` and `providerReason` values. Raw Google messages, response bodies,
headers and parameters are not exposed. API disabled, quota, permission and
session errors have separate messages; HTTP 403 does not automatically mean the
user needs to log in again.

Results use native provider cursors with 25 items per request. Load more appends
instead of refetching growing windows. Video results are deduplicated by video
ID; playlist entries retain unique occurrence IDs, preserving duplicate videos.
Queries/pages reset after searches, filter changes, mutations, explicit reloads,
disconnect and account changes. No whole-library/background prefetch occurs.

Native ownership is checked again before playlist writes. System playlists are
read-only. Rename preserves description/default language and excludes privacy
changes. Reorder reads the current entry/position and updates only its snippet;
manual-sort restrictions are surfaced for resolution on YouTube. Unavailable
entries can be removed by playlist-item ID without playable video metadata.
Writes run once; uncertain writes require an explicit reload before further edits.
Success requires the documented provider response, including HTTP 204 for rating
and removal operations.

Windows DPAPI encrypts a version-2 `youtubeDataApi` credential record for the
current user, including verified channel and client identity. Legacy unversioned
credentials are cleared and require reconnection. Changed clients/channels cannot
silently become verified accounts. Disconnect clears credentials, interrupted
encrypted saves and UI account data, leaving browser sign-in/playback untouched.

Artwork remains native HTTPS to fixed Google/YouTube raster hosts without
redirects, bounded to 1 MiB. Visible artwork uses at most three concurrent requests
and a 64-image memory cache, cleared on disconnect. Windows session artwork is
separately bounded and session listeners are stopped when Aura exits.

## Validation and public release

The `music-validation` feature permits testing only in debug builds. Public
account enablement requires a configured Aura client and all reviewed flags in
`src-tauri/music-release-gate.json`:

- `youtubeDataApiValidated`: real channel/playlists/likes/search, explicit
  disposable-playlist/rating edits, restart/refresh and disconnect all pass.
- `publicDistributionApproved`: applicable OAuth verification, privacy/branding
  and adequate project quota are complete.
- `windowsReleaseValidated`: installer/upgrade acceptance on clean Windows without
  Python, Chrome/Edge sessions and resource measurements pass.

Mocked tests or developer test access do not satisfy public enablement. Follow
[Google OAuth verification](https://support.google.com/cloud/answer/13463073) and
[quota/audit requirements](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
Inspect the project's actual quota allocation before release; search is shared
across users of the project and is not unlimited.

`pnpm.cmd desktop:build` creates the native NSIS installer. The previous
`desktop:music:build` command is an alias for the same build. The former helper,
its dependencies/tests and the sidecar bundle overlay are retired.
After release prerequisites are approved, release CI must supply the same two
client settings as build-process environment variables. The standard build does
not load the local developer file or enable the debug validation feature.

Manual acceptance uses a disposable private playlist. Explicitly click create,
rename, add two entries (including a duplicate), move up/down and remove; verify
each result on YouTube. Test like/unlike, unavailable-entry removal, expired or
revoked consent, offline/quota errors, restart and disconnect. Leave playlist
deletion to manual cleanup on YouTube. Verify both player destinations in Chrome
and Edge, multiple sessions, closing Music without stopping audio and host quit.

## Verification record

On 2026-11-13 the retired unofficial integration completed Google authorization
but failed its account HTTP request. Its diagnostics did not retain the exact
status; that attempt did not establish an official API failure or satisfy any
release gate. No cookies or another application's credentials were substituted.

The native official API connection **verified the actual channel, loaded 11 owned
playlists and the first 25 liked videos with a continuation**, and searched for
music. Explicit developer acceptance actions created a private disposable playlist,
renamed it, added/removed entries, moved entries up/down and independently reordered
duplicate occurrences. Like/unlike passed and the original rating was restored.
Google required `Content-Length: 0` for the bodyless rating POST; the native
transport now supplies it and has a regression test.

The disposable playlist `Aura API validation 2026-11-13 07-40 verified` was left
**empty** for manual deletion on YouTube. Existing playlists were not edited.
The refreshed token verified the same channel, a full process restart restored
the saved connection, and Disconnect removed the encrypted credentials and UI
account data. A second restart remained disconnected. The browser remains signed
in; reconnect Aura with `pnpm.cmd music:validate` when needed.

Verification passed: 29 Rust tests, one separately enabled real-account refresh
test, 27 browser tests, and the release executable's native WebView integration
test. TypeScript, ESLint, Prettier, Rust formatting and Clippy passed. The native
test includes Settings capability isolation, Music reuse/close, supported-session
errors, all twelve arrangements and host-owned shutdown. Tests also cover
ownership, metadata preservation, duplicate/unavailable entries, provider cursors,
failed writes and no automatic retry.

The NSIS installer built without a sidecar (1,962,132 bytes / 1.87 MiB, compared
with the earlier 10.08 MiB helper build). This machine has developer tools; it
does not substitute for clean Windows install/upgrade/uninstall testing. Actual
Chrome/Edge playback, multiple live sessions, free/Premium behavior, unavailable
content and resource budgets still need acceptance. Public OAuth verification,
project quota review and those Windows checks keep the public gate closed.

Official references: [owned playlists](https://developers.google.com/youtube/v3/docs/playlists/list),
[liked videos](https://developers.google.com/youtube/v3/docs/videos/list),
[ratings](https://developers.google.com/youtube/v3/docs/videos/rate),
[rename updates](https://developers.google.com/youtube/v3/docs/playlists/update),
[playlist entry positions](https://developers.google.com/youtube/v3/docs/playlistItems/update).
