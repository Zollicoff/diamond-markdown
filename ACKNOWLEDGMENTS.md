# Acknowledgments

DiamondMD is an original implementation, licensed MIT. It builds on other people's work and owes its conceptual model to earlier software. This file names the debts.

## Conceptual model

- **[Obsidian](https://obsidian.md)** — the UX vocabulary DiamondMD adopts (vaults, wikilinks, backlinks panel, graph view, live preview, daily notes) was popularized by Obsidian. DiamondMD contains no Obsidian code; it is a clean-room re-implementation of the *pattern*, not of the software.

If Obsidian is a good fit for your workflow, you should use Obsidian.

## Runtime dependencies

Every library we ship with runs under the license noted. License texts are bundled under `node_modules/<lib>/LICENSE*` when installed; this file is a human-readable index.

### Framework

- **[Svelte](https://svelte.dev)** — MIT — reactive UI framework.
- **[SvelteKit](https://kit.svelte.dev)** — MIT — full-stack meta-framework + adapter-node for the production server.

### Editor

- **[CodeMirror 6](https://codemirror.net)** — MIT — editor engine. Specifically:
  - `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/search`, `@codemirror/state`, `@codemirror/view`, `codemirror`
- **[Lezer](https://lezer.codemirror.net)** — MIT — incremental parsers, including the markdown grammar behind `@codemirror/lang-markdown`.
  - `@lezer/highlight` and the transitive grammar packages.

### Markdown pipeline

- **[marked](https://marked.js.org)** — MIT — markdown → HTML.
- **[DOMPurify](https://github.com/cure53/DOMPurify)** — dual-licensed MPL-2.0 / Apache-2.0 — HTML sanitization applied server-side before the client receives rendered HTML.
- **[jsdom](https://github.com/jsdom/jsdom)** — MIT — DOM implementation the server-side DOMPurify call runs against.

### Storage / search

- **[simple-git](https://github.com/steveukx/git-js)** — MIT — wraps `git` for auto-commits on save, rename commits, and the per-file history viewer.
- **[Fuse.js](https://fusejs.io)** — Apache-2.0 — fuzzy match scoring for the quick switcher and command palette.

### Build tooling

- **[Vite](https://vitejs.dev)** — MIT — dev server + bundler (via SvelteKit).
- **[TypeScript](https://www.typescriptlang.org)** — Apache-2.0.

## Fonts

- **[Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque)** — SIL Open Font License 1.1 — used for the Wordmark and headings. Loaded from Google Fonts at runtime; not redistributed.

## How to add attribution when extending DiamondMD

If you add a new runtime dependency, copy the format above: library, license, one-line description of what it does for us. If a dependency's license requires in-product notice (Apache-2.0 has NOTICE requirements, for example), mirror that notice here.
