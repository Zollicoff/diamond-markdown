# Diamond Markdown desktop: architecture

Status: draft, 2026-11-11. It describes the code on the
`desktop-rewrite` branch and the plan from here.

## Goal

A native desktop app for macOS and Linux that does what Obsidian does, is
100% open source (MIT) and is fast.

Decided on 2026-11-10:

- Desktop app only. No browser app, no self-hosted server mode.
- No web technology in the app: no webview, no Electron, no Tauri.
- Rust throughout, with a GPU-rendered UI on GPUI (the framework Zed is
  built on).
- Written from scratch in this repository.
- Its own plugin system. Obsidian's community plugins do not run here; the
  most-used ones are rebuilt as core plugins.
- Windows is out of scope for now.

Assumed, not yet confirmed: the vault format stays compatible with Obsidian
(the same Markdown files, wikilinks, properties, `.canvas` boards), so a vault
opens in either app.

## Clean-room rule

We work from public material only: Obsidian's public documentation and help
site, the JSON Canvas spec, and behaviour anyone can observe by using the
app. We never copy, decompile or reverse-engineer Obsidian's code or styles,
and we take no code from other reimplementations.

## Layers

```
crates/
  diamond-vault    file access                       built
  diamond-parse    note metadata                     built
  diamond-index    links, backlinks, tags            built
  diamond-app      the desktop app (binary: diamond) first shell built
```

Each core crate is a plain Rust library with no UI dependency and its own
tests. Only `diamond-app` depends on the UI stack.

### diamond-vault

The only code that touches the vault folder.

- `VaultPath`: a relative, normalized path that cannot contain `..`. The
  rest of the app names files only through it.
- `Vault::resolve` also rejects paths that leave the vault through a
  symlink.
- Writes are atomic: temporary file in the same folder, flush, rename.
- Listing skips dot-folders (`.git`, `.obsidian`, `.trash`).

Not built yet: file watching, rename and move, trash, attachments.

### diamond-parse

Reads one note and reports its properties (YAML frontmatter), headings,
links and embeds, tags, block ids and tasks, each with its position in the
source. It uses `pulldown-cmark` for Markdown structure, so links and tags
inside code are ignored correctly, and adds scanners for `#tags` and
`^block-ids`.

Not built yet: comments (`%%`), callouts, footnote and math metadata, and a
syntax tree for the editor.

### diamond-index

Holds every note's metadata and the graph between notes: where each link
leads, backlinks, unresolved links, tags including nested tags. The
link-matching rules are written at the top of `crates/diamond-index/src/lib.rs`.

The index is rebuilt from the files and stores nothing the files do not.
After an edit, the changed note is re-parsed and links are re-resolved from
metadata in memory; no other file is re-read.

Not built yet: full-text search, a persisted cache for cold starts, rename
rewrites.

### diamond-app

The window. `session.rs` holds the state that is not pixels (the vault, the
index, the open note) and has no UI types, so it is tested without a window.
`workspace.rs` is the view: file tree, editor, and a panel with the open
note's backlinks, outline and tags.

- Notes save on Cmd/Ctrl-S, 800 ms after the last keystroke, and when
  switching notes.
- Alt-Enter follows the link under the cursor. A link to a note that does
  not exist creates it, as in Obsidian.
- The editor highlights Markdown syntax (Tree-sitter). It does not render it
  in place yet.

Run it with `cargo run -p diamond-app -- <vault folder>`.

## UI stack

- **GPUI** renders the interface on the GPU (Metal on macOS; Vulkan-class
  APIs on Linux through its wgpu renderer).
- **GPUI Kit** (Longbridge, Apache-2.0) supplies the components: tree,
  resizable panels, lists and the text editor we start from.

Both are pinned to exact versions (`gpui-kit =0.8.1`, which pins GPUI
`0.3.10`). GPUI has no stable release line and its API changes between
versions, so every upgrade is a deliberate, tested step.

Zed's own editor, rope and Markdown crates are GPL-3.0 and are not used.

### The editor is the largest piece of work

Today the app uses GPUI Kit's code editor as a plain text editor. Obsidian's
Live Preview (Markdown that renders in place as you type) does not exist in
any Rust library. We build it: a Markdown-aware display layer over the text
buffer that hides markers off the cursor line and draws headings, links,
embeds, tables and checkboxes inline.

### Features that lean on web libraries in Obsidian

These need native replacements, in rough order of difficulty:

- syntax highlighting in code blocks: Tree-sitter (straightforward)
- LaTeX math: a Rust math layout engine
- PDF viewing: a native PDF renderer
- Mermaid diagrams: no mature Rust implementation exists
- embedded web pages (iframes, the web viewer): not possible without a
  webview; out of scope

## Plugins

Features are modules. A core plugin is a Rust module compiled into the app
that registers what it adds (commands, panels, views, settings, syntax)
through one plugin interface. The built-in features use the same interface,
which keeps it honest.

Third-party plugins come later as sandboxed WebAssembly modules, the approach
Zed uses for extensions. They are written in any language that compiles to
WebAssembly, get only the capabilities the user grants, and draw UI through
an API we define, since there is no DOM to hand them.

### Obsidian plugins to rebuild as core plugins

Proposed from Obsidian's public download counts (November 2026):

| Obsidian plugin | Downloads | Core plugin here |
| --- | --- | --- |
| Templater | 6.2M | Templates with variables and date math |
| Dataview | 5.3M | Queries over notes and properties |
| Tasks | 4.6M | Task queries, due dates, recurring tasks |
| Git | 3.4M | Git sync and history |
| Advanced Tables | 3.4M | Table editing |
| Calendar | 3.3M | Calendar view of daily notes |
| Kanban | 2.8M | Boards stored as Markdown |

Left out on purpose: Excalidraw (9.0M downloads) is a whole drawing
application and would be a project of its own; Copilot is an AI chat client;
Style Settings only makes sense for CSS themes.

## Performance

Measured on an Apple M4 Mac mini, release build, with
`cargo run --release -p diamond-index --example bench_index -- 10000`:

| Measurement | Result |
| --- | --- |
| Index 10,000 notes (41.5 MB, 160,000 links) | about 130 ms |
| of which: list files / read and parse / resolve links | 18 / 95 / 15 ms |
| Re-resolve the vault after editing one note | about 15 ms |
| Look up one note's backlinks | under 3 µs |
| Index the 12-note sample vault at app start | 2 ms |

The files had just been written, so they were in the operating system's
cache. A first read from a cold disk will be slower and is not measured yet.

Targets still to measure: window visible in under 300 ms, typing latency,
search-as-you-type under 50 ms.

## Testing

51 tests so far; `cargo test --workspace` runs them all.

- Core crates (42): unit tests per crate, including symlink escapes and a
  real vault on disk.
- App logic (5): `session.rs` tests without a window.
- App UI (4): headless window tests drive the real views. They open a note,
  type, save with the shortcut, wait out the autosave delay, switch notes,
  follow links, and measure where the three panels are laid out.

Dependencies: `scripts/release-age.py` lists locked dependencies published
in the last 14 days, and `--pin` moves them back to older releases. As of
2026-11-11, 818 of 825 locked packages are older than 14 days. The other
seven are the `wasm-bindgen` family, which is only compiled for the browser
target and is not part of the macOS or Linux build.

Not verified: how the app looks. It builds, starts and stays up on the development Mac, and
the headless tests confirm the panel layout and behaviour, but nobody has
looked at the rendered window yet.

## Milestones

0. **Foundation** (in progress). Done: workspace, core crates, app shell that
   opens a vault, shows the tree, edits and saves a note, follows links,
   benchmark. Left: file watching, vault picker, CI for macOS and Linux.
1. **Core notes.** Markdown-aware editor with Live Preview and Reading view,
   clickable links, tabs and splits, command palette, quick switcher,
   full-text search, properties, settings, hotkeys, themes.
2. **Plugin interface and core plugins.** The module interface, then graph,
   Canvas, daily notes, templates, bookmarks, outline, page preview.
3. **Rebuilt Obsidian plugins.** The table above.
4. **Third-party plugins and release.** WebAssembly plugin host, signing and
   notarization, auto-update, Linux packages.

## Risks

- **GPUI stability.** No stable releases; we pin and upgrade deliberately.
- **Editor scope.** Live Preview is months of work, not weeks.
- **Web-library features.** Math, PDF and Mermaid each need a native answer.
- **Plugin ecosystem.** It starts at zero.

## Open decisions

- Sync model: git, as in v1, or something else.
- What public `main` shows while the rewrite is in progress.
- Whether the old web app's files are deleted on this branch now. They are
  still present; the last web version is preserved at tag `v1.0.0-rc.4`.
