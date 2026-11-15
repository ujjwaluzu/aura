# Aura privacy policy

Last updated: 15 November 2026.

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

In builds where YouTube account features are enabled, Aura uses YouTube API
Services, specifically YouTube Data API v3. Google authorization lets Aura read
your YouTube channel ID and title, owned playlists and their entries, liked
videos, and video metadata such as titles, uploader names and thumbnails.
Explicit user actions can search, change a video's like rating, create a private
playlist, rename an owned playlist, or add, remove and reorder its entries.
Those edits are sent to YouTube and remain on YouTube after disconnecting Aura.
Aura does not upload videos or delete channels or playlists.

Access and refresh tokens, the connected channel's ID/title and system playlist
IDs, and the OAuth client identity are saved locally using Windows DPAPI for
the current Windows user. This minimum connection record persists across
restarts until disconnected or invalid authorization is detected. Library/search
pages and API thumbnails are held in memory, rather than written to an Aura
server or persistent library database. Disconnect clears the local connection
record, interrupted credential saves and in-memory account content. Public
YouTube account features remain gated pending release/provider approval.

Aura uses Google data only to provide the account features the user chooses.
Aura does not sell it, use it for advertising, lend it to data brokers, or use it
to train AI models. The maintainer has no automatic remote access to local
Google data. Aura's use of data from Google APIs follows the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its Limited Use requirements.

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

Users can disconnect accounts, close Aura, disable Windows startup in Settings →
General, and uninstall the application. In Aura Music, Disconnect account deletes
local YouTube data and attempts to revoke Aura's Google authorization immediately.
If the device is offline or Google does not confirm revocation, local deletion
still occurs and Aura asks the user to remove access in Google's settings.
Revoking a Google grant removes permissions for clients in the same Google Cloud
project; it does not sign the user's browser out of YouTube.

Users can also revoke Aura directly through
[Google account permissions](https://security.google.com/settings/security/permissions).
While connected and running, Aura periodically rechecks authorization; a rejected
refresh or unauthorized API response clears the saved connection and account
content and requires reconnection. Closing or uninstalling Aura alone does not
revoke the Google grant. Windows uninstall may retain app data unless its removal
option is selected. Windows and WebView2 have their own platform/update behavior
and privacy policies.

## Questions

Contact the maintainer through the [project's GitHub page](https://github.com/ujjwaluzu/aura).
Do not post tokens, passwords or private account data in public issues.
