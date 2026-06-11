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

## Environment

- `DIAMOND_SERVER_URL` - attach the desktop shell to an already-running Diamond
  server instead of starting one.
- `DIAMOND_SERVER_SCRIPT` - override the backend entrypoint. Defaults to
  `build/index.js` in development and the bundled `backend/build/index.js` in
  packaged builds. Packaged builds also include `sample-vault/` so first-run
  vault seeding works from Tauri resources.
- `DIAMOND_NODE_BIN` - override the Node executable. Defaults to `node`.
- `DIAMOND_DESKTOP_PORT` - force the loopback port. Defaults to an available
  random local port.

## Runtime model

The wrapper is local-only: it binds the backend to `127.0.0.1`, sets `ORIGIN` to
the selected loopback URL, and kills the child backend process when the Tauri app
exits.

The remaining desktop hardening work is to remove the system Node runtime
dependency. The clean target is either a native Rust filesystem/git backend or a
bundled per-platform Node sidecar. Until then, packaged desktop builds require a
Node runtime on `PATH` or an explicit `DIAMOND_NODE_BIN`.
