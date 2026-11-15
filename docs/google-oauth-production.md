# Google OAuth production preparation

Windows code signing and Google's OAuth review are separate. Aura can prepare and
submit Google verification while SignPath reviews its signing application.
Neither approval substitutes for the other, and neither is claimed here.

## Current status

Prepared in source on 15 November 2026:

- System-browser Desktop authorization with S256 PKCE, random state, a temporary
  loopback listener, cancellation and a three-minute timeout.
- In-app privacy policy and Music terms, with explicit acceptance before Google
  authorization. The native command rejects missing/outdated policy versions.
- Tokens stay in Rust and Windows DPAPI, outside React and diagnostics.
- Disconnect deletes local account data and requests Google token revocation.
  Offline/failed revocation is disclosed with a Google account permissions action.
- Rejected refreshes and unauthorized API responses clear saved account data.
  Connected windows check status each minute; native authorization is rechecked
  at most every thirty minutes while Aura runs, and on process restart.
- Requested scope: `https://www.googleapis.com/auth/youtube.force-ssl`.

Historical live acceptance used the broader `youtube` scope. Repeat acceptance
under the current scope, including real server-confirmed revocation. Existing
grants can retain old permissions: remove Aura in Google account permissions
before recording a fresh consent demonstration.

Still pending: a verified website domain, hosted homepage/privacy/terms, actual
Cloud project settings, support contacts, quota review, a demonstration video,
Google review, production-client live acceptance and clean Windows checks.
No Cloud Console settings were changed by this preparation. Public account
release gates remain closed.

Local verification for this preparation passed: 87 Rust tests (3 explicitly
ignored live probes), 83 music/viewport/production browser tests, TypeScript,
ESLint, Clippy, formatting, the Windows installer build and the packaged native
WebView integration test. These results do not replace live Google acceptance
under the new scope or provider review. The earlier hosted candidate run failed
to expose its native smoke-test endpoint after building; hosted installer
acceptance remains unresolved.

## Website and domain

The maintainer has no domain selected yet. Google needs a public application
homepage and ownership verification of domains used in OAuth branding. A
repository URL on `github.com` does not establish ownership of that domain.
Do not assume a free hosted subdomain satisfies review: first establish that
Google accepts its ownership verification.

The homepage should identify Aura, explain its desktop widgets and optional
YouTube playlist/likes features, and visibly link to privacy, terms and support.
Use the current Aura name/icon. Host [PRIVACY.md](../PRIVACY.md) and
[MUSIC_TERMS.md](../MUSIC_TERMS.md) without requiring sign-in. Do not claim that
Aura is a Google product or provides the full YouTube Music library or audio
streaming itself.

Verify the domain in Search Console using an account associated with the Cloud
project, then configure Authorized domains. The desktop callback remains
`http://127.0.0.1:PORT/oauth/callback`; it is not the public homepage and needs no
hosted callback server.

## Google Cloud Console

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) in the
Aura-owned project. Confirm the intended production project: Google recommends
separate testing/production projects. A working developer client is not evidence
of production approval.

| Console area              | Setting/evidence                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| APIs & Services → Library | YouTube Data API v3 enabled                                                                |
| Branding                  | Aura name/icon; monitored support email and developer contact                              |
| Branding → App domain     | Public homepage, privacy and Music terms URLs on verified domains                          |
| Audience                  | External; authorized test accounts while acceptance/review is pending                      |
| Data Access               | The one scope `https://www.googleapis.com/auth/youtube.force-ssl`                          |
| Clients                   | Aura-owned Desktop app OAuth client; no TV, web or service-account substitution            |
| Verification Center       | Branding/sensitive-scope justification, demo and answers to Google's questions             |
| YouTube Data API → Quotas | Record actual allocation, usage and expected demand; request an audited increase if needed |

Follow the Console's submission/publishing sequence. In production is not proof
of brand or sensitive-scope approval and must not alone enable Aura's public gate.
Do not invent production URLs, quota allocations, approval dates or status.
Confirm which support email may be displayed publicly before entering it.

## Permission justification to adapt

> Aura is an independent Windows desktop application. Its optional YouTube
> account features let users browse their connected channel's owned playlists
> and liked videos, search videos, create private playlists, rename owned
> playlists, add/remove/reorder entries, and set or remove video likes. Users
> explicitly initiate each edit. The `youtube.force-ssl` scope supports these
> content and playlist endpoints; read-only access cannot authorize the edits.
> Aura requests no account-management, upload, partner, Analytics, Gmail, profile
> or email scopes. Google's consent label covers more operations than Aura
> implements: Aura does not upload/delete videos, modify comments/captions or
> delete channels or playlists. Tokens and minimal channel identity are encrypted
> locally with Windows DPAPI. Aura has no hosted application backend. Users can
> disconnect and revoke the grant; audio plays through the official website in
> the user's separate browser session.

The API lists this scope for [playlist creation](https://developers.google.com/youtube/v3/docs/playlists/insert),
[playlist edits](https://developers.google.com/youtube/v3/docs/playlistItems/update)
and [rating changes](https://developers.google.com/youtube/v3/docs/videos/rate).
It remains sensitive. Its consent label includes deletion permissions; never
describe it as read-only or limited by Google to playlists alone.

## Demonstration and live acceptance

Use the intended production client with an authorized test account. Configure
`.env.music.local` and run `pnpm.cmd music:validate`. Keep tokens, client secrets,
token HTTP traffic and DPAPI plaintext out of the video. The client ID on Google's
own consent page identifies the app and is not a user token.

1. Show the public homepage with linked privacy and terms.
2. In Aura Music, show policy acceptance and system-browser authorization with
   the address bar, app name and requested permission visible.
3. Show the verified channel, playlists, liked videos and explicit search.
   Explain that the browser's playback sign-in is separate.
4. With an explicitly authorized disposable playlist, show creation, rename,
   adding a duplicate, reordering and removal. Demonstrate an authorized rating
   change and restore the original rating.
5. Restart Aura and confirm refresh. Disconnect and verify both local deletion
   and removal of the grant in Google account permissions.
6. Reconnect, revoke through Google and verify cleanup on the next authorization
   check. Separately cover denial, cancellation, offline revocation and quota errors.

Provide an accessible demo link. Record actual results; mocks cannot establish
Google approval or live revocation. See [API acceptance](youtube-music.md).

## Build after approval

Supply the approved Desktop client's `AURA_MUSIC_CLIENT_ID` and
`AURA_MUSIC_CLIENT_SECRET` as native build environment variables using CI secret
storage. Do not commit them or use `VITE_` variables. A shipped Desktop client
secret cannot be confidential; user tokens are separate and remain protected.
The standard release build does not read the local music developer file.

Review each flag in `src-tauri/music-release-gate.json` against its own evidence.
Keep debug validation out of public builds. Google approves account access;
SignPath signs Windows binaries. Verify the final installed signatures before
describing a release as signed.

## Official references

- [Production policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).
- [Brand/domain verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
- [Sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
- [Desktop authorization/revocation](https://developers.google.com/identity/protocols/oauth2/native-app).
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies).
- [YouTube quota/compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
