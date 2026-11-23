# Aura privacy policy

Last updated: 23 November 2026.

Aura is a Windows desktop widget application maintained by
[ujjwaluzu](https://github.com/ujjwaluzu). Aura does not operate a hosted
application backend, sell user data, or include an application telemetry service.

## Local information

Aura reads the Windows clock and system resource metrics to display its widgets.
Theme/layout choices and startup initialization are saved locally. Windows media
sessions provide track metadata, artwork, position and supported playback
controls. Browser volume commands act on the selected browser's Windows audio
sessions. Aura does not upload these local metrics or media-session metadata to
an Aura server.

## Connected services

GitHub connection is optional. Aura requests authorization through GitHub and
reads the account's contribution and work information. GitHub credentials and
cached account data are protected locally using Windows DPAPI. Connected data
can refresh periodically while Aura runs. Disconnect removes the corresponding
local credentials and cached data.

Current Aura builds use Windows media sessions for browser playback and do not
request Google authorization, read your YouTube library or use the YouTube Data
API. Aura receives only the media metadata and controls exposed by Windows.

Requests go directly from the user's computer to the relevant provider. Aura
opens the official player in the user's browser for audio playback; browser
sign-in, listening data, advertisements and subscriptions are handled by that
provider. Aura does not extract audio, collect browser cookies or receive user
passwords.

Provider policies apply to those connections:

- [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- [Google privacy policy](https://policies.google.com/privacy).
- [YouTube terms](https://www.youtube.com/t/terms).

## Controls and removal

Users can disconnect GitHub, close Aura, disable Windows startup in Settings >
General, and uninstall the application. Windows uninstall may retain app data
unless its removal option is selected. Windows and WebView2 have their own
platform/update behavior and privacy policies.

If you authorized Google in an older developer build, you can revoke that older
grant through [Google account permissions](https://security.google.com/settings/security/permissions).
Closing or uninstalling Aura alone does not revoke a previously granted account
permission. Current builds do not use those credentials.

## Questions

Contact the maintainer through the [project's GitHub page](https://github.com/ujjwaluzu/aura).
Do not post tokens, passwords or private account data in public issues.
