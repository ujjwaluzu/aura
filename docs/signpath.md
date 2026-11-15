# SignPath Foundation preparation

Aura's maintainer selected the MIT licence for the project. The licence is in
[LICENSE](../LICENSE), and the public [Code signing policy](../CODE_SIGNING_POLICY.md)
records the maintainer, approval rules and privacy behavior. No SignPath approval
or signed release is claimed.

## Application

Use the [official application](https://signpath.org/apply) and review the
[Foundation conditions](https://signpath.org/terms).

- Project: Aura.
- Repository/homepage: <https://github.com/ujjwaluzu/aura>.
- Maintainer and signing approver: `ujjwaluzu`.
- Licence: MIT.
- Platform/artifacts: Windows x64 Tauri application, per-user NSIS installer and
  uninstaller.
- Build workflow: <https://github.com/ujjwaluzu/aura/actions/workflows/windows.yml>.
- Signing policy: <https://github.com/ujjwaluzu/aura/blob/main/CODE_SIGNING_POLICY.md>.
- Privacy: <https://github.com/ujjwaluzu/aura/blob/main/PRIVACY.md>.

The maintainer's supplied application email is kept in a local application packet
under ignored `artifacts/signpath/`; it is not added to this public document.

At preparation time, the repository is new and has no published GitHub release;
the existing candidate is a draft. SignPath requires a released, documented
project and evaluates verifiable reputation. A private draft or a local installer
must not be described as a public release. Application acceptance is discretionary.
If SignPath requires an initial public preview, the maintainer must settle that
release step before asserting that the released-project condition is met.

## Account steps for the maintainer

1. The maintainer confirmed GitHub MFA is already enabled on 15 November 2026.
   The API did not independently disclose that state. Keep MFA enabled.
2. Review the application packet and submit the official form. Complete any
   email verification/account setup and SignPath MFA personally.
3. Review and accept the Foundation terms. Only the maintainer can confirm the
   project's representations and agree to the provider's conditions.
4. Wait for Foundation review. Free signing is not automatic, and approval cannot
   be produced by a code change in this repository.

## CI integration after acceptance

Use [SignPath's GitHub trusted-build integration](https://docs.signpath.io/trusted-build-systems/github).
Its GitHub App must be authorized for this repository, and the GitHub.com trusted
build system must be linked to the approved SignPath project. All jobs leading to
OSS signing must run on GitHub-hosted runners. Upload the artifact to GitHub
Actions before submitting its artifact ID for signing.

Configure the organization ID, project slug, artifact configuration and signing
policy supplied during onboarding. Store the API token as a GitHub Actions secret;
never commit it or put it in application logs. A human release approver must
approve each signing request.

The existing Windows workflow's manual `build_candidate` input prepares a
verified unsigned sample with notices and hashes. Signing is not enabled without
provider settings. Confirm the Tauri/NSIS packaging approach with SignPath: the
public format reference does not document NSIS deep-signing support. Signing the
outer setup EXE must not be mistaken for signing the installed application.
Use the [artifact configuration documentation](https://docs.signpath.io/artifact-configuration/)
to cover all Aura-owned executables, then verify the installed signatures and
regenerate hashes from the signed outputs.

## Current limits

- Provider approval, SignPath account/MFA and signing credentials are pending.
- GitHub MFA is maintainer-confirmed; the released-project requirement remains
  unmet because the current release is a draft.
- No signing workflow is represented as operational before those dependencies
  exist and a real signing request has been verified.
- Public YouTube account access remains governed by its separate release gate.
