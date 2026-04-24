# DiamondMD

> A self-hosted markdown knowledge base. Obsidian-style wikilinks, backlinks, and graph — but web-first (no Electron) and git-native for sync and history.

DiamondMD is a single SvelteKit app. Point it at a folder of `.md` files, get a full knowledge-base UI in any browser. Every save is a git commit, so your history is real, diffable, and portable — and syncing across devices is a `git push` away.

## Why

Obsidian is great. It's also Electron, its sync is proprietary and paid, and its plugin model locks you to their runtime. DiamondMD makes a different set of trade-offs:

- **Web-first.** Works on desktop, tablet, and phone browsers. Nothing to install per device.
- **Git-native versioning.** Every save is a commit. Real history, real diffs, real branches. Sync is just `git push` / `git pull` — no proprietary protocol.
- **Markdown files, flat on disk.** No lock-in. Uninstall DiamondMD tomorrow and your notes are still there.
- **Multi-vault from day one.** Different folders, different indexes, one app.
- **Open source (MIT).**

If you want Obsidian's plugin ecosystem and rich canvas view, stick with Obsidian. If you want the core `[[wikilink]]` + backlinks + search workflow in a browser with real version history, DiamondMD is for you.

## Status

Early. Pre-1.0. Active development. See [ROADMAP.md](./ROADMAP.md) for the feature plan.

The MVP ships a functional editor, file tree, wikilink resolution, backlinks, fuzzy search, and git auto-commit. Live preview (Obsidian-style WYSIWYG within the editor) is a v0.3 target — v0.1 ships with a source+preview split.

## Run

Requires Node 20+ and a folder of markdown files (or use the sample vault that ships with the repo).

```sh
git clone https://github.com/Zollicoff/diamondmd.git
cd diamondmd
npm install
npm run dev           # dev mode, http://localhost:5173
```

Or build and self-host:

```sh
npm run build
node build            # production server via adapter-node
```

By default, DiamondMD reads its vault registry from `~/.diamondmd/config.json` and ships with the in-repo `sample-vault/` registered. Point it at your own folder by editing the config or using the in-app vault manager.

## Concepts

- **Vault** — a folder of markdown files. Every vault is its own git repository (auto-initialized on first save).
- **Note** — a `.md` file inside a vault. The file's path within the vault is its identity.
- **Wikilink** — `[[Note Title]]` — resolves to another note in the same vault. Broken links render visibly so you can create missing notes.
- **Backlink** — automatically computed index of every note that wikilinks *to* the note you're viewing.
- **Tag** — `#hashtag` in body text or `tags:` in frontmatter. Tag index page lists every tag and the notes that use it.
- **Frontmatter** — YAML block at the top of a note (`--- ... ---`) with metadata. `title`, `aliases`, `tags`, `created`, `updated` are recognized.

## Features (MVP — v0.1)

- Vault manager: add / switch between multiple vaults
- File tree with folders, rename/move/delete
- CodeMirror 6 markdown editor with syntax highlighting
- Split source / rendered preview
- `[[Wikilink]]` parsing, clicking navigates, missing links styled as broken
- `#tag` parsing and a tags index page
- Frontmatter parsing (title, tags, aliases)
- Backlinks panel — every note linking to the open note
- Outgoing links panel
- Fuzzy quick-switcher (Cmd-K / Ctrl-K)
- Full-text search across the vault
- Git auto-commit on save, with log viewer per-note
- Daily notes (auto-creates today's note from template)

## Roadmap

See [ROADMAP.md](./ROADMAP.md) — summary:

- **v0.1** — MVP above
- **v0.2** — Graph view, themes, templates, improved mobile
- **v0.3** — Live preview (Obsidian-style WYSIWYG-within-editor via CodeMirror decorations)
- **v0.4+** — Publishing, simple plugin API via ES modules, richer git integration (branches-for-drafts)

## Architecture

Single SvelteKit app:

- Server (`src/lib/server/`) handles filesystem, git, indexing — never exposes raw paths, only vault-relative paths
- Client (`src/lib/components/`, `src/routes/`) is pure Svelte 5 runes, no external UI framework
- No database — all state derives from the filesystem; the backlink/tag index is rebuilt on file-watcher events
- [DESIGN.md](./DESIGN.md) has the details

## License

MIT. See [LICENSE](./LICENSE).

## Contributing

Early days — open an issue if you've got an idea or run into a bug. See [CONTRIBUTING.md](./CONTRIBUTING.md). Style: vanilla CSS (no Tailwind), TypeScript strict, Svelte 5 runes.

## Acknowledgments

DiamondMD is a clean-room implementation, but it stands on a lot of other people's work.

- **[Obsidian](https://obsidian.md)** — the UX model that defined modern personal knowledge bases. The wikilink / backlink / graph / live-preview / vault mental model that DiamondMD adopts is theirs. We use none of their code; we credit the shape of the idea.
- **[CodeMirror 6](https://codemirror.net)** (MIT) — the editor engine behind source and live-preview modes.
- **[Svelte](https://svelte.dev) & [SvelteKit](https://kit.svelte.dev)** (MIT) — framework.
- **[marked](https://marked.js.org)** (MIT) — markdown → HTML.
- **[DOMPurify](https://github.com/cure53/DOMPurify)** (MPL-2.0 / Apache-2.0) — HTML sanitization.
- **[jsdom](https://github.com/jsdom/jsdom)** (MIT) — DOM shim for server-side sanitization.
- **[simple-git](https://github.com/steveukx/git-js)** (MIT) — git wrapper for auto-commits and history.
- **[Fuse.js](https://fusejs.io)** (Apache-2.0) — fuzzy search.
- **[Lezer](https://lezer.codemirror.net)** (MIT) — incremental parsing behind CodeMirror's markdown language.

Full library list with license notices in [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md).
