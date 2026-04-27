# Diamond Markdown

> A self-hosted markdown knowledge base. Obsidian-style wikilinks, backlinks, graph, and live preview — but web-first (no Electron) and git-native for sync and history.

Diamond Markdown is a single SvelteKit app. Point it at a folder of `.md` files, get a full knowledge-base UI in any browser. Every save is a git commit, so your history is real, diffable, and portable — and syncing across devices is a `git push` away.

Marketing site: [diamondmarkdown.com](https://diamondmarkdown.com)

## Why

Obsidian is great. It's also Electron, its sync is proprietary and paid, and its plugin model locks you to their runtime. Diamond Markdown makes a different set of trade-offs:

- **Web-first.** Works on desktop, tablet, and phone browsers. Nothing to install per device. PWA install gets you a home-screen icon.
- **Git-native versioning.** Every save is a commit. Real history, real diffs, real branches. Sync is just `git push` / `git pull` — no proprietary protocol.
- **Markdown files, flat on disk.** No lock-in. Uninstall Diamond Markdown tomorrow and your notes are still there.
- **Multi-vault from day one.** Different folders, different indexes, one app.
- **Open source (MIT).**

If you want Obsidian's plugin ecosystem and Canvas, stick with Obsidian. If you want the core wikilink + backlink + graph + live-preview workflow in a browser with real version history, Diamond Markdown is for you.

## Status

Pre-1.0, active development. v0.2 is feature-complete against Obsidian's core (math, mermaid, code highlighting, footnotes, embeds, hover preview, outline, themes, templates, bookmarks, recent notes, PWA, daily notes, static publish). See [ROADMAP.md](./ROADMAP.md) for the plan.

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

On first run, Diamond Markdown copies the bundled `sample-vault/` to `~/Documents/Diamond Markdown` and registers it as your default vault. Override with the `DIAMOND_DEFAULT_VAULT_DIR` environment variable, or add more vaults from the in-app vault manager. Your data lives in your home directory; the repo is the program.

## Concepts

- **Vault** — a folder of markdown files. Every vault is its own git repository (auto-initialized on first save).
- **Note** — a `.md` file inside a vault. The file's path within the vault is its identity.
- **Wikilink** — `[[Note Title]]` resolves to another note in the same vault. `[[Note#Heading]]` deep-links to a heading. Broken links render visibly so you can create missing notes.
- **Note embed** — `![[Note]]` renders the target note inline (cycle-safe).
- **Image embed** — `![[image.png]]` for images stored in the vault.
- **Backlink** — automatically computed index of every note that wikilinks *to* the note you're viewing.
- **Tag** — `#hashtag` in body text or `tags:` in frontmatter. Tag index lists every tag and the notes that use it.
- **Frontmatter** — YAML block at the top of a note (`--- ... ---`). `title`, `aliases`, `tags`, `created`, `updated`, `public` are recognized.

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
- Backlinks panel — every note linking to the open note
- Outgoing links panel
- Outline panel — headings of the active note, click to scroll

### Render pipeline
- Math (KaTeX, server-rendered) — `$inline$` and `$$block$$` (price-safe regex)
- Code highlighting (highlight.js, server-rendered, language auto-detect)
- Mermaid diagrams (lazy-loaded client-side)
- Footnotes — standard `[^1]` references with back-links
- Note embeds (`![[Note]]`), image embeds (`![[image.png]]`)

### Workspace
- Tabs + split panes (recursive layout tree)
- Polymorphic tabs: notes, graph, tags, search, settings
- File tree with folders, rename / move / delete, drag-drop
- Bookmarks panel (per-vault, ⌘⇧B to toggle)
- Recent notes panel
- Light / Dark / Auto theme (⌘⇧L to cycle)

### Search
- Fuzzy quick-switcher
- Full-text search across the vault
- Command palette (⌘P)

### Graph view
- Force-directed graph of notes + links
- App-style tab — opens beside notes, doesn't replace them
- Drag nodes to pin, click to open in new tab, alt-click for new pane
- Tunable forces panel: node size, repel, link force, link distance, center force (per-vault persisted)
- Filters: hide orphans, search by name/path

### Tags
- `#tag` and frontmatter tags
- Tag index page

### Versioning
- Git auto-commit on save (debounced, per-vault repo)
- Per-note history viewer with diff

### Daily notes
- ⌘⇧D opens today's `Daily Notes/YYYY-MM-DD.md`
- Optional `Daily Notes/Template.md` with `{{date}}` / `{{time}}` substitutions

### Templates
- General templates from `Templates/` folder, ⌘⇧T to insert
- Variables: `{{date}}`, `{{time}}`, `{{title}}`

### Excluded folders
- Per-vault folder ignore list (right-click a folder → Exclude from index)

### Publishing
- `public: true` frontmatter opts a note in
- One-shot static-site export to `<vault>/.diamond-publish/` — deploy-ready HTML + CSS, public-to-public wikilinks rewritten, private-target links broken intentionally

### PWA
- Installable on mobile / desktop, offline manifest, theme-color, custom icons

## Roadmap

See [ROADMAP.md](./ROADMAP.md) — summary:

- **v0.1** ✓ MVP shipped 2026-04-22
- **v0.2** ✓ Obsidian-core parity shipped 2026-04-25
- **v0.3** — Polish, service worker, mobile gestures
- **v0.4** — Refinements + perf (large vaults)
- **v0.5** — Plugin API, Tauri desktop wrapper

## Architecture

Single SvelteKit app:

- Server (`src/lib/server/`) handles filesystem, git, indexing — never exposes raw paths, only vault-relative paths
- Client (`src/lib/components/`, `src/routes/`) is pure Svelte 5 runes, vanilla CSS, no external UI framework
- Command registry (`src/lib/commands/`) — every user action registers with `{id, title, icon, shortcut, exec, when}`
- Typed event bus (`src/lib/events.ts`) — `note:saved`, `note:renamed`, etc. Decouples panes / panels / index.
- No database — all state derives from the filesystem; the backlink/tag index is rebuilt on file-watcher events
- [DESIGN.md](./DESIGN.md) has the details

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

Open an issue if you've got an idea or run into a bug. See [CONTRIBUTING.md](./CONTRIBUTING.md). Style: vanilla CSS (no Tailwind), TypeScript strict, Svelte 5 runes.

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
