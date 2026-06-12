# Desktop Release Track

Diamond's desktop shell is releaseable only when the web app, Node backend
resources, Tauri bundle config, and host-specific Node sidecar are all prepared
for the target platform. The current automation verifies the current host. It
does not yet publish signed cross-platform artifacts.

## Current-Host Preflight

Run this before a self-contained desktop build:

```sh
npm run verify:desktop-release
```

This command:

- builds the production SvelteKit/Node backend
- prepares `src-tauri/binaries/node-<rust-host-triple>` for the current host
- verifies Tauri/package version alignment
- verifies required backend and sample-vault bundle resources
- verifies `src-tauri/tauri.sidecar.conf.json` includes `binaries/node`
- runs the prepared sidecar with `--version`
- confirms generated sidecar binaries are git-ignored

After it passes, build the current-host self-contained desktop bundle:

```sh
npm run desktop:build:self-contained
```

## Release Matrix

Run the preflight and build on each platform that will publish an artifact:

| Platform | Runner | Expected sidecar |
| --- | --- | --- |
| macOS Apple Silicon | `macos-latest` or Apple Silicon runner | `src-tauri/binaries/node-aarch64-apple-darwin` |
| macOS Intel | Intel macOS runner | `src-tauri/binaries/node-x86_64-apple-darwin` |
| Windows x64 | `windows-latest` | `src-tauri/binaries/node-x86_64-pc-windows-msvc.exe` |
| Linux x64 | `ubuntu-latest` | `src-tauri/binaries/node-x86_64-unknown-linux-gnu` |

Cross-compiling with Node sidecars is not considered release-ready unless the
target sidecar is prepared and verified for the target triple.

## Artifact Expectations

Tauri writes platform installers/bundles under `src-tauri/target/release/bundle/`.
Upload the platform-specific bundle directory as the release artifact together
with the commit hash and preflight output.

Do not upload `src-tauri/binaries/node-*` from the repository root as a separate
artifact. It is an input to the Tauri bundle and is intentionally git-ignored.

## Signing And Notarization Inputs

Signing is platform-specific. The preflight reports whether signing variables
are present, but it does not require them for local debug/rehearsal builds.

Common Tauri signing:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

macOS signing/notarization:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Windows signing should use the certificate mechanism selected by the release
runner or signing provider. Record the provider and certificate thumbprint in
the release notes.

## GitHub Actions Plan

The release verifier is runner-shell neutral: Playwright fixture setup and the
preview server are launched through `scripts/playwright-webserver.mjs`,
full-suite Playwright runs are batched through
`scripts/verify-playwright-batches.mjs`, and `scripts/verify-release.mjs`
resolves `npm.cmd` on Windows.

A publish workflow should run this sequence per matrix entry:

```sh
npm ci
npm run verify:release
npm run verify:desktop-release
npm run desktop:build:self-contained
```

Then upload `src-tauri/target/release/bundle/**`.

Adding `.github/workflows/*` requires a GitHub credential with `workflow` scope.
Until that credential is available, keep this document and
`npm run verify:desktop-release` as the canonical desktop release plan.

## Claim Boundary

It is accurate to claim:

- Tauri desktop shell exists.
- Current-host self-contained bundle inputs can be verified.
- The release plan identifies required sidecars, signing inputs, and artifacts.

Do not claim cross-platform desktop release automation is shipped until the
matrix workflow is committed, pushed, and verified on macOS, Windows, and Linux.
