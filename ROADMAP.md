# Diamond Markdown — Roadmap

Version numbers signal feature areas, not SemVer stability. We're pre-1.0.
The current claim boundary lives in
[docs/obsidian-parity-audit.md](./docs/obsidian-parity-audit.md): Diamond can
claim an Obsidian-style core notes workflow, conservative GitHub sync, and broad
Canvas compatibility, but not full Obsidian plugin parity, full Canvas
whiteboard parity, automatic proprietary-sync replacement, or signed
cross-platform desktop release publishing.

## v0.1 — MVP ✓ (shipped 2026-04-22)

The non-negotiable minimum to replace a basic Obsidian workflow:

- [x] Repo scaffold, license, docs
- [x] Sample vault (ships in-repo, copied to `~/Documents/Diamond Markdown` on first run)
- [x] Vault registry (`~/.diamondmd/config.json`) — add / switch / remove
- [x] File tree with folders, collapsible, click to open, drag-drop, rename / move / delete
- [x] CodeMirror 6 editor with markdown syntax
- [x] Source / Live / Read mode toggle
- [x] **Live preview** (Obsidian-style WYSIWYG-within-editor via CodeMirror decorations) — landed in the v0.1 refactor
- [x] Wikilink parser + resolver (basename, path, alias)
- [x] Click a wikilink → navigates to that note (modifier-aware: ⌘ → new tab, alt → new pane)
- [x] Right-click wikilink → context menu (Open / new tab / new pane / Copy path)
- [x] Broken link styling + click-to-create
- [x] Frontmatter parser (title, tags, aliases, created, updated, public)
- [x] Backlinks panel
- [x] Unlinked mentions panel
- [x] Outgoing links panel
- [x] Tag index page
- [x] Fuzzy quick-switcher
- [x] Ranked index-backed full-text search with quoted phrases, field filters, exclusions, boolean `OR`, safe `/regex/` terms, folder grouping/facets, paged loading, and virtualized results
- [x] Git auto-commit on save (debounced)
- [x] Per-note history viewer (git log + diff)
- [x] Daily notes (auto-create from `Daily Notes/Template.md`, ⌘⇧D)

## v0.2 — Obsidian-style core notes workflow ✓ (shipped 2026-04-25)

- [x] Command palette (⌘P)
- [x] Tag index page
- [x] Graph view (custom force-directed sim) — drag, pan, zoom, force tuning, filters
- [x] History viewer modal
- [x] Image embeds (`![[image.png]]`)
- [x] Note embeds (`![[Note]]`, cycle-safe recursion)
- [x] Hover preview — mouseover wikilinks for a floating preview card
- [x] Heading anchors + `[[Note#Heading]]` deep links + URL hash scroll
- [x] Outline panel (right sidebar)
- [x] Math (KaTeX, server-rendered, price-safe)
- [x] Mermaid diagrams (lazy-loaded)
- [x] Code highlighting (highlight.js)
- [x] Footnotes
- [x] General templates (`Templates/` folder + ⌘⇧T)
- [x] Git-backed bookmarks (⌘⇧B, sidebar panel)
- [x] Recent notes panel
- [x] Light / Dark / Auto theme (⌘⇧L)
- [x] PWA manifest + theme-color + icons (home-screen install)
- [x] Excluded folders (per-vault)
- [x] Word count + reading time
- [x] State → URL sync (reload preserves position, links shareable)
- [x] Static-site publishing (`public: true` frontmatter, one-shot export)
- [x] Acknowledgments + ATTRIBUTION.md

## v0.3 — Polish & mobile

- [x] Security/self-hosting docs and release checklist
- [x] Route-level tests for path traversal, symlink escapes, raw asset headers, and note/folder mutations
- [x] Template picker upgrade (modal palette instead of `prompt()`)
- [x] App-level dialogs/toasts for command confirmations, errors, and plugin notifications
- [x] Service worker for offline app shell/static assets
- [x] Mobile touch gestures (swipe to switch tabs / panes)
- [x] Light-mode highlight.js per-token theming
- [x] Outline scroll inside Live mode
- [x] Settings page consolidation
- [x] Multi-select / drag-select in graph

## v0.4 — Performance & scale

- [x] Git sync status / safe one-click sync / pull / push UI with divergence warnings
- [x] Indexer warm-cache on disk for fast startup
- [x] Diverged-history resolution UI with local/remote/overlap file lists
- [x] Virtualized file tree for very large vaults
- [x] Quadtree-backed graph sim (drop O(n²) for very large vaults)

## v0.5 — Plugins & desktop (partial)

- [x] Minimal plugin API (ES modules loaded at boot from `<vault>/.diamondmd/plugins/`)
- [x] Plugin extension points: markdown extension, editor command, right-panel view, settings panel
  - [x] Settings panel renderer
  - [x] Markdown postprocessor hook
  - [x] Editor-specific command hook
  - [x] Right-panel view hook
- [x] Sandboxed execution (iframes for UI; Worker for logic)
  - [x] Worker execution for command-only plugin logic
  - [x] Iframe-hosted settings/right-panel renderers
  - [x] Capability proxy for note file read/write APIs
  - [x] Capability proxy for active-editor mutation APIs
- [x] Plugin install UI (load plugins from manifest URL, not just disk)
- [x] Curated plugin registry/catalog
- [x] **Tauri v2 desktop wrapper** — native desktop shell that launches the existing built SvelteKit/Node backend on loopback and opens a Tauri webview, reusing 100% of current app behavior.
- [x] **Current-platform self-contained desktop runtime** — optional Tauri sidecar config plus `desktop:prepare-node-sidecar` / `desktop:build:self-contained` scripts bundle the current host's Node runtime instead of requiring system Node.
- [x] **Current-host desktop release preflight** — `verify:desktop-release` checks production backend resources, Tauri bundle inputs, host sidecar executable, version alignment, and generated-binary ignore rules before self-contained packaging.
- [x] **Unsigned desktop artifact CI** — `.github/workflows/desktop-release.yml` runs the web release gate, desktop preflight, self-contained Tauri build, and unsigned bundle artifact upload on macOS / Windows / Linux.
- [ ] **Signed cross-platform release publishing** — configure signing/notarization secrets, release notes, and GitHub Release attachment policy for every published macOS / Windows / Linux target.

Deliberately smaller plugin surface than Obsidian's — too much API = too much
rewriting. Diamond has useful plugin extension points, but full Obsidian plugin
runtime compatibility is a non-goal.

## Open ideas (maybe, maybe not)

- **Deeper Canvas parity.** Canvas previews, zoom controls, markdown-aware text
  cards with callouts, highlights, strikethrough, simple tables, resolved
  note/title/alias inline wikilinks and note embed chips, explicit Canvas links
  and embed chips, and safe vault-local asset embeds, file-card subpaths, SVG
  export, and git-backed editing exist; full
  visual whiteboard parity would need its own focused track.
- **Branches-for-drafts.** "Start a draft" creates a git branch; "publish draft" merges to main. Could be magical for long-form writing.
- **Real-time multi-user** via CRDT. Probably a fork, not core.
- **LLM integration** — summarize this note, find related notes semantically, generate a daily review. Opt-in, offline-first via Ollama.
- **Export to Obsidian** — Settings can download an Obsidian-ready vault ZIP;
  deeper ecosystem conversion remains outside the core claim.
- **Search dashboards.** Search now has ranked indexed results, operators,
  regex, folder grouping/facets, pagination, virtualization, and git-backed
  saved searches; richer dashboards can stay incremental.

## Non-goals

- **Full Canvas parity as core.** Diamond opens and edits `.canvas` boards for core node/edge workflows; full visual whiteboarding remains out of core unless the project explicitly takes on that track.
- **Hosted publish service.** We provide the static-site exporter; you bring the host (gh-pages, Cloudflare Pages, Vercel, Netlify, your own box). No proprietary hosting.
- **Native mobile apps.** Responsive web is the target. PWA install, yes. App Store listings, no.
- **Plugin runtime parity with Obsidian.** Their plugin API is huge. We keep ours small on purpose.
