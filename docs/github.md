# GitHub contributions

Aura's second widget page shows the signed-in GitHub.com account's past year of
contributions, including restricted counts that GitHub permits the user to see.
It requests `read:user offline_access`, never repository or write scopes, and
queries only `viewer.id`, `viewer.login`, the contribution period boundaries and
`contributionsCollection.contributionCalendar`.
Repository names, contents and contribution details are not requested.

## Register and configure

1. Create an **OAuth App** at <https://github.com/settings/applications/new>.
2. Use your Aura project URL for the homepage. For local development,
   `http://localhost` also works. A callback such as `http://127.0.0.1` is required
   by the registration form but is unused by device flow.
3. Enable **Device Flow** and leave expiring access tokens enabled.
4. Copy `.env.github.example` to `.env.github.local` and supply the public Client ID,
   or set `AURA_GITHUB_CLIENT_ID` in the build environment. Restart native development
   or rebuild the desktop package after changing the file. The Rust build reads the
   file; Vite never needs it. Runtime environment configuration is also supported.
5. On page two, choose **Connect GitHub**, copy the short code, open GitHub and approve.

No client secret, hosted server, personal access token or webhook is required.
The public Client ID is embedded in the native build. `.env.github.local` is ignored.

## Refresh and recovery

One Rust worker runs independently of the visible slide. It fetches immediately
after authorization and on startup, then every five minutes after a successful
fetch. Returning to a stale slide or choosing Refresh wakes the same worker.
Overlapping requests coalesce. The worker rechecks time after resume, retries
temporary failures with exponential backoff, and honors GitHub's retry deadlines.
Manual refresh cannot bypass those deadlines.

The last successful calendar remains visible with a Stale indicator after a
network failure. Failed, missing and partial API responses never become zero counts.
Revoked/expired authorization asks the user to reconnect. The account menu opens
GitHub's authorization management page or disconnects locally. Local disconnect
does not revoke authorization on GitHub; use **Manage GitHub authorization** for that.

GitHub decides which commits qualify and when counts change. Qualifying commits
can take up to 24 hours to appear; a successful push does not guarantee an instant
calendar update. Private counts depend on GitHub's visibility settings and access
rules, including organization restrictions.

## Storage and IPC

Access/refresh tokens and the account-bound calendar share a separate Windows
user-scoped DPAPI record, `github-account.bin`, in Aura's application config
directory. Writes replace an encrypted temporary file. The cache is bound to both
the OAuth client and GitHub's stable account ID. Refreshed tokens are saved before
the calendar request, so offline failures do not discard rotated credentials.
Disconnect invalidates outstanding work and removes both encrypted files.

Only credential-free state and the short user-facing verification code cross IPC.
Device codes, tokens, provider error bodies and request diagnostics never reach
React or logs. Native commands and events are restricted to `widget-host`.
Browser activation accepts a fixed destination enum, never an arbitrary URL.

## Validation

- `pnpm typecheck`, `pnpm test:e2e`, `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
- `pnpm desktop:build`

The Rust suite covers authorization timing, denial, timeout, cancellation during
HTTP, request coalescing, token rotation, encrypted persistence, offline restart,
rate limits, identity changes and cleanup. Browser fixtures verify zero-to-three
updates through native events and manual Refresh, day navigation across leap dates,
and 54 columns in all five themes. A live smoke test additionally requires the
registered OAuth app and the account owner's approval in their system browser.
Dates outside the returned contribution period are trimmed before rendering.
GitHub's year view can align to full weeks (for example, 53 weeks / 371 days);
Aura accepts up to 54 columns rather than assuming every response has 365 days.

For a task-owned native instance launched with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9228`, run
`node tools/github/native-smoke.mjs start`, approve the displayed short code in
GitHub, then run `node tools/github/native-smoke.mjs verify`. The helper prints
only public verification information and aggregate calendar metadata. Debugging
is enabled only for that test process, never in the packaged application defaults.

References: [device authorization and refresh](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps),
[contribution API](https://docs.github.com/en/graphql/reference/users#contributionscollection),
[GitHub update delays](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions).
