# Desktop wrapper

Diamond Markdown includes a Tauri v2 desktop shell in `src-tauri/`.

The current desktop wrapper preserves the existing SvelteKit server app instead of
rewriting every vault, filesystem, plugin, and git route at once. On startup, the
Rust shell starts the built Node backend on a loopback port, waits for it to
accept connections, then opens the Tauri webview to that local URL.

## Commands

```sh
npm run build
npm run desktop:dev
```

For a debug desktop binary without producing installers:

```sh
npm run desktop:build:debug
```

For a full Tauri bundle:

```sh
npm run desktop:build
```

For a self-contained unsigned artifact on the current host platform:

```sh
npm run desktop:build:self-contained
```

Before building a self-contained release bundle, run the desktop release
preflight:

```sh
npm run verify:desktop-release
```

The self-contained build prepares `src-tauri/binaries/node-<target-triple>` and
builds with `src-tauri/tauri.sidecar.conf.json`, which adds the prepared runtime
as a Tauri sidecar. It defaults to CI-safe unsigned bundle targets for the host
platform: `app` on macOS, `nsis` on Windows, and `deb,appimage` on Linux.
Override the list with `DIAMOND_DESKTOP_BUNDLES`, or use
`npm run desktop:build:self-contained:all` for Tauri's configured all-target
bundle set. On macOS, all-target bundling includes DMG packaging, which may
require Finder/AppleScript access.

On macOS and Linux, the prep script defaults to the official Node.js runtime for
the current Node version so the bundle does not depend on a Homebrew/system Node
install. Run the command separately on each release target, or provide the
target-specific sidecar binaries before cross-compiling.

## Environment

- `DIAMOND_SERVER_URL` - attach the desktop shell to an already-running Diamond
  server instead of starting one.
- `DIAMOND_SERVER_SCRIPT` - override the backend entrypoint. Defaults to
  `build/index.js` in development and the bundled `backend/build/index.js` in
  packaged builds. Packaged builds also include `sample-vault/` so first-run
  vault seeding works from Tauri resources.
- `DIAMOND_NODE_BIN` - override the Node executable. Without this override, the
  desktop shell checks for a bundled sidecar first and falls back to `node` on
  `PATH`.
- `DIAMOND_NODE_SOURCE` - explicit source executable used by
  `npm run desktop:prepare-node-sidecar`. Without this override, the prep script
  downloads/caches the official Node.js runtime for the current host when
  supported, then falls back to the resolved `node` on `PATH`.
- `DIAMOND_NODE_VERSION` - Node.js runtime version for the downloaded sidecar.
  Defaults to the Node version running the prep script.
- `DIAMOND_DESKTOP_PORT` - force the loopback port. Defaults to an available
  random local port.

## Runtime model

The wrapper is local-only: it binds the backend to `127.0.0.1`, sets `ORIGIN` to
the selected loopback URL, and kills the child backend process when the Tauri app
exits.

The runtime lookup order is:

1. `DIAMOND_NODE_BIN`
2. bundled sidecar next to the Tauri executable or inside Tauri resources
3. `node` on `PATH`

The remaining desktop release work is to automate sidecar preparation for every
published target, or replace the Node backend with native Rust filesystem/git
commands. The current scripts make the current host platform self-contained
when a sidecar build is used.

The cross-platform release plan, artifact expectations, and signing inputs live
in [desktop-release.md](./desktop-release.md).
