# GitHub contributions

Aura uses one GitHub.com connection for Activity and Work. Disconnected hosts have
Widgets and Connect GitHub pages; connected hosts have Widgets, Activity and Work
in the same 760 x 264 window. Activity shows the past-year calendar and summary.
Work has Reviews, My PRs, Failing PRs and assigned Issues, including accessible
public and private repositories, with three results per page and browser actions.

The single device flow requests `read:user repo offline_access` from the existing
OAuth app. **GitHub's `repo` scope includes write access. Aura only issues read
queries**: no review submission, merging, issue editing or workflow reruns.
Existing Activity connections remain usable; Work offers **Update GitHub permissions**.
Canceling or denying an upgrade preserves the previous connection and calendar.
Credentials are replaced only after successful authorization and viewer verification.

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

One Rust worker runs independently of the visible page. Activity and each Work
category have independent schedules and error states. It fetches immediately
after authorization and on startup, then every five minutes after a successful
fetch. Returning to a stale slide or choosing Refresh wakes the same worker.
Overlapping requests coalesce. The worker rechecks time after resume, retries
temporary failures with exponential backoff, and honors GitHub's retry deadlines.
Manual refresh cannot bypass those deadlines.

The last successful calendar and Work results remain visible with Stale indicators after a
network failure. Failed, missing and partial API responses never become zero counts.
Revoked/expired authorization asks the user to reconnect. The account menu opens
GitHub's authorization management page or disconnects locally. Local disconnect
does not revoke authorization on GitHub; use **Manage GitHub authorization** for that.

GitHub decides which commits qualify and when counts change. Qualifying commits
can take up to 24 hours to appear; a successful push does not guarantee an instant
calendar update. Private counts depend on GitHub's visibility settings and access
rules, including organization restrictions.

## Work search and paging

All four categories use GraphQL issue/PR search with `is:open archived:false`.
Reviews use `review-requested:<login>`; My PRs use `author:<login>`; Failing PRs
add `status:failure`; Issues use `assignee:<login>`. Reviews and Issues sort by
oldest update, and authored PRs sort newest first. Each search fetches 30 records,
then more cursor pages on demand; UI pages show three cached records. Refresh
replaces a category's initial page. Counts represent PRs/issues, never failed jobs
or historical workflow runs. PR rows include draft/review state and the current
head commit's check rollup. Missing checks display as unknown.

GitHub search exposes at most 1,000 results. Limited/incomplete results show a
coverage indicator and **View all on GitHub**; that action is always available
because search indexing, account access and organization restrictions affect coverage.
Errors and missing permissions never become zero counts. Shared rate-limit
cooldowns cannot be bypassed by either page. A Work failure does not stop Activity
refreshing, and an Activity network failure does not stop Work refreshing.

## Storage and IPC

Access/refresh tokens, granted scopes, verified identity, calendar and private Work
metadata share a separate Windows
user-scoped DPAPI record, `github-account.bin`, in Aura's application config
directory. Writes replace an encrypted temporary file. The cache is bound to both
the OAuth client and GitHub's stable account ID. Refreshed tokens are saved before
the calendar request, so offline failures do not discard rotated credentials.
Disconnect invalidates outstanding work and removes both encrypted files.

Only credential-free state and the short user-facing verification code cross IPC.
Device codes, tokens, provider error bodies and request diagnostics never reach
React or logs. Native commands and events are restricted to `widget-host`.
Browser activation accepts a fixed destination enum or an item ID from the native
cache. Native code validates repository identifiers and constructs GitHub URLs;
React cannot supply an arbitrary URL. Failing PRs open `/checks`. Version-one
encrypted records migrate without discarding credentials or their calendar.
Switching accounts clears previous account caches; disconnect removes both pages' data.

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

Scope details: [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
Search details: [issue and PR qualifiers](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests).
