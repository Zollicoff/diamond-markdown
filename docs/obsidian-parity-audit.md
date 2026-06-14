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
2. **Desktop release is only partially automated.** The Tauri shell exists,
   current-host release inputs have a preflight, and GitHub Actions can build
   unsigned matrix artifacts, but signing, notarization, and GitHub Release
   publishing remain unfinished.
3. **Plugin compatibility is intentionally small.** Diamond can support useful
   plugins, but it is not and should not claim full Obsidian plugin parity.
4. **Large-vault search is improving.** Tree and graph have scale work, and
   full-text search now uses ranked persisted index results with field
   operators, boolean `OR`, safe regex terms, folder grouping/facets,
   git-backed saved searches, paged loading, and virtualized result rendering,
   but richer search dashboards remain basic.
5. **Roadmap wording needs to stay honest.** Public docs now distinguish core
   Obsidian-style parity from full Obsidian ecosystem parity; keep that claim
   boundary current as features land.

## Product Parity Matrix

| Area | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| Vault filesystem model | Done | Vault registry, server path guards, import preflight, Obsidian-ready vault ZIP export, file tree tests | Keep all new disk routes on server path helpers |
| Markdown editing | Done | CodeMirror source/live/read modes, toolbar, word count, stale revision guard | Polish editor edge cases as reported |
| Wikilinks and navigation | Done | Alias/path/heading/block refs, context menus, hover previews, modifier opens | More obscure Obsidian link aliases can be added later |
| Backlinks/outgoing links | Done | Indexer and right-panel link lists, including unlinked mention detection | Keep mention matching conservative so it remains useful on large vaults |
| Tags/frontmatter | Done | Inline tags plus Obsidian block-list `tags` and `aliases` | Broader YAML compatibility can remain incremental |
| Render pipeline | Done | KaTeX, Mermaid, code highlighting, footnotes, embeds, callouts, block IDs | Continue adding edge cases only when imported vaults expose them |
| Attachments | Done | Upload/drop/paste, picker, multi-select insert, delete, rename/move with reference rewrites, Obsidian folder config, suffix-preserving source-relative Markdown image links | Deeper gallery/library polish can remain incremental |
| Canvas | Partial | Read/render/edit many nodes and edges, zoom boards, resize cards, markdown-aware text-card previews with H1-H6 headings, thematic breaks, Obsidian callouts, highlights, strikethrough, simple tables, resolved note/title/alias inline wikilinks and note embed chips, explicit Canvas links and embed chips, and safe vault-local asset embeds, file-card heading/block subpaths, vault-asset file-card previews, groups, editable colors/routing, SVG export, git-backed mutations | Deeper visual editing parity is not full Obsidian Canvas |
| Search | Partial | Fuzzy switcher plus ranked persisted index-backed full-text search with quoted phrases, field filters, exclusions, boolean `OR`, safe regex terms, folder grouping/facets, git-backed saved searches, paged loading, virtualized results, and capped-result metadata | Richer search dashboards remain incremental |
| Graph | Done | Force graph, filters, selection, pinning, quadtree scaling path | Cosmetic parity with Obsidian graph is not the priority |
| Git history | Done | Auto-commits, note history diff/copy/restore | Branch workflows are still an open idea |
| GitHub sync | Partial | Remote setup, check, safe one-click sync, fetch, fast-forward pull, guarded push, incoming-file review with UI-level sync recovery, divergence/recovery UI, git-backed bookmarks and saved searches | Background sync and conflict resolution remain manual by design |
| Import/export with Obsidian | Partial | `.obsidian` detection, supported `app.json`, Daily Notes, Templates, Appearance/CSS snippet guidance, Graph settings guidance, core-plugin support notes, hotkey migration guidance with known Diamond command mappings, and bookmark migration notes, safe attachment-folder reuse, safe configured new-note folder defaults, `useMarkdownLinks` editor insertion preference, `showLineNumber` editor display preference, safe Daily Notes folder/template/date-format reuse, safe Templates folder/default date-time format reuse, note-level Obsidian bookmark seeding, `alwaysUpdateLinks` rename behavior, plugin settings migration guidance, Canvas preservation, Obsidian-ready ZIP export that excludes Diamond/Git/generated metadata | No full plugin/theme/hotkey/graph migration or execution; some Obsidian UI preferences remain guidance-only |
| Static publishing | Done | Public frontmatter export, public-only wikilinks, assets copied | Hosted publish service is intentionally out of scope |
| PWA/mobile | Partial | PWA app shell, mobile gestures, responsive layout | Offline editing/sync conflict story remains intentionally server-backed |
| Self-hosting/security | Partial | Basic Auth, read-only mode, path traversal tests, self-hosting docs | No multi-user auth/authorization model |
| Desktop | Partial | Tauri wrapper, current-platform sidecar build scripts, `verify:desktop-release`, cross-shell release verifier launcher, unsigned GitHub Actions artifact matrix, and per-platform artifact manifests with SHA-256 hashes | Signing/notarization and GitHub Release publishing are not done |
| Plugins | Partial | Manifest/catalog install, workers, iframes, command/editor/markdown/settings hooks | Full Obsidian plugin API parity is deferred/non-goal |
| Verification | Done | `verify:release` runs audit, type check, clean build, auth/read-only smokes, and batched full-suite Playwright | Keep expanding targeted coverage as features land |

## Highest-Value Next Slices

1. **Signed desktop release publishing.** Configure signing/notarization
   secrets, installer policy, release notes, and GitHub Release attachment
   automation once Zach is ready to publish public desktop installers.
2. **Canvas/import polish.** Continue daily-driver compatibility work around
   deeper Canvas interaction parity and remaining Obsidian config edge cases
   without executing Obsidian plugins, themes, or CSS snippets.
3. **Verification hardening.** Keep expanding targeted coverage around
   dialog-driven destructive actions, sync recovery flows, and release-facing
   claim changes while keeping the release suite batchable.

## Current Product Line

Diamond Markdown can credibly claim: "Obsidian-style core notes, links,
backlinks, graph, attachments, Canvas compatibility, git history, and
conservative GitHub sync in a self-hosted web app."

It should not yet claim: "full Obsidian clone," "full Obsidian Canvas parity,"
"full Obsidian plugin compatibility," "seamless proprietary-sync replacement,"
or "cross-platform desktop release" without the remaining blockers above.
