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

After it passes, build the current-host unsigned self-contained desktop
artifact:

```sh
npm run desktop:build:self-contained
```

The build script uses CI-safe default bundle targets per host:

| Host | Default unsigned bundle target |
| --- | --- |
| macOS | `app` |
| Windows | `nsis` |
| Linux | `deb,appimage` |

Override the target list with `DIAMOND_DESKTOP_BUNDLES`, for example
`DIAMOND_DESKTOP_BUNDLES=dmg npm run desktop:build:self-contained`.
The legacy all-target command is still available as
`npm run desktop:build:self-contained:all`; on macOS that includes DMG
packaging, which may require Finder/AppleScript access and is therefore not
used by CI.

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
Each release build should write `diamond-desktop-artifacts.manifest.json` into
that bundle directory before upload:

```sh
npm run desktop:write-artifact-manifest
```

The manifest records the source commit/ref, package and Tauri versions,
runner platform, requested bundle targets, and each artifact file's relative
path, size, and SHA-256 hash. Upload the platform-specific bundle directory
with this manifest as the release artifact together with the preflight output.

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

## GitHub Actions Workflow

The desktop release workflow lives at
`.github/workflows/desktop-release.yml`. It runs on manual dispatch, pull
requests that touch release-relevant files, and pushes to `main` that touch
release-relevant files.

Each matrix entry runs on macOS, Windows, and Linux:

- `npm ci`
- `npm run verify:release`
- `npm run verify:desktop-release`
- `npm run desktop:build:self-contained` with an explicit
  `DIAMOND_DESKTOP_BUNDLES` value from the matrix
- `npm run desktop:write-artifact-manifest`

The workflow uploads `src-tauri/target/release/bundle/**` as unsigned desktop
artifacts for each platform, including the generated manifest. The macOS CI
target is `.app`, not `.dmg`, because DMG packaging runs Finder AppleScript
and belongs with the signed release publishing step. The release verifier is
runner-shell neutral: Playwright fixture setup and the preview server are launched through
`scripts/playwright-webserver.mjs`, full-suite Playwright runs are batched
through `scripts/verify-playwright-batches.mjs`, system Chrome/Edge is used
when available instead of downloading Playwright browsers in CI, and
`scripts/verify-release.mjs` resolves `npm.cmd` on Windows.

The workflow does not make a signed public release by itself. Signing,
notarization, release-note generation, and attaching artifacts to a GitHub
Release remain explicit release-runner responsibilities until those credentials
and policies are configured.

## Claim Boundary

It is accurate to claim:

- Tauri desktop shell exists.
- Current-host self-contained bundle inputs can be verified.
- GitHub Actions is configured to build and upload unsigned self-contained
  desktop artifacts and SHA-256 manifests across the configured matrix.
- The release plan identifies required sidecars, signing inputs, artifact
  manifests, and artifacts.

Do not claim signed cross-platform desktop release publishing is shipped until
the matrix workflow is verified with the required signing/notarization secrets,
DMG or installer policy is finalized, and artifacts are attached to a GitHub
Release.
