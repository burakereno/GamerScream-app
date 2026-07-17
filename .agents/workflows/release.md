---
description: Publish one signed and verified GamerScream desktop release
---

# GamerScream Verified Release

Use this workflow only after the user explicitly authorizes a release. Preparing
code or a local preview never authorizes a commit, push, deployment, tag, or
GitHub release.

The user does not need to type terminal commands. Codex performs readiness
checks and one-time credential setup; releases are started from the GitHub
Actions web interface.

## Immutable release contract

`.github/release-contract.env` is the source of truth for repository, bundle,
team, server URL, and artifact names. Public download names never include a
version:

- `GamerScream.dmg`
- `GamerScream.dmg.update.json`
- `GamerScream.zip`
- `latest-mac.yml`
- `GamerScream-Setup.exe`
- `GamerScream-Setup.exe.blockmap`
- `latest.yml`

The website uses `/releases/latest/download/...`; do not edit its download URLs
for a routine release.

## One-time signing setup

Before the first release, verify all of the following without exposing secret
values in logs:

1. The login Keychain contains exactly this usable identity:
   `Developer ID Application: Burak ERENOĞLU (66K3EFBVB6)`.
2. GitHub CLI is authenticated to `burakereno/GamerScream-app` with permission
   to manage Actions secrets.
3. These macOS repository secrets exist:
   `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`,
   `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and
   `APPLE_APP_SPECIFIC_PASSWORD`.

Windows artifacts are intentionally unsigned by product decision. The release
contract must say `WINDOWS_SIGNING=unsigned`, certificate auto-discovery must be
disabled, and the build must verify that the installer is actually unsigned.
Windows SmartScreen may therefore show an unknown-publisher warning. Feed hash,
size, asset-name, and version validation remain mandatory.

Use the `macos-developer-id-release` readiness and secret-configuration helpers.
The user may need to complete Apple/GitHub login, 2FA, or a hidden password
prompt, but must never paste credentials into chat or a visible terminal.

## Release gates

Before asking the user to authorize a release:

1. Review both repository worktrees and preserve unrelated user changes.
2. Run desktop and server tests, type checks, production builds, and
   `tests/release_contract_test.sh`.
3. Confirm the macOS signing identity and all required GitHub secret names.
4. Confirm the intended source is the current `main` branch on GitHub.
5. Report any blocker. Do not weaken signing, notarization, or asset checks.

Server deployment is a separate operation and needs separate explicit approval.
The desktop release workflow does not deploy the server.

## Start a release without terminal commands

After explicit approval:

1. Open the repository's **Actions** page in GitHub.
2. Select **Verified Desktop Release**.
3. Select **Run workflow**, choose `main` and the patch/minor/major increment,
   then confirm.
4. Monitor all four jobs: prepare, macOS, Windows, and publish.

The workflow derives the selected increment from the latest stable tag. It builds
that version into the application metadata; no hard-coded renderer version needs
editing.

The publish job runs only after both platform builds pass. It checks the exact
asset set and update metadata, then creates the tag and release. Never create a
manual tag first and never upload unsigned replacement assets.

## Required verification

After completion, verify in GitHub's web interface:

- Both platform jobs succeeded.
- macOS app and DMG signing, hardened runtime, notarization, stapling, Gatekeeper,
  bundle identifier, and Team ID checks succeeded.
- The Windows installer is unsigned as declared by the release contract, and
  its updater feed path, version, SHA-512, and size match the published bytes.
- The release contains exactly the seven immutable assets listed above.
- The latest macOS and Windows website download links resolve to that release.
- The desktop updater feed points to the same version and hashes.

Report the old and new versions, workflow URL, release URL, download checks, and
whether a separately authorized server deployment occurred.
