# Release Checklist

Use this checklist before tagging, publishing, or deploying Diamond Markdown.
Do not call a release ready from partial checks.

The repeatable verification command is:

```sh
npm run verify:release
```

It runs the dependency audit, Svelte diagnostics, production build, automated
Basic Auth smoke, automated read-only smoke, and full Playwright e2e suite. On
macOS, it uses an installed Google Chrome executable as a fallback when
Playwright's managed Chromium cache is unavailable.

## 1. Repository State

```sh
git status --short --branch
git log --oneline --decorate -5
```

Required:

- Working tree is clean.
- Branch and target remote are explicit.
- Any generated files are intentional.

## 2. Dependency And Type Checks

```sh
npm install
npm audit --audit-level=moderate
npm run check
```

Required:

- No moderate-or-higher audit findings.
- `svelte-check` reports 0 errors.

## 3. Production Build

```sh
CI=1 npm run build
```

Required:

- Build exits 0.
- Any chunk-size warning is explained in `DESIGN.md`.
- Server output is generated under `build/`.

## 4. Browser/API Tests

Use Playwright's managed browser when available:

```sh
npm run test:e2e
```

If the managed browser is unavailable on the host, use an installed Chrome:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
```

Required:

- Full e2e suite passes.
- Test output states the exact number of passed tests.
- The isolated fixture uses `DIAMOND_CONFIG_DIR` and `DIAMOND_DEFAULT_VAULT_DIR`; tests must not touch a real user vault.

## 5. Manual Smoke

Run the production server:

```sh
HOST=127.0.0.1 PORT=4173 node build
```

Check:

- Vault picker opens.
- Default vault opens.
- Note opens in Live mode.
- Source/Live/Read mode switching works.
- Save creates a git commit.
- Settings -> GitHub sync shows branch, sha, remote state, and dirty-file counts.
- Search, graph, tags, templates, and daily note commands open.
- Raw image assets render and markdown preview does not execute scripts.

## 6. Sync Smoke

Use a disposable test vault and GitHub test remote.

Check:

- Fresh vault gets an `init: vault` commit and clean sync status.
- Non-GitHub remotes are rejected.
- Configured remotes can be checked with the Settings health-check action.
- Fetch does not mutate files.
- Pull is fast-forward only.
- Push refuses when the vault is dirty or behind.
- Diverged histories are reported as manual-merge state.
- After fetch, behind/diverged/merge-conflicted vaults block write APIs with `409`.
- Plugin installs create a commit and leave the vault clean.

## 7. Basic Auth Smoke

Run the automated Basic Auth smoke:

```sh
npm run verify:auth
```

Required:

- `/api/health` works without credentials.
- Pages and vault APIs return `401` without credentials.
- Wrong credentials return `401`.
- Correct credentials can load the home page and `GET /api/vaults`.
- The script uses a disposable config/vault and removes it after the check.

## 8. Read-Only Smoke

Run the automated read-only smoke:

```sh
npm run verify:readonly
```

Required:

- `/api/health` reports `"readOnly": true`.
- `GET /api/vaults` works.
- A write request such as `POST /api/vaults/default/note` returns `403`.
- The home and vault screens show the read-only banner.
- The script uses a disposable config/vault and removes it after the check.

## 9. Documentation

Check:

- `README.md` status and run instructions match the current app.
- `ROADMAP.md` checkboxes match verified work only.
- `SECURITY.md` and `docs/self-hosting.md` describe the current security model.
- New user-visible behavior is documented in `DESIGN.md` when architectural.

## 10. Desktop Release Preflight

For a current-host self-contained desktop build:

```sh
npm run verify:desktop-release
```

Required:

- Production backend output exists under `build/`.
- Tauri bundle resources include `backend/build` and `sample-vault`.
- The host Node sidecar exists, is executable, reports a Node.js version, and is git-ignored.
- Package and Tauri versions match.
- Signing/notarization environment status is recorded in the command output.

For the full desktop release plan, see `docs/desktop-release.md`.

## 11. Tag Or Deploy

Only after all required checks pass:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

For deployment, record:

- commit hash
- host
- config directory
- vault path
- verification commands and pass/fail output
