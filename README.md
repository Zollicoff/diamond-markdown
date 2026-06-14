# Diamond Markdown

> A self-hosted markdown knowledge base. Obsidian-style wikilinks, backlinks, unlinked mentions, graph, and live preview — but web-first (no Electron) and git-native for sync and history.

Diamond Markdown is a single SvelteKit app. Point it at a folder of `.md` files, get a full knowledge-base UI in any browser. Every save is a git commit, so your history is real, diffable, and portable — and syncing across devices is a safe Settings action or `git push` away.

Marketing site: [diamondmarkdown.com](https://diamondmarkdown.com)

## Why

Obsidian is great. It's also Electron, its sync is proprietary and paid, and its plugin model locks you to their runtime. Diamond Markdown makes a different set of trade-offs:

- **Web-first.** Works on desktop, tablet, and phone browsers. Nothing to install per device. PWA install gets you a home-screen icon.
- **Git-native versioning.** Every save is a commit. Real history, real diffs, real branches. Sync uses ordinary `git fetch`, fast-forward pull, and push semantics — no proprietary protocol.
- **Markdown files, flat on disk.** No lock-in. Uninstall Diamond Markdown tomorrow and your notes are still there.
- **Portable exports.** Download an Obsidian-ready ZIP of the vault files from Settings when you want a clean handoff package.
- **Multi-vault from day one.** Different folders, different indexes, one app.
- **Open source (MIT).**

If you want Obsidian's full plugin ecosystem and full Canvas whiteboard parity, stick with Obsidian. If you want the core wikilink + backlink + graph + live-preview workflow, Canvas previews with markdown-aware text cards plus callouts, highlights, strikethrough, simple tables, resolved note/title/alias inline wikilinks and note embed chips, explicit Canvas links and embed chips, and safe vault-local asset embeds, zoomable node positioning/resizing/color/routing edits, and real version history in a browser, Diamond Markdown is for you.

## Status

Pre-1.0, active development. The core Obsidian-style note workflow is implemented: wikilinks, backlinks, graph, live preview, math, Mermaid, code highlighting, footnotes, embeds, hover preview, outline, themes, templates, bookmarks, recent notes, PWA app shell, daily notes, static publish, conservative GitHub sync, and broad Canvas compatibility. The remaining work is mainly around release automation, deeper Canvas polish, and intentionally scoped plugin/desktop/offline boundaries. See [ROADMAP.md](./ROADMAP.md) and [docs/obsidian-parity-audit.md](./docs/obsidian-parity-audit.md) for the current claim boundary.

## Run

Requires Node 20+ and a folder of markdown files (one is created for you on first run).

```sh
git clone https://github.com/Zollicoff/diamondmarkdown.git
cd diamondmarkdown
npm install
npm run dev           # dev mode, http://localhost:5173
```

Or build and self-host:

```sh
npm run build
node build            # production server via adapter-node
```

Desktop shell:

```sh
npm run build
npm run desktop:dev   # Tauri v2 shell, local loopback backend
```

On first run, Diamond Markdown copies the bundled `sample-vault/` to `~/Documents/Diamond Markdown` and registers it as your default vault. Override with the `DIAMOND_DEFAULT_VAULT_DIR` environment variable, or add more vaults from the in-app vault manager. Your data lives in your home directory; the repo is the program.

Production deployment guidance lives in [docs/self-hosting.md](./docs/self-hosting.md).
Release verification lives in [docs/release-checklist.md](./docs/release-checklist.md).
Vault-local plugin authoring notes live in [docs/plugins.md](./docs/plugins.md).
Desktop wrapper notes live in [docs/desktop.md](./docs/desktop.md).

## Concepts

- **Vault** — a folder of markdown files. Every vault is its own git repository (auto-initialized on first save).
- **Note** — a `.md` file inside a vault. The file's path within the vault is its identity.
- **Wikilink** — `[[Note Title]]` resolves to another note in the same vault. `[[Note#Heading]]` deep-links to a heading, and `[[Note#^block-id]]` deep-links to an Obsidian block ID. Broken links render visibly so you can create missing notes.
- **Note embed** — `![[Note]]` renders the target note inline (cycle-safe).
- **Attachment embed** — `![[image.png]]`, `![[audio.mp3]]`, `![[video.mp4]]`, `![[packet.pdf]]`, and other vault files render from local vault assets.
- **Callout** — Obsidian-style callouts such as `> [!NOTE]`, `> [!WARNING]-`, and `> [!TIP]+` render in read mode and static publish.
- **Backlink** — automatically computed index of every note that wikilinks *to* the note you're viewing.
- **Unlinked mention** — a note that mentions the current note's title, filename stem, or alias in plain text without making it a wikilink yet.
- **Tag** — `#hashtag` in body text or `tags:` in frontmatter. Tag index lists every tag and the notes that use it.
- **Frontmatter** — YAML block at the top of a note (`--- ... ---`). `title`, `aliases`, `tags`, `created`, `updated`, `public` are recognized, including Obsidian block-list `tags` and `aliases`.

## Features

### Editor
- CodeMirror 6 with markdown syntax highlighting
- **Live preview** — Obsidian-style: markdown markers hide off-line, wikilinks render as atomic pills inline, headings render with their sizing
- Source / Live / Read mode toggle per note
- Editor toolbar (bold, italic, headings, lists, code, etc.)
- Word count + reading time in status bar

### Linking & navigation
- `[[Wikilink]]` parsing with same-tab / new-tab (⌘) / new-pane (alt) modifier-aware clicks, in both Read and Live mode
- Right-click any wikilink for a context menu (Open / Open in new tab / Open in new pane / Copy path)
- Hover preview — mouseover a wikilink for a floating card with the target's first ~800 chars rendered through the same pipeline
- Heading anchors — every heading gets a stable id so `[[Note#Heading]]` deep-links work
- Obsidian block anchors — paragraph/list block IDs such as `^install-steps` become stable anchors for `[[Note#^install-steps]]` in Live Preview, Read mode, and static publish
- Backlinks panel — every note linking to the open note
- Unlinked mentions panel — notes that mention the open note title, filename stem, or alias without a wikilink
- Outgoing links panel
- Outline panel — headings of the active note, click to scroll

### Render pipeline
- Math (KaTeX, server-rendered) — `$inline$` and `$$block$$` (price-safe regex)
- Code highlighting (highlight.js, server-rendered, language auto-detect)
- Mermaid diagrams (lazy-loaded client-side)
- Footnotes — standard `[^1]` references with back-links
- Obsidian block IDs — trailing paragraph/list markers such as `^block-id` render as linkable anchors without showing the marker text
- Obsidian highlights — paired `==highlight==` spans render in Live Preview, Read mode, and static publish, including nested inline markdown
- Obsidian comments — paired `%% hidden %%` comments are hidden from Live Preview, Read mode, static publish, search/link/tag indexing, and Canvas text-card previews while remaining in source
- Note embeds (`![[Note]]`), image embeds (`![[image.png]]`, `![[image.png|300]]`, `![[image.png|300x200]]`)

### Workspace
- Tabs + split panes (recursive layout tree)
- Touch swipes switch adjacent tabs first, then adjacent panes at tab boundaries
- Polymorphic tabs: notes, graph, tags, search, settings
- File tree with folders, markdown notes, and Canvas files; rename / move / delete, drag-drop
- Attachment workflow: drop/paste uploads, existing-asset picker, multi-select insert, delete, and reference-safe rename/move organization
- Obsidian import support that preserves `.obsidian`, surfaces plugin, appearance, graph, core-plugin, and hotkey settings as migration guidance with known Diamond command mappings, imports note-level Obsidian bookmarks, and honors safe attachment/new-note/daily-note/link-style/line-number settings plus link-update preferences
- Obsidian export package from Settings that preserves vault files and `.obsidian` config while excluding Diamond metadata, generated publish output, and Git internals
- Obsidian Canvas previews for `.canvas` boards, with markdown-aware text-card previews including H1-H6 headings, thematic breaks, hidden Obsidian comments, callouts, highlights, strikethrough, simple tables, resolved note/title/alias inline wikilinks and note embed chips, explicit Canvas links and embed chips, and safe vault-local asset embeds, file-card heading/block subpaths, vault-asset file-card previews, zoom controls, SVG export, group rendering/label editing/creation, git-backed text-card editing, node positioning/resizing, node/edge color edits, and edge routing controls
- Bookmarks panel (per-vault, git-backed, ⌘⇧B to toggle)
- Recent notes panel
- Light / Dark / Auto theme (⌘⇧L to cycle)

### Search
- Fuzzy quick-switcher
- Ranked, index-backed full-text search across the vault with quoted phrases, field filters, exclusions, boolean `OR`, safe `/regex/` terms, folder-grouped results, folder facets, git-backed saved searches, paged loading, and virtualized results
- Command palette (⌘P)

### Graph view
- Force-directed graph of notes + links
- App-style tab — opens beside notes, doesn't replace them
- Drag nodes to pin, click to open in new tab, alt-click for new pane
- Shift-click or shift-drag to select multiple graph nodes
- Tunable forces panel: node size, repel, link force, link distance, center force (per-vault persisted)
- Filters: hide orphans, search by name/path

### Tags
- `#tag` and frontmatter tags
- Tag index page

### Versioning
- Git auto-commit on save (debounced, per-vault repo)
- Per-note history viewer with diff, snapshot copy, and git-backed restore
- Vault-local bookmarks and saved searches are stored under `.diamondmd/` so
  they follow ordinary GitHub sync with the vault
- GitHub sync panel in Settings — configure a GitHub remote, run safe one-click sync, check reachability, fetch status, pull fast-forward updates, and push local commits

### Daily notes
- ⌘⇧D opens today's daily note, defaulting to `Daily Notes/YYYY-MM-DD.md`
- Safe Obsidian Daily Notes settings in `.obsidian/daily-notes.json` are reused
  for folder, template, and date-format paths
- Optional templates support `{{date}}`, `{{time}}`, `{{title}}`, and
  `{{cursor}}` substitutions

### Templates
- General templates from `Templates/` or a safe Obsidian-configured Templates
  folder, ⌘⇧T to insert
- Safe `.obsidian/templates.json` folder plus default date/time formats are
  reused for the insert-template picker
- Variables: `{{date}}`, `{{time}}`, `{{title}}`, `{{cursor}}`

### Excluded folders
- Per-vault folder ignore list (right-click a folder → Exclude from index)

### Publishing
- `public: true` frontmatter opts a note in
- One-shot static-site export to `<vault>/.diamond-publish/` — deploy-ready HTML + CSS, public-to-public wikilinks rewritten, private-target links broken intentionally, local images copied to `images/`, and non-image attachments copied to `assets/`

### PWA
- Installable on mobile / desktop, offline manifest, theme-color, custom icons
- Service worker caches the app shell and immutable static assets. Vault APIs
  stay network/server-backed so note and git state do not go stale silently.

### Self-hosting
- Optional `DIAMOND_READ_ONLY=true` mode for browse-only demos: read APIs stay
  available while write APIs return `403`
- Designed for localhost, Tailscale/private networks, or authenticated reverse
  proxy deployment
- Optional `DIAMOND_BASIC_AUTH=user:password` guard for simple single-user
  self-hosted installs; no multi-user auth or per-vault authorization yet

### Desktop
- Tauri v2 shell in `src-tauri/`
- Starts the existing built SvelteKit/Node backend on loopback, waits for it,
  then opens a native desktop webview to the local app
- Supports attaching to an already-running backend with `DIAMOND_SERVER_URL`
- Supports current-platform self-contained builds via
  `npm run desktop:build:self-contained`, which prepares a Node sidecar and
  bundles it through Tauri
- `npm run verify:desktop-release` checks current-host bundle inputs before
  building; the release verifier uses a cross-platform preview launcher, and
  the GitHub Actions desktop workflow builds unsigned bundle artifacts plus
  per-platform SHA-256 artifact manifests across the configured matrix. The
  signed release plan is in
  [docs/desktop-release.md](./docs/desktop-release.md)

### Plugins
- Vault-local ESM plugins from `.diamondmd/plugins/<plugin-id>/`
- Manifest discovery in Settings
- Boot-time command registration for command-palette actions

## Roadmap

See [ROADMAP.md](./ROADMAP.md) — summary:

- **v0.1** ✓ MVP shipped 2026-04-22
- **v0.2** ✓ Obsidian-style core notes workflow shipped 2026-04-25
- **v0.3** ✓ Polish, service worker, mobile gestures
- **v0.4** ✓ Git sync and large-vault scale work
- **v0.5** Partial — plugin API, Tauri desktop wrapper, current-host sidecar-ready desktop runtime, and unsigned desktop artifact CI are present; signed cross-platform release publishing remains open

The open-source replacement track is broken out in
[OPEN_SOURCE_OBSIDIAN_PLAN.md](./OPEN_SOURCE_OBSIDIAN_PLAN.md).

## Architecture

Single SvelteKit app:

- Server (`src/lib/server/`) handles filesystem, git, indexing — never exposes raw paths, only vault-relative paths
- Desktop (`src-tauri/`) wraps the same server app in Tauri and launches it on
  loopback for local desktop use
- Sync (`src/lib/server/git-sync.ts`) wraps remote Git operations with remote health checks, safe one-click sync, clean-worktree guidance, fast-forward pulls, divergence guards, and write blocking when the last fetched remote is behind or diverged
- Client (`src/lib/components/`, `src/routes/`) is pure Svelte 5 runes, vanilla CSS, no external UI framework
- Command registry (`src/lib/commands/`) — every user action registers with `{id, title, icon, shortcut, exec, when}`
- Plugin runtime (`src/lib/plugins/`) — vault-local manifests and ESM modules register scoped commands at vault boot
- Typed event bus (`src/lib/events.ts`) — `note:saved`, `note:renamed`, etc. Decouples panes / panels / index.
- No database — all state derives from the filesystem; the backlink/tag index is rebuilt on file-watcher events
- [DESIGN.md](./DESIGN.md) has the details

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

Open an issue if you've got an idea or run into a bug. See [CONTRIBUTING.md](./CONTRIBUTING.md). Style: vanilla CSS (no Tailwind), TypeScript strict, Svelte 5 runes.

Security model and reporting guidance live in [SECURITY.md](./SECURITY.md).
Self-hosting hardening guidance lives in [docs/self-hosting.md](./docs/self-hosting.md).

## Acknowledgments

Diamond Markdown is a clean-room implementation, but it stands on a lot of other people's work.

- **[Obsidian](https://obsidian.md)** — the UX model that defined modern personal knowledge bases. The wikilink / backlink / graph / live-preview / vault mental model that Diamond Markdown adopts is theirs. We use none of their code; we credit the shape of the idea.
- **[CodeMirror 6](https://codemirror.net)** (MIT) — the editor engine behind source and live-preview modes.
- **[Svelte](https://svelte.dev) & [SvelteKit](https://kit.svelte.dev)** (MIT) — framework.
- **[marked](https://marked.js.org)** (MIT) + **[marked-footnote](https://github.com/bent10/marked-extensions)** — markdown → HTML.
- **[KaTeX](https://katex.org)** (MIT) — math.
- **[highlight.js](https://highlightjs.org)** (BSD-3) — code highlighting.
- **[Mermaid](https://mermaid.js.org)** (MIT) — diagrams.
- **[DOMPurify](https://github.com/cure53/DOMPurify)** (MPL-2.0 / Apache-2.0) — HTML sanitization.
- **[jsdom](https://github.com/jsdom/jsdom)** (MIT) — DOM shim for server-side sanitization.
- **[simple-git](https://github.com/steveukx/git-js)** (MIT) — git wrapper for auto-commits and history.
- **[Fuse.js](https://fusejs.io)** (Apache-2.0) — fuzzy search.
- **[Lezer](https://lezer.codemirror.net)** (MIT) — incremental parsing behind CodeMirror's markdown language.

Full library list with license notices in [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md).
