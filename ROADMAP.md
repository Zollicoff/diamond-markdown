# Diamond Markdown — Roadmap

Version numbers signal feature parity, not stability. We're pre-1.0.

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
- [x] Outgoing links panel
- [x] Tag index page
- [x] Fuzzy quick-switcher
- [x] Full-text search
- [x] Git auto-commit on save (debounced)
- [x] Per-note history viewer (git log + diff)
- [x] Daily notes (auto-create from `Daily Notes/Template.md`, ⌘⇧D)

## v0.2 — Obsidian-core parity ✓ (shipped 2026-04-25)

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
- [x] Bookmarks (⌘⇧B, sidebar panel)
- [x] Recent notes panel
- [x] Light / Dark / Auto theme (⌘⇧L)
- [x] PWA manifest + theme-color + icons (home-screen install)
- [x] Excluded folders (per-vault)
- [x] Word count + reading time
- [x] State → URL sync (reload preserves position, links shareable)
- [x] Static-site publishing (`public: true` frontmatter, one-shot export)
- [x] Acknowledgments + ATTRIBUTION.md

## v0.3 — Polish & mobile

- [ ] Service worker for full offline use
- [ ] Mobile touch gestures (swipe to switch tabs / panes)
- [ ] Template picker upgrade (modal palette instead of `prompt()`)
- [ ] Light-mode highlight.js per-token theming
- [ ] Outline scroll inside Live mode (currently Read mode only)
- [ ] Settings page consolidation
- [ ] Multi-select / drag-select in graph

## v0.4 — Performance & scale

- [ ] Virtualized file tree for very large vaults
- [ ] Indexer warm-cache on disk for fast startup
- [ ] Quadtree-backed graph sim (drop O(n²) for very large vaults)
- [ ] Conflict resolution UI when pulling a remote that diverged

## v0.5 — Plugins & desktop

- [ ] Minimal plugin API (ES modules loaded at boot from `<vault>/.diamondmd/plugins/`)
- [ ] Plugin extension points: markdown extension, editor command, right-panel view, settings panel
- [ ] Sandboxed execution (iframes for UI; Worker for logic)
- [ ] Plugin registry page (load plugins from URL, not just disk)
- [ ] **Tauri v2 desktop wrapper** — wrap the existing web app for offline-first desktop, reuses 100% of current code; small Rust shim for filesystem + git. Lands on macOS / Windows / Linux without a rewrite.

Deliberately smaller plugin surface than Obsidian's — too much API = too much rewriting. Three or four extension points max.

## Open ideas (maybe, maybe not)

- **Branches-for-drafts.** "Start a draft" creates a git branch; "publish draft" merges to main. Could be magical for long-form writing.
- **Real-time multi-user** via CRDT. Probably a fork, not core.
- **LLM integration** — summarize this note, find related notes semantically, generate a daily review. Opt-in, offline-first via Ollama.
- **Export to Obsidian** — already true (we use the same wikilink syntax + flat markdown), but a one-click export package would be nice.

## Non-goals

- **Canvas.** Obsidian's visual whiteboarding. Not shipping. Folks who need it have Obsidian.
- **Hosted publish service.** We provide the static-site exporter; you bring the host (gh-pages, Cloudflare Pages, Vercel, Netlify, your own box). No proprietary hosting.
- **Native mobile apps.** Responsive web is the target. PWA install, yes. App Store listings, no.
- **Plugin runtime parity with Obsidian.** Their plugin API is huge. We keep ours small on purpose.
