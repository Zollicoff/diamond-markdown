# DiamondMD — Roadmap

Version numbers signal feature parity, not stability. We're pre-1.0.

## v0.1 — MVP

The non-negotiable minimum to replace a basic Obsidian workflow:

- [x] Repo scaffold, license, docs
- [x] Sample vault (ships in-repo)
- [ ] Vault registry (`~/.diamondmd/config.json`) — add / switch / remove
- [ ] File tree with folders, collapsible, click to open
- [ ] Create / rename / delete note from UI
- [ ] CodeMirror 6 editor with markdown syntax
- [ ] Split source + rendered preview
- [ ] Wikilink parser + resolver (basename, path, alias)
- [ ] Click a wikilink → navigates to that note
- [ ] Broken link styling (italic red) + click-to-create
- [ ] Frontmatter parser (title, tags, aliases, created, updated)
- [ ] Backlinks panel — every note that links to this one
- [ ] Outgoing links panel — every wikilink in this note
- [ ] Tag index page — list every tag + notes using it
- [ ] Fuzzy quick-switcher (Cmd-K / Ctrl-K) over note titles + aliases
- [ ] Full-text search (Cmd-Shift-F)
- [ ] Git auto-commit on save (debounced)
- [ ] Per-note history viewer (git log of the file)
- [ ] Daily notes (auto-create today's note from a template)

## v0.2 — Essentials

- [ ] Graph view (d3-force) — all notes, weighted by link density
- [ ] Themes (dark/light variants, maybe a "Solarized" and "Paper")
- [ ] Templates folder (`Templates/` dir with templater-like variables)
- [ ] Image embeds (`![[image.png]]`)
- [ ] PDF embeds
- [ ] Mobile polish — touch-friendly file tree + editor
- [ ] Settings page (theme, debounce, default template, keybindings)

## v0.3 — Live Preview

The headline UX feature:

- [ ] Obsidian-style live preview — markdown syntax hides when cursor leaves the line, renders inline while cursor is on that line
- [ ] Wikilinks render as pills inline (not raw `[[...]]`)
- [ ] Headers render inline with their sizing
- [ ] Inline images
- [ ] Code blocks with syntax highlighting in preview

This is where we stop looking like "yet another markdown editor" and start looking like a real Obsidian replacement.

## v0.4 — Publishing

- [ ] Publish a vault (or subset) as a static site
- [ ] Simple "publish" button that builds + pushes to a public repo / gh-pages / Cloudflare Pages
- [ ] Per-note `public: true` frontmatter gate

## v0.5 — Plugins

- [ ] Minimal plugin API (ES modules loaded at boot from `<vault>/.diamondmd/plugins/`)
- [ ] Plugin can register: markdown extension, editor command, right-panel view, settings panel
- [ ] Sandboxed execution (iframes for UI; Worker for logic)
- [ ] Plugin registry page (load plugins from URL, not just disk)

Deliberately smaller surface than Obsidian's plugin API — too much API = too much rewriting. Three extension points max.

## Open ideas (maybe, maybe not)

- **Branches-for-drafts.** "Start a draft" creates a git branch; "publish draft" merges to main. Could be magical for long-form writing.
- **Conflict resolution UI** when pulling a remote and two devices edited the same note.
- **Real-time multi-user** via CRDT. Probably a fork, not core.
- **LLM integration** — summarize this note, find related notes semantically, generate a daily review. Opt-in, offline-first via Ollama.
- **Export to Obsidian** — ensure our vault is 100% Obsidian-readable at all times (already true — we use the same wikilink syntax).

## Non-goals

- **Canvas.** Obsidian's visual whiteboarding. Not shipping. Ever. Folks who need it have Obsidian.
- **Electron wrapper.** We'll never ship a desktop binary. If someone wants to Tauri-wrap the web UI, that's their project.
- **Native mobile apps.** Responsive web is the target. PWA install, yes. App Store listings, no.
