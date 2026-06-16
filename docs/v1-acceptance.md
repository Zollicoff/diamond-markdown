# Diamond Markdown v1 Acceptance

This file defines what counts as `v1 done`.

The v1 target is **a self-hosted web Obsidian-style daily driver with
conservative GitHub sync**. It is not a promise to clone the entire Obsidian
desktop, mobile, sync, Canvas, theme, and plugin ecosystem.

## Release Claim

Diamond Markdown v1 may claim:

> A self-hosted, web-first markdown knowledge base with Obsidian-style notes,
> wikilinks, backlinks, graph, attachments, Canvas compatibility, git history,
> and conservative GitHub sync.

Diamond Markdown v1 must not claim:

- Full Obsidian clone.
- Full Obsidian Canvas parity.
- Full Obsidian plugin API compatibility.
- Seamless proprietary-sync replacement.
- Multi-user authorization.
- Offline editing with conflict reconciliation.
- Signed/notarized public desktop installer release.
- Exhaustive theme, hotkey, or plugin migration.

## P0 Acceptance Criteria

All P0 items must pass before v1 is called complete.

| Area | v1 requirement | Acceptance check |
| --- | --- | --- |
| Repository state | Release branch is clean and pushed. | `git status --short --branch`, `git rev-parse HEAD origin/<branch>`, and `git ls-remote` all match. |
| Release verification | The repeatable release gate passes. | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run verify:release` exits 0. |
| Basic install/run | A fresh checkout can install, build, and run. | `npm install`, `npm run build`, and `node build` work with documented Node version. |
| Vault lifecycle | A user can create/register/open a local markdown vault. | Manual smoke using a disposable vault. |
| Notes | Create, edit, save, rename, move, duplicate, delete, and restore note workflows work. | Existing Playwright coverage plus manual smoke. |
| Markdown rendering | Source, Live, and Read modes render core markdown and Obsidian-style syntax safely. | Existing release suite plus one real-vault spot check. |
| Links and navigation | Wikilinks, heading links, block links, backlinks, outgoing links, and unlinked mentions work. | Existing release suite plus one real-vault spot check. |
| Search | Quick switcher, full-text search, saved searches, pagination, and result grouping work. | Existing release suite plus one manual saved-search smoke. |
| Attachments | Upload/drop/paste, picker insert, embeds, delete, rename, and move with reference rewrites work. | Existing release suite plus one manual attachment smoke. |
| Canvas | Canvas files open, render, and support core card/group/edge edits without corrupting files. | Existing release suite plus one real Canvas smoke. |
| Git history | Saves create git commits; note history diff/copy/restore works. | Existing release suite plus manual disposable-vault smoke. |
| GitHub sync | Remote setup, check, fetch, fast-forward pull, guarded push, sync now, dirty/behind/diverged recovery, and write blocking work conservatively. | Existing release suite plus disposable remote sync smoke. |
| Import/export | Obsidian import preflight and Obsidian-ready ZIP export work without mutating source vaults unexpectedly. | Existing release suite plus one sample import/export smoke. |
| Self-hosting security | Basic Auth, read-only mode, path traversal guards, raw asset safety, and script-safe markdown preview remain covered. | Existing release suite and release checklist smokes. |
| Documentation | README, self-hosting, release checklist, parity audit, and v1 limitations agree. | Manual doc review before release packet. |
| Release packet | A release note exists with commit, verification commands, pass/fail output, install/run commands, and known limitations. | `docs/releases/v1-*.md` created before tag/deploy. |

## Repeatable v1 Smoke Gate

Run this before the final release gate:

```bash
npm run verify:v1-smoke
```

The smoke gate exercises the acceptance rows that still need intentional
release-shaped coverage: app boot and workspace shell, Obsidian export, Canvas
open/edit flows, import preflight, saved search, GitHub sync controls,
disposable-remote sync, local recovery guidance, and Obsidian local trash.

## P1 Acceptance Criteria

P1 items should be fixed if they are cheap and low-risk. They do not block v1
if documented as known limitations.

- Improve rough UI copy found during dogfood.
- Add narrow tests for any bug fixed during the v1 blocker sprint.
- Remove stale roadmap wording that implies full Obsidian replacement.
- Trim obvious remaining all-domain client code only when it reduces release
  risk; do not do refactor-only work after the v1 freeze.

## Deferred After v1

These are explicitly not v1 blockers:

- Signed and notarized desktop installers.
- Public desktop release policy.
- Background sync.
- Automatic conflict resolution.
- Offline editing.
- Multi-user roles and per-vault permissions.
- Full Obsidian plugin API support.
- Full theme/CSS snippet execution.
- Full Canvas visual editing parity.
- Full hotkey migration.
- System trash integration.

## Current v1 Audit Snapshot

Initial snapshot: 2026-06-15, branch `codex/diamond-buildout`, commit
`56743720437a8fd9d6ab50aa8939cee2f171ac08`.

| Area | Status | Notes |
| --- | --- | --- |
| Repository state | Pass | Branch was exact-verified at the snapshot commit. |
| Release verification | Pass | Latest release gate passed with 238 discovered Playwright tests across 115 batches. |
| Basic install/run | Needs fresh-checkout smoke | Build passes in release verification; fresh-checkout install/run should be smoked before release packet. |
| Vault lifecycle | Pass | `npm run verify:v1-smoke` opens the default fixture vault and registers disposable vaults for import/export, search, sync, and trash flows. |
| Notes | Pass | Existing tests cover note CRUD, stale revisions, history, delete preferences, and git commits. |
| Markdown rendering | Pass | Existing tests cover core render pipeline, Obsidian syntax, embeds, comments, highlights, and static publish. |
| Links and navigation | Pass | Existing tests cover wikilinks, Markdown note links, backlinks, outgoing links, aliases, headings, blocks, and mentions. |
| Search | Pass | Existing tests cover quick switcher/search tab behavior, saved searches, paging, grouping, facets, highlighting, and client helpers. |
| Attachments | Pass | Existing tests cover attachment upload/list/picker/delete/rename/move and embed rendering. |
| Canvas | Pass | `npm run verify:v1-smoke` opens an editable Obsidian Canvas preview and covers group/card/edge/file operations with git commits. |
| Git history | Pass | Existing tests cover auto-commit, history diff/copy/restore, and stale-write guards. |
| GitHub sync | Pass | `npm run verify:v1-smoke` covers GitHub sync UI, dirty recovery guidance, and a disposable remote sync push/pull pass. |
| Import/export | Pass | `npm run verify:v1-smoke` covers import preflight and Obsidian-ready ZIP export. |
| Self-hosting security | Pass | Release verification covers audit, Basic Auth, read-only mode, path traversal, and raw asset safety tests. |
| Documentation | Pass | Public docs were aligned to the finite v1 claim; remaining parity gaps are documented as known limitations/non-goals. |
| Release packet | Missing | Create only after blocker audit and v1 smokes pass. |

V1 smoke result on 2026-06-15:

```text
npm run verify:v1-smoke
12 app/export tests passed.
5 Canvas smoke tests passed.
8 focused feature smoke tests passed.
V1 smoke verification passed.
```

## Completion Rule

Once all P0 items are Pass or Deferred By Definition, run the release gate one
last time, create the release packet, exact-verify the pushed branch, and only
then call the v1 goal complete.
