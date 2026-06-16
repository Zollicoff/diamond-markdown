# Diamond Markdown v1 Candidate - 2026-06-15

## Candidate

- Branch: `codex/diamond-buildout`
- Verified code commit: `03da6b9a7d153e2b70b51331863e3a70082f68ce`
- Remote: `https://github.com/Zollicoff/diamond-markdown.git`
- Local shell date: `2026-06-15 PDT`

## Release Claim

Diamond Markdown v1 is a self-hosted, web-first markdown knowledge base with
Obsidian-style notes, wikilinks, backlinks, graph, attachments, Canvas
compatibility, git history, and conservative GitHub sync.

## Verification

### V1 Smoke

Command:

```bash
npm run verify:v1-smoke
```

Result:

```text
12 app/export tests passed.
5 Canvas smoke tests passed.
8 focused feature smoke tests passed.
V1 smoke verification passed.
```

### Release Gate

Command:

```bash
npm run verify:release
```

Result:

```text
npm audit --audit-level=moderate: found 0 vulnerabilities.
svelte-check: 0 errors and 0 warnings.
Production build output verified.
Basic Auth smoke passed.
Read-only smoke passed.
Playwright e2e suite passed: 238 discovered tests across 115 batches.
Release verification passed.
```

### Fresh Checkout Install/Run

Commands:

```bash
git clone --branch codex/diamond-buildout --single-branch https://github.com/Zollicoff/diamond-markdown.git /tmp/diamond-v1-fresh.wqbacm/diamondmarkdown
npm install
npm run build -- --logLevel warn
PORT=4197 HOST=127.0.0.1 ORIGIN=http://127.0.0.1:4197 DIAMOND_CONFIG_DIR=/tmp/diamond-v1-fresh.wqbacm/config DIAMOND_DEFAULT_VAULT_DIR=/tmp/diamond-v1-fresh.wqbacm/vault node build
curl -I --fail http://127.0.0.1:4197/
```

Result:

```text
Fresh clone HEAD: 03da6b9a7d153e2b70b51331863e3a70082f68ce.
Node: v24.16.0.
npm: 11.13.0.
npm install: added 274 packages, audited 275 packages, found 0 vulnerabilities.
npm run build -- --logLevel warn: passed.
node build: listened on http://127.0.0.1:4197.
curl -I --fail http://127.0.0.1:4197/: HTTP/1.1 200 OK.
```

## Blockers Fixed During V1 Gate

- Updated audited dependencies with `npm audit fix`.
  - `dompurify`: `3.4.1` to `3.4.10`.
  - `vite`: `8.0.9` to `8.0.16`.
- Added `npm run verify:v1-smoke` as the repeatable v1 smoke gate.
- Stabilized two live-preview tests by opening fixture notes from the loaded
  vault tree instead of depending on a direct note-route load during a long
  batched run.

## Known Limitations

These are documented non-goals for v1, not release blockers:

- Full Obsidian clone.
- Full Obsidian Canvas parity.
- Full Obsidian plugin API compatibility.
- Seamless proprietary-sync replacement.
- Multi-user authorization.
- Offline editing with conflict reconciliation.
- Signed/notarized public desktop installer release.
- Exhaustive theme, hotkey, or plugin migration.
- Background sync and automatic conflict resolution.

## Notes

- GitHub sync is conservative by design: remote setup, check, fetch,
  fast-forward pull, guarded push, sync now, dirty/behind/diverged recovery,
  and write blocking are covered by automated tests.
- Desktop artifacts remain unsigned until signing/notarization credentials and
  public installer policy are finalized.
