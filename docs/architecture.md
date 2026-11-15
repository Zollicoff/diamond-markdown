# Architecture

How Diamond is built, and why. For how to use it, see [the guide](guide.md).

## What Diamond is

A Markdown knowledge-base app for macOS and Linux. Notes are plain Markdown
files in a folder, linked with `[[wikilinks]]`, with the tools to write,
find and connect them. It is native, fast and open source (MIT).

These decisions shape everything else:

- **Desktop only.** No browser app and no server.
- **No web technology** in the app: no web view, no bundled browser.
- **Rust throughout**, with the interface drawn on the GPU by GPUI.
- **Written from scratch.** Nothing is copied, decompiled or
  reverse-engineered from another app, and no code comes from other
  note-taking apps or reimplementations of them. What people expect from an
  app of this kind is learned from public documentation and ordinary use.
- **Its own conventions.** Diamond is an independent competitor to apps like
  Obsidian, not a companion to them. It does not read or write another app's
  settings or files, does not run or imitate another app's plugins or
  themes, and adds no feature for the sake of compatibility. Plain Markdown
  files and `[[wikilinks]]` are general conventions, not anything borrowed.
- **Its own plugin system.**
- **Windows is out of scope** for now.

## Crates

```
crates/
  diamond-vault   file access
  diamond-parse   what one note contains
  diamond-index   the vault as a whole
  diamond-app     the desktop app (binary: diamond)
```

The first three are plain Rust libraries with no UI dependency and their own
tests. Only `diamond-app` depends on the UI stack.

### diamond-vault

The only code that touches the vault folder.

- `VaultPath` is a relative, normalized path that cannot contain `..`. The
  rest of the app names files only through it.
- `Vault::resolve` also rejects a path that leaves the vault through a
  symlink.
- Writes are atomic: a temporary file in the same folder, flushed, then
  renamed over the target.
- Create never replaces an existing file, rename refuses to overwrite a
  different file, and delete moves to the vault's trash, `.diamond/trash`.
- A watcher reports paths changed by any program.
- `VaultReader` does the symlink check once per folder, for passes that read
  thousands of files.
- Listing skips anything whose name starts with a dot, such as `.git` and
  the vault's own `.diamond` folder, and does not follow symlinks.

### diamond-parse

Reads one note and reports its properties (the YAML block at the top),
headings, links and embeds, tags, block ids and tasks, each with its
position in the source. It uses `pulldown-cmark` for Markdown structure, so
links and tags inside code are ignored correctly, and adds its own scanners
for `#tags` and `^block-ids`.

Not built: comments, callouts, footnote and maths metadata, and a syntax
tree for an editor.

### diamond-index

Holds every note's text and metadata, and the graph between notes: where
each link leads, backlinks, unresolved links and tags. The rules for how a
link finds its note are written at the top of `src/lib.rs`.

- **Refresh.** After a change on disk the affected notes are re-read in one
  batch and links are re-resolved once.
- **Go to note.** Fuzzy matching on titles, file names and aliases, ranked
  so that initials and word starts beat scattered letters (`fuzzy.rs`).
- **Search.** Terms, quoted phrases, `tag:` and `path:` filters and `-`
  exclusions, scanned in parallel over the text held in memory
  (`search.rs`).
- **Queries.** Tables computed from notes and their properties, chosen with
  the search syntax (`query.rs`).
- **Rename edits.** Before a rename or move, the new text of every note
  whose links would otherwise break. Only each link's target is rewritten
  (`rename.rs`).
- **Revision.** A number that changes with every change to the index, so a
  view computed from it can tell cheaply whether to compute again.

The index is rebuilt from the files and stores nothing the files do not. It
keeps note text in memory, which costs about as much as the vault's Markdown
takes on disk and is what makes search fast.

Not built: a cache on disk for cold starts, and a word index for very large
vaults.

### diamond-app

```
src/
  main.rs          opening vaults and windows
  actions.rs       shortcut registration; the two app-wide actions
  app.rs           what every window shares: settings, light or dark
  session.rs       one open vault and the notes open from it
  history.rs       back and forward
  notes.rs         daily notes, templates, task boxes, word counts
  settings.rs      the two settings files
  recent.rs        the list of vaults opened before
  plugin.rs        the plugin interface
  plugins/         the features, one module each
  docs.rs          tests that keep the documentation true
  workspace/
    mod.rs         what the window does
    panels.rs      how it is drawn
    tab.rs         what a tab and a pane hold
    palette.rs     the palette for notes, search, commands and templates
    tests.rs       window tests, with the keyboard
    tests/clicks.rs  window tests, with the mouse
```

**State without pixels.** A `Session` is the vault, its index and its
settings. A `Document` is one open note: where it is and its text as last
read or saved. Neither has UI types, so `session.rs`, `history.rs`,
`notes.rs` and `settings.rs` are all tested without a window.

**The window.** `Workspace` owns the session, the panes and whatever is
shown over the window (the palette or a one-line prompt). A pane is a row of
tabs. A tab holds a note with its own editor, history and unsaved state, or
a plugin's view, or nothing.

**Saving and the disk.** A note is written 800 ms after the last keystroke,
when its tab is left, when the window closes and when the app quits. When
the watcher reports a change, each open note is compared with its file:

- unchanged in the editor: the new text is shown;
- changed in the editor too: the editor keeps its text, autosave stops, and
  the tab is marked as in conflict. Saving then keeps the editor's version;
  leaving writes it to a `(conflict)` copy so that neither is lost.

Two tabs on the same note mirror each keystroke, so they never conflict
with each other. A rename saves every tab first, because links are rewritten
in each note's saved text, and then every tab follows its note to the new
path and text.

**One command path.** Every command, the window's own included, is added by
a plugin. `actions.rs` binds each command's shortcut to a single action,
`RunCommand`, which the window handles in one place. The palette lists the
same commands. Opening a vault and quitting are also actions of their own,
because they must work when no vault window has the keyboard.

## Plugins

A feature is a plugin: a module in `src/plugins` that adds to the app only
through the interface in `plugin.rs`.

| A plugin can | Through |
| --- | --- |
| add commands, each with an optional default shortcut | `Plugin::commands` |
| add sections to the context panel | `Plugin::sections` |
| show a view of its own in a tab | `Workspace::open_view` |
| open a kind of file that is not a note | `Plugin::opener` |
| keep a file of its own in the vault's `.diamond` folder | `Plugin::load`, `Plugin::store` |
| follow renames and deletes | `Plugin::renamed`, `Plugin::removed` |

The window lends plugins its own tools: the session, a one-line prompt
(`prompt`), a status message (`note`, `report`), editing the note in front
the way typing would (`edit_note`), and rewriting any note whether or not
it is open (`rewrite_note`).

The core plugins, in the order their commands are listed:

| Plugin | File | What it adds |
| --- | --- | --- |
| Workbench | `workbench.rs` | the window's own commands: notes, moving around, tabs and panes, appearance |
| Properties | `properties.rs` | the note's properties in the context panel |
| Bookmarks | `bookmarks.rs` | a list of notes kept one click away |
| Tasks | `tasks.rs` | every task in the vault in one list |
| Calendar | `calendar.rs` | a month of daily notes |
| Preview | `preview.rs` | the rendered note beside its editor |
| Graph | `graph.rs` | notes as dots, links as lines |
| Boards | `board.rs` | a note as columns of cards |
| Canvas | `canvas.rs` | cards placed freely, in a file of their own |
| Tables | `tables.rs` | commands on the table under the cursor |
| Git | `git.rs` | versions and sync |
| Files | `files.rs` | pictures in a tab, other files in their own app |

### Adding one

```rust
// crates/diamond-app/src/plugins/census.rs
use crate::plugin::{Command, Plugin};

#[derive(Default)]
pub struct Census;

impl Plugin for Census {
    fn id(&self) -> &'static str {
        "census"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "Count the notes in this vault",
            &["how many", "size"],
            |workspace, _window, cx| {
                let notes = workspace.session().graph().notes.len();
                workspace.note(format!("{notes} notes"), cx);
            },
        )]
    }
}
```

Then add `pub mod census;` and `Box::new(census::Census)` to
`plugins/mod.rs`, and a row for the command to the table in the guide. A
test fails until the guide lists it.

Two rules a plugin's view has to keep:

- It must not ask for the window while the window is running its callback.
  Inside a command or a prompt's answer, use the `Workspace` that is handed
  in.
- If it is computed from notes, it recomputes when the index's revision
  changes, not every time the window redraws.

### Plugins from outside

Not built. The plan is sandboxed WebAssembly modules, written in any
language that compiles to it, given only the capabilities the user grants,
and drawing through an API Diamond defines, since there is no web page to
hand them.

## UI stack

- **GPUI** draws the interface on the GPU: Metal on macOS, and its wgpu
  renderer on Linux.
- **GPUI Kit** (Longbridge, Apache-2.0) supplies the components: the tree,
  resizable panels, lists, tabs, the text editor and the Markdown renderer.

Both are pinned to exact versions (`gpui-kit =0.8.1`, which pins GPUI
0.3.10). GPUI has no stable release line and its API changes between
versions, so every upgrade is a deliberate, tested step.

Zed's own editor, rope and Markdown crates are GPL-3.0 and are not used.

### The editor, and rendering in place

Today the editor is GPUI Kit's code editor used as a plain text editor,
with the rendered note available in the reading view or in a pane beside
it. Markdown that renders in place as you type does not exist in any Rust
library, so it has to be built: a display layer over the text that hides
the markers away from the cursor and draws headings, links, embeds, tables
and task boxes inline.

There is a starting point, with clear limits. GPUI Kit's Markdown renderer
has an "editor host" interface (`gpui-base`, `text/editor_host.rs`). An
outside editor hands it a tree of rendered blocks and gets back, for each
piece of text, the geometry needed to place a caret, hit-test a click and
position input. That is the rendering half only. By its own description the
host owns the rest: the document model, editing, cursor movement,
selection, undo, the clipboard and native input. So this means writing an
editor, not configuring one. The order to build it in:

1. a document model that maps the Markdown source to rendered blocks and
   back, so that every caret position has a source offset;
2. caret movement and selection over the rendered blocks;
3. typing, deleting and undo, each as an edit to the source;
4. showing the raw Markdown of the block the caret is in;
5. native input, the clipboard and accessibility.

### Rendering that needs a native answer

With no web view to lean on, each of these needs a native implementation,
in rough order of difficulty:

- typeset maths: a Rust maths layout engine (today maths is shown as code);
- PDFs: a native PDF renderer;
- diagrams written as text: no mature Rust implementation exists;
- embedded web pages: not possible without a web view, and out of scope.

## Performance

Measured on an Apple M4 Mac mini on 2026-11-14, release build, with
`cargo run --release -p diamond-index --example bench_index -- 10000`:

| Measurement | Result |
| --- | --- |
| Index 10,000 notes (41.5 MB, 160,000 links) | about 125 ms |
| of which: list files / read and parse / resolve links | about 20 / 85 / 19 ms |
| Re-resolve the vault after editing one note | about 20 ms |
| Full-text search across the 10,000 notes | 2 to 12 ms |
| Go-to-note ranking across the 10,000 notes | about 2 ms |
| Look up one note's backlinks | about 4 µs |

Two findings shaped these numbers. Checking every file path for a symlink
escape cost a fifth of indexing until the check was made once per folder.
Search took 70 to 90 ms while it read files from disk; scanning text already
in memory brought it under 12 ms.

The files had just been written, so they were in the operating system's
cache. A first read from a cold disk will be slower and has not been
measured.

Not measured yet: time until the window is visible, typing latency, and how
the window itself behaves with a very large vault.

## Testing

`cargo test --workspace` runs everything. Nothing needs a display.

- **Core crates.** Unit tests per crate, including symlink escapes, the file
  watcher and real vaults on disk.
- **App logic.** The session, history, daily notes and templates, the
  settings files and each plugin's own logic, tested without a window. The
  git plugin is tested against real temporary repositories, with a remote.
- **The window.** The real views in a headless window.
  - With the keyboard (`workspace/tests.rs`): typing, saving and autosave;
    following and creating links; outside edits and conflicts; the palette
    in each of its modes; renaming with links rewritten in every tab; back
    and forward; tabs and panes; each plugin's commands.
  - With the mouse (`workspace/tests/clicks.rs`), through the window's own
    hit testing: sidebar rows and their right-click menu, tabs, the buttons
    in the bars, every kind of row in the context panel, and the task,
    board, calendar, graph and canvas views, including dragging a card.
  - Layout: where the panels and panes are placed.
- **The sample vault.** A test opens `sample-vault` and checks that every
  feature its notes point at works on it.
- **The documentation.** `src/docs.rs` fails if a command or its shortcut is
  missing from the guide or listed there wrongly, if the settings shown in
  the guide are not the real defaults, if the README's list of Linux
  packages differs from the one CI installs, if a link between the
  documents is broken, or if a library is not named in
  `ACKNOWLEDGMENTS.md`.

CI (`.github/workflows/ci.yml`) runs rustfmt, clippy with warnings as errors
and the tests on macOS and on Ubuntu 24.04, and both pass.

What tests cannot show is how the window looks. It has been looked at on
macOS, in the dark and the light appearance, for each view. On Linux the app
compiles and its tests pass in CI, but nobody has yet looked at it on a
display there.

## Dependencies

A release must be at least 14 days old before it is locked, so that a bad
publish has time to be noticed. `scripts/release-age.py` lists locked
packages newer than that, and `--pin` moves them back to older releases. Run
it after any `cargo update`.

`ACKNOWLEDGMENTS.md` names the libraries Diamond is built on and their
licenses.

## Not built yet

The guide ends with the list of what is missing for someone using the app:
[Not built yet](guide.md#not-built-yet). The larger pieces, in rough order
of size:

1. **Rendering in place in the editor**, as set out above. This is the
   largest piece of work in the project.
2. **A settings screen**, changing shortcuts, and reopening the tabs that
   were open at the last quit.
3. **Plugins from outside the app.**
4. **Packaging:** signed and notarized builds for macOS, packages for Linux,
   and updates.

## Open decisions

- **What `main` shows.** `main` still holds the earlier web app, whose last
  version is also at tag `v1.0.0-rc.4`. This branch replaces it but has not
  been merged, and `main` is still the branch GitHub shows first.
- **The name on screen.** The app is called Diamond. The window title and
  the settings folder still say "Diamond Markdown", as the repository does.
- **Sync.** Git is built. Whether anything else is offered beside it is not
  decided.
