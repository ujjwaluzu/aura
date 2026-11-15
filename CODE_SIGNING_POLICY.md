# Code signing policy

## Current status

The maintainer reported submitting Aura's SignPath Foundation application on
15 November 2026. Review is pending. Current installers are
unsigned. SignPath has not approved this project or issued signing access, and no
current artifact should be represented as SignPath-signed.

If accepted, the signing credit will be: **Free code signing provided by
[SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org)**.

## Team and approval

- Committer: [ujjwaluzu](https://github.com/ujjwaluzu).
- Reviewer of changes from other contributors: [ujjwaluzu](https://github.com/ujjwaluzu).
- Release signing approver: [ujjwaluzu](https://github.com/ujjwaluzu).

Signing requests require explicit human approval. Automation may prepare and
submit requests after onboarding; it must not approve them. MFA must be enabled
for the maintainer's GitHub and SignPath accounts before signing is activated.
MFA status is not asserted by this document.

## Build and artifact policy

Sign only Aura-owned binaries built from the public
[Aura repository](https://github.com/ujjwaluzu/aura) on GitHub-hosted Windows
runners. The [Windows workflow](.github/workflows/windows.yml) uses locked
dependencies, runs verification, and can produce a candidate with hashes,
third-party notices and a native WebView test record. Local developer binaries
are not a substitute for a trusted CI origin.

Signing policy must restrict the repository, approved refs, product name `Aura`
and matching product/file versions. Release notes and checksums must identify the
exact signed output. Third-party executables must not be signed as Aura code.

NSIS is an executable container. Signing its outer EXE alone does not sign the
application and uninstaller inside it. The onboarding configuration must cover
the app, uninstaller and final installer in the correct packaging order, and the
installed signatures must be verified before a release is labelled signed.
That integration is pending SignPath approval and configuration.

## Privacy

Aura has no hosted application backend or telemetry service. Local preferences
and metrics stay on the device. When users enable integrations, Aura communicates
directly with GitHub and, in enabled builds, Google/YouTube. Connected services
may refresh while Aura is running. Credentials and cached account data use
Windows DPAPI protection. Disconnect removes the corresponding local account
data. The browser owns music playback and its separate sign-in.

See the [privacy policy](PRIVACY.md) for provider links and details.

## Installation and startup

The per-user installer needs no administrator privileges. Aura registers startup
for the current Windows user on first release launch; users can disable it in
Settings → General. This default is disclosed in the installer and release
documentation. Normal uninstall removes the startup entry. Updates preserve the
user's startup choice and saved preferences.

## SignPath onboarding

See [SignPath setup](docs/signpath.md). An application is a request for review,
not approval or a guarantee of free signing. The maintainer must review and
accept SignPath's terms and satisfy its account, release and reputation checks.
