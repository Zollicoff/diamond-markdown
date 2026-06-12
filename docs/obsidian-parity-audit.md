# Obsidian Parity Audit

This audit keeps the Diamond Markdown buildout pointed at the product goal:
a credible Obsidian-style daily driver with GitHub sync, clean architecture,
tests, documentation, and shippable verification.

Status labels:

- **Done**: implemented and covered by tests or release verification.
- **Partial**: usable, but with important gaps against the daily-driver goal.
- **Missing**: not implemented in a meaningful way.
- **Deferred**: intentionally out of scope for core.

## Executive Summary

Diamond Markdown is beyond a prototype. Core markdown notes, wikilinks,
backlinks, graph, tags, templates, history, attachments, import preflight,
publishing, basic self-hosting, plugin scaffolding, and much of Obsidian
Canvas compatibility are implemented and verified.

The main remaining product risks are:

1. **Sync ergonomics are improving but still conservative.** GitHub sync has
   safe primitives and a one-click sync path, but it intentionally stops short
   of automatic background merge/conflict handling.
2. **Desktop release is not a shipped cross-platform story.** The Tauri shell
   exists and current-host release inputs have a preflight, but matrix CI,
   signing, notarization, and upload remain unfinished.
3. **Plugin compatibility is intentionally small.** Diamond can support useful
   plugins, but it is not and should not claim full Obsidian plugin parity.
4. **Large-vault search is improving.** Tree and graph have scale work, and
   full-text search now uses ranked persisted index results with field
   operators, boolean `OR`, safe regex terms, paged loading, and virtualized
   result rendering, but advanced grouping remains basic.
5. **Roadmap wording needs to stay honest.** Public docs now distinguish core
   Obsidian-style parity from full Obsidian ecosystem parity; keep that claim
   boundary current as features land.

## Product Parity Matrix

| Area | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| Vault filesystem model | Done | Vault registry, server path guards, import preflight, file tree tests | Keep all new disk routes on server path helpers |
| Markdown editing | Done | CodeMirror source/live/read modes, toolbar, word count, stale revision guard | Polish editor edge cases as reported |
| Wikilinks and navigation | Done | Alias/path/heading/block refs, context menus, hover previews, modifier opens | More obscure Obsidian link aliases can be added later |
| Backlinks/outgoing links | Done | Indexer and right-panel link lists, including unlinked mention detection | Keep mention matching conservative so it remains useful on large vaults |
| Tags/frontmatter | Done | Inline tags plus Obsidian block-list `tags` and `aliases` | Broader YAML compatibility can remain incremental |
| Render pipeline | Done | KaTeX, Mermaid, code highlighting, footnotes, embeds, callouts, block IDs | Continue adding edge cases only when imported vaults expose them |
| Attachments | Done | Upload/drop/paste, picker, multi-select insert, delete, rename/move with reference rewrites, Obsidian folder config | Deeper gallery/library polish can remain incremental |
| Canvas | Partial | Read/render/edit many nodes and edges, resize cards, markdown-aware text-card previews, groups, editable colors, SVG export, git-backed mutations | Deeper visual editing parity is not full Obsidian Canvas |
| Search | Partial | Fuzzy switcher plus ranked persisted index-backed full-text search with quoted phrases, field filters, exclusions, boolean `OR`, safe regex terms, paged loading, virtualized results, and capped-result metadata | Advanced grouping and saved-search polish remain basic |
| Graph | Done | Force graph, filters, selection, pinning, quadtree scaling path | Cosmetic parity with Obsidian graph is not the priority |
| Git history | Done | Auto-commits, note history diff/copy/restore | Branch workflows are still an open idea |
| GitHub sync | Partial | Remote setup, check, safe one-click sync, fetch, fast-forward pull, guarded push, incoming-file review, divergence/recovery UI | Background sync and conflict resolution remain manual by design |
| Import from Obsidian | Partial | `.obsidian` detection, supported `app.json` migration notes, plugin settings migration guidance, attachment folder detection, Canvas preservation | No full plugin migration or execution; some Obsidian UI preferences remain guidance-only |
| Static publishing | Done | Public frontmatter export, public-only wikilinks, assets copied | Hosted publish service is intentionally out of scope |
| PWA/mobile | Partial | PWA app shell, mobile gestures, responsive layout | Offline editing/sync conflict story remains intentionally server-backed |
| Self-hosting/security | Partial | Basic Auth, read-only mode, path traversal tests, self-hosting docs | No multi-user auth/authorization model |
| Desktop | Partial | Tauri wrapper, current-platform sidecar build scripts, `verify:desktop-release`, cross-shell release verifier launcher, and documented release matrix | Cross-platform workflow run, signing/notarization, and artifact upload are not done |
| Plugins | Partial | Manifest/catalog install, workers, iframes, command/editor/markdown/settings hooks | Full Obsidian plugin API parity is deferred/non-goal |
| Verification | Done | `verify:release` runs audit, type check, clean build, auth/read-only smokes, full Playwright | Keep expanding targeted coverage as features land |

## Highest-Value Next Slices

1. **Desktop release CI.** Add and verify a matrix workflow for desktop
   preflight/build/artifact upload once a GitHub credential with `workflow`
   scope is available.
2. **Canvas/import polish.** Continue daily-driver compatibility work around
   deeper Canvas interaction parity and remaining Obsidian config edge cases
   without executing Obsidian plugins.
3. **Verification hardening.** Keep expanding targeted coverage around
   dialog-driven destructive actions, sync recovery flows, and release-facing
   claim changes.

## Current Product Line

Diamond Markdown can credibly claim: "Obsidian-style core notes, links,
backlinks, graph, attachments, Canvas compatibility, git history, and
conservative GitHub sync in a self-hosted web app."

It should not yet claim: "full Obsidian clone," "full Obsidian Canvas parity,"
"full Obsidian plugin compatibility," "seamless proprietary-sync replacement,"
or "cross-platform desktop release" without the remaining blockers above.
