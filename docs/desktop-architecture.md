# Diamond Markdown desktop: architecture

Status: draft, 2026-11-11. It describes the code on the
`desktop-rewrite` branch and the plan from here.

## Goal

Diamond is a Markdown knowledge-base app for macOS and Linux: notes are
plain files in a folder, linked to each other, with the tools to write,
find and connect them. It is native, fast and 100% open source (MIT).

Decided on 2026-11-10:

- Desktop app only. No browser app, no self-hosted server mode.
- No web technology in the app: no webview, no Electron, no Tauri.
- Rust throughout, with a GPU-rendered UI on GPUI (the framework Zed is
  built on).
- Written from scratch in this repository.
- Its own plugin system.
- Windows is out of scope for now.

Decided on 2026-11-11: **no crossover with Obsidian.** Diamond is a
competitor with the same kind of features, built independently.

- It does not read or write Obsidian's settings, its `.obsidian` folder or
  any other file that belongs to that app.
- It does not run, load or imitate Obsidian's plugins or themes.
- It has its own settings, its own conventions and its own plugin system.

Notes are plain Markdown files in a folder, linked with `[[wikilinks]]`.
Those are general conventions, not anything taken from another app.

## Clean-room rule

Everything here is written from scratch. We never copy, decompile or
reverse-engineer another app's code or styles, and we take no code from
other note-taking apps or reimplementations. Knowing what features people
expect from this kind of app comes from public documentation and ordinary
use, nothing else.

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
- Create never replaces an existing file; rename refuses to overwrite a
  different file; delete moves to the vault's trash, `.diamond/trash`.
- A watcher reports paths changed by any program.
- `VaultReader` does the symlink check once per folder for passes that read
  thousands of files.
- Listing skips dot-folders, such as `.git` and the vault's own `.diamond`
  folder, which holds its settings and its trash.

Not built yet: attachments, following symlinks inside the vault when
listing.

### diamond-parse

Reads one note and reports its properties (YAML frontmatter), headings,
links and embeds, tags, block ids and tasks, each with its position in the
source. It uses `pulldown-cmark` for Markdown structure, so links and tags
inside code are ignored correctly, and adds scanners for `#tags` and
`^block-ids`.

Not built yet: comments (`%%`), callouts, footnote and math metadata, and a
syntax tree for the editor.

### diamond-index

Holds every note's text and metadata and the graph between notes: where each
link leads, backlinks, unresolved links, tags including nested tags. The
link-matching rules are written at the top of `crates/diamond-index/src/lib.rs`.

- **Refresh.** After a change on disk the affected notes are re-read in one
  batch and links are re-resolved once. Nothing else is re-read.
- **Quick switch.** Fuzzy matching on titles, file names and aliases, ranked
  so initials and word starts beat scattered letters.
- **Search.** Terms, `"quoted phrases"`, `tag:` and `path:` filters, and
  `-` exclusions, scanned in parallel over the text held in memory.
- **Rename edits.** Before a rename or move, the new text of every note
  whose links would break. Only each link's target is rewritten.

The index is rebuilt from the files and stores nothing the files do not. It
keeps note text in memory, which costs about as much as the vault's Markdown
takes on disk and is what makes search fast.

Not built yet: a persisted cache for cold starts, a word index for very
large vaults.

### diamond-app

The window. Its code is split by what it knows about:

- `session.rs` holds the state that is not pixels: a `Session` is the
  vault, its index and its settings, and a `Document` is one open note. It
  has no UI types, so it is tested without a window. `history.rs`,
  `notes.rs` and `settings.rs` are the same kind of code: back and forward,
  daily notes and templates, settings files.
- `actions.rs` registers the shortcuts, and holds the two actions that work
  without a window: open a vault, and quit.
- `workspace/` is the view. `mod.rs` is what the window does, `panels.rs`
  how it is drawn, `tab.rs` what a tab and a pane hold, and `palette.rs`
  the palette that finds notes, text, commands and templates.
- `app.rs` is the state every window shares: the app's settings and whether
  it is drawn light or dark.
- `plugin.rs` is the plugin interface, and `plugins/` holds the core
  plugins built on it: the workbench (the window's own commands),
  properties, bookmarks, tasks, calendar, preview, graph, boards, canvas,
  tables, git and files.

The window has three panels: the file tree, the notes, and a context panel
with the backlinks, outline and tags of the note in front. The outline and
tags follow the editor as it is typed in. Clicking a heading puts the cursor
on it; clicking a tag lists the notes that carry it. A status line under the
notes shows what just happened or went wrong, the word and character
counts, and the switches for reading view and light or dark.

Notes open in tabs, and tabs sit in panes side by side. Each tab has its
own editor, its own back-and-forward history and its own choice of editing
or reading. Opening a note that already has a tab goes to that tab. Split
right opens a second view of the same note; what is typed in one view shows
in the other at once, each keeping its own cursor. Leaving a tab saves it,
and closing the window or quitting saves every tab.

| Shortcut (Cmd on macOS, Ctrl on Linux) | Does |
| --- | --- |
| Cmd-Shift-P | Command palette: every command, with its shortcut |
| Cmd-O | Go to a note by name |
| Cmd-Shift-F | Search all notes; Enter opens the note at the matching line |
| Cmd-N | New note |
| Cmd-T / Cmd-W | New tab / close tab |
| Ctrl-Tab / Ctrl-Shift-Tab | Next / previous tab |
| Cmd-\\ | Split right |
| F6 / Shift-F6 | Next / previous pane |
| Cmd-Shift-D | Open today's daily note, creating it from its template |
| Cmd-Shift-T | Insert a template at the cursor |
| F2 | Rename or move the open note; links to it are rewritten |
| Cmd-Alt-Left / Right (Alt-Left / Right on Linux) | Back and forward |
| Alt-Enter | Follow the link under the cursor, creating the note if it is missing |
| Cmd-E | Switch between editing and the rendered reading view |
| Cmd-S | Save now. Notes also save 800 ms after typing stops and when switching notes |
| Cmd-Shift-O | Open another vault in a new window |

Right-click a file or folder in the sidebar to open it in a new tab, make a
new note there, rename or move it, or delete it. Cmd-click a note to open it
in a new tab. A new name with a `/` in it is a path from the vault
root, which moves the entry. Renaming a folder moves every note in it.

Changes made by other programs show up live. If the open note changes on
disk while the editor has unsaved edits, the editor keeps them, autosave
stops, and leaving the note writes the edits to a "(conflict)" copy, so
neither version is lost.

Templates are the notes in the templates folder. Placeholders in double
braces are filled in when a template is inserted or a daily note is made
from it: `{{title}}`, `{{date}}`, `{{time}}`, `{{weekday}}`, `{{year}}`,
`{{month}}`, `{{day}}`, `{{yesterday}}`, `{{tomorrow}}`, and `{{date+7}}`
or `{{date-1}}` for a date some days away.

These features are plugins, reached from the command palette or the
context panel:

- **Properties.** The note's properties are listed in the context panel.
  Clicking one asks for its new value; an empty value removes it; the last
  row adds one.
- **Bookmarks.** Cmd-D bookmarks the note in front. The list is in the
  context panel and follows renames.
- **Tasks.** "Show tasks" lists every task in the vault in a tab. A task is
  an ordinary Markdown task item; `due:2026-11-20` in it gives it a due
  date. Dated tasks come first, overdue ones in red, and ticking a task in
  the list ticks it in its note.
- **Calendar.** "Show calendar" shows a month in a tab, with the days that
  have a daily note marked. Clicking a day opens its daily note, creating
  it from the template if needed.
- **Graph.** "Show graph" draws notes as dots and links as lines: the notes
  within two links of the note in front, or the whole vault (the 300
  best-connected notes when there are more). Clicking a dot opens its note.
- **Boards.** "Show this note as a board" shows any note as columns of
  cards: each `## Heading` is a column and each list item under it a card.
  Moving or adding a card rewrites only those lines of the note.
- **Canvas.** "New canvas" makes a surface for cards laid out freely, with
  lines between them. A card holds text or stands for a note. Cards are
  dragged by their top strip. A canvas is a file of its own,
  `Name.canvas.toml`, in a small TOML format described in
  `plugins/canvas.rs`; clicking it in the sidebar opens it.
- **Preview.** Cmd-Shift-E opens the note rendered in a pane beside its
  editor, following every keystroke.
- **Tables.** Commands insert a table, line up the columns of the table
  under the cursor, and add a row or a column.
- **Git.** Commands start keeping versions of the vault, save a version and
  sync with a remote, using the git that is installed.

A file that is not a note opens too: a picture in a tab, a canvas in its
view, and anything else in the app the system uses for it.

A fenced `query` block in a note is replaced, in the reading view, by the
table it computes. Its first lines choose notes in the search syntax; the
rest say what to show:

````
```query
tag:project -tag:done path:Work
show: title, status, due
sort: due desc
limit: 20
```
````

Columns are `title`, `name`, `path`, `folder`, `tags` or any property.

The editor highlights Markdown syntax (Tree-sitter) but does not render it
in place yet. The reading view renders the note with clickable wikilinks.

Run it with `cargo run -p diamond-app -- sample-vault` to open the vault in
this repository. Without a folder it reopens the last vault, or asks for one
the first time. A folder given as an argument (or in
`DIAMOND_VAULT`) takes precedence.

Not built yet: Markdown rendered in place in the editor, dragging tabs
between panes, splitting downwards, a settings screen, scrolling the
reading view to a heading (the outline switches to the editor for now).
Undo does not cross between two views of one note. A canvas does not yet
pan or zoom, and a note card does not follow its note when it is renamed.

### Settings

Diamond keeps its settings in two TOML files, written to be read and fixed
by hand (`crates/diamond-app/src/settings.rs`):

- A vault's settings are in `.diamond/settings.toml` inside the vault, so
  they travel with it.
- The app's settings (light or dark, for example) are in `settings.toml` in
  the platform's settings folder, beside the list of remembered vaults.

A missing key takes its default, so a file holds only what differs. A file
that cannot be parsed is reported and never overwritten; the defaults apply
until it is fixed.

```toml
# .diamond/settings.toml, showing the defaults
[daily]
folder = "Daily"       # daily notes are Daily/2026-11-11.md
template = "Daily"     # a name in the templates folder, or a path with a /

[templates]
folder = "Templates"
```

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

Today the app uses GPUI Kit's code editor as a plain text editor, with a
live preview in a pane beside it (Cmd-Shift-E). Live Preview proper,
Markdown that renders in place as you type, does not exist in any Rust
library. We build it: a Markdown-aware display layer over the text buffer
that hides markers off the cursor line and draws headings, links, embeds,
tables and checkboxes inline.

A starting point exists, and its limits are now clear. GPUI Kit's Markdown
renderer has an "editor host" interface (`gpui-base`, `text/editor_host.rs`):
an outside editor hands it a tree of rendered blocks and gets back, per
piece of text, the geometry needed for caret placement, hit-testing and
input. That is the rendering half only. By its own description the host
owns everything else: the document model, editing rules, cursor movement,
selection, undo, the clipboard and native input (IME). So Live Preview
means writing an editor, not configuring one. The order to build it in:

1. a document model that maps the Markdown source to rendered blocks and
   back, so every caret position has a source offset;
2. caret movement and selection over the rendered blocks;
3. typing, deleting and undo, each as an edit to the source;
4. revealing the raw Markdown of the block the caret is in;
5. native input, the clipboard and accessibility.

### Rendering that needs a native answer

With no web view to lean on, these each need a native implementation, in
rough order of difficulty:

- syntax highlighting in code blocks: Tree-sitter (straightforward)
- LaTeX math: a Rust math layout engine
- PDF viewing: a native PDF renderer
- Mermaid diagrams: no mature Rust implementation exists
- embedded web pages (iframes, the web viewer): not possible without a
  webview; out of scope

## Plugins

Features are modules. A plugin adds to the app only through one interface
(`crates/diamond-app/src/plugin.rs`):

- commands, which appear in the palette and can have a default shortcut;
- sections in the context panel, whose rows can open a note or run code;
- views that open in a tab, and opening files of a kind the plugin shows;
- a file of its own in the vault's `.diamond` folder;
- being told when a note is renamed or deleted;
- the window's own tools: a one-line prompt, editing the note in front the
  way typing would, and rewriting any note whether or not it is open.

Core plugins are Rust modules compiled into the app. They use nothing but
that interface, which keeps it honest. Every command in the app, the
window's own included, is added by a plugin. They all reach the palette and
the keyboard the same way: one list, one action, one handler in the window.

Third-party plugins come later as sandboxed WebAssembly modules. They are
written in any language that compiles to WebAssembly, get only the
capabilities the user grants, and draw UI through an API we define, since
there is no DOM to hand them.

### Core feature areas

Beyond the basics, these are built into Diamond as its own features, each a
core plugin on the interface above:

| Area | What it does |
| --- | --- |
| Templating | Templates with variables and date math (built) |
| Queries | Tables computed from notes and their properties (built) |
| Tasks | Tasks across the vault with due dates (built); recurrence (not yet) |
| Git sync | Versions and sync through git (built); browsing history (not yet) |
| Tables | Commands on Markdown tables (built); editing in a grid (not yet) |
| Calendar | A calendar of daily notes (built) |
| Kanban | Boards stored as Markdown (built); dragging cards (not yet) |

## Performance

Measured on an Apple M4 Mac mini, release build, with
`cargo run --release -p diamond-index --example bench_index -- 10000`:

| Measurement | Result |
| --- | --- |
| Index 10,000 notes (41.5 MB, 160,000 links) | about 105 ms |
| of which: list files / read and parse / resolve links | 17 / 74 / 15 ms |
| Re-resolve the vault after editing one note | about 15 ms |
| Full-text search across the 10,000 notes | 3 to 10 ms |
| Quick-switch ranking across the 10,000 notes | about 2 ms |
| Look up one note's backlinks | under 3 µs |
| Index the 12-note sample vault at app start | 2 ms |

Two findings shaped these numbers. Checking every file path for symlink
escapes cost a fifth of indexing until the check was made once per folder.
Search took 70 to 90 ms while it read files from disk; scanning text already
in memory brought it under 10 ms.

The files had just been written, so they were in the operating system's
cache. A first read from a cold disk will be slower and is not measured yet.

Targets still to measure: window visible in under 300 ms, typing latency,
search-as-you-type under 50 ms.

## Testing

210 tests so far; `cargo test --workspace` runs them all.

- Core crates (79): unit tests per crate, including symlink escapes, the
  file watcher and real vaults on disk.
- App logic (80): the session, history, daily notes and templates, settings
  files, the remembered-vaults list and each plugin's own logic, tested
  without a window. One of them opens `sample-vault` and checks that every
  feature it points at works on it.
- App UI (51): headless window tests on the real views.
  - With keystrokes: open, type, save and autosave; follow and create
    links; reload after outside edits and keep both versions in a conflict;
    the palette for notes, search, commands and templates; rename with
    links rewritten in every tab; back and forward; tabs and split panes;
    light and dark.
  - With the mouse, through the window's own hit testing: sidebar rows and
    their right-click menu, tabs, the buttons in the bars, every kind of row
    in the context panel, and the task, board, calendar, graph and canvas
    views, including dragging a card.
  - Layout: where the panels and panes are placed.

Dependencies: `scripts/release-age.py` lists locked dependencies published
in the last 14 days, and `--pin` moves them back to older releases. As of
2026-11-11, 818 of 825 locked packages are older than 14 days. The other
seven are the `wasm-bindgen` family, which is only compiled for the browser
target and is not part of the macOS or Linux build.

The rendered window has been looked at on the development Mac in both the
dark and the light appearance: the three panels, a note in the editor and
in the reading view, the command palette, tabs in two panes, the live
preview with a computed table, the calendar, the task list, a board, the
graph and a canvas.

Not verified: Linux. The app has never been built or run there. CI has a
Linux job, but it has not completed: on each run so far the runner could not
reach Ubuntu's package mirrors to install the system libraries.

## Milestones

0. **Foundation** (nearly done). Done: workspace, core crates, app shell,
   file watching, create, rename and delete, quick switcher, search, reading
   view, vault picker, settings, command palette, back and forward, daily
   notes, templates, benchmark. Left: CI for macOS and Linux.
1. **Core notes.** Markdown-aware editor with Live Preview and Reading view,
   clickable links, tabs and splits, command palette, quick switcher,
   full-text search, properties, settings, hotkeys, themes.
2. **Plugin interface and core plugins.** The module interface, then graph,
   Canvas, daily notes, templates, bookmarks, outline, page preview.
3. **Core feature areas.** The table above.
4. **Third-party plugins and release.** WebAssembly plugin host, signing and
   notarization, auto-update, Linux packages.

## Risks

- **GPUI stability.** No stable releases; we pin and upgrade deliberately.
- **Editor scope.** Live Preview is months of work, not weeks.
- **Web-library features.** Math, PDF and Mermaid each need a native answer.
- **Plugin ecosystem.** It starts at zero.

## Open decisions

- Sync model: git is built; whether anything else is offered beside it.
- What public `main` shows while the rewrite is in progress. `main` still
  holds the earlier web app, whose last version is also at tag
  `v1.0.0-rc.4`. This branch no longer contains it.
