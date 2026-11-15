# Using Diamond

Diamond keeps your notes as plain Markdown files in a folder you choose,
called a vault. This guide covers everything the app does today. What is
missing is listed at the end.

- [Starting](#starting)
- [The window](#the-window)
- [Commands and shortcuts](#commands-and-shortcuts)
- [Writing notes](#writing-notes)
- [Finding notes](#finding-notes)
- [Files and folders](#files-and-folders)
- [Daily notes and templates](#daily-notes-and-templates)
- [Properties](#properties)
- [Tasks](#tasks)
- [Queries](#queries)
- [Boards](#boards)
- [Canvases](#canvases)
- [Calendar, graph and bookmarks](#calendar-graph-and-bookmarks)
- [Tables](#tables)
- [Versions and sync with git](#versions-and-sync-with-git)
- [Settings](#settings)
- [What Diamond keeps on disk](#what-diamond-keeps-on-disk)
- [Not built yet](#not-built-yet)

## Starting

There is no packaged release yet. From a copy of the repository:

```sh
cargo run -p diamond-app -- sample-vault     # the vault in the repository
cargo run -p diamond-app -- ~/Notes          # a folder of your own
cargo run -p diamond-app                     # the vault you opened last
```

Any folder can be a vault; Diamond adds nothing to it until you use a
feature that needs to keep something (see [What Diamond keeps on
disk](#what-diamond-keeps-on-disk)). With no folder given, Diamond reopens
the vault you opened last, and asks for a folder the first time. The
`DIAMOND_VAULT` environment variable names a vault the same way the argument
does.

To open another vault in a second window, run "Open another vault".

## The window

The window has three panels, and the two at the sides can be dragged wider
or narrower.

- **Sidebar**, on the left: the vault's folders and files. Click a note to
  open it. Cmd-click it (Ctrl-click on Linux) to open it in a new tab.
  Right-click anything for a menu: open in a new tab, new note here, rename
  or move, delete. The **+** at the top makes a new note.
- **Notes**, in the middle: tabs, and under them the note in front. The
  arrows go back and forward through the notes that tab has shown.
- **Context panel**, on the right, for the note in front: the notes that
  link to it, its outline, its tags, its properties and your bookmarks.
  Click a backlink to open that note, a heading to put the cursor on it, and
  a tag to list every note that carries it. The outline and tags follow what
  you type. If the note has links that lead to no note, the panel says how
  many.

Under the notes, a status line shows what just happened or went wrong, the
note's word and character counts, a switch between editing and reading, and
a switch between light and dark.

### Tabs and panes

Each tab has its own note, its own back-and-forward history and its own
choice of editing or reading. Opening a note that already has a tab goes to
that tab rather than opening it twice.

"Split right" opens a second pane showing the same note. What you type in
one view shows in the other at once, and each keeps its own cursor. Either
pane can then show a different note. Closing a pane's last tab closes the
pane. Closing the window's last tab leaves an empty one, and closing that
closes the window.

A tab can also hold something that is not a note: the task list, the
calendar, the graph, a board, a canvas or a picture.

### Editing and reading

The editor shows the Markdown as you wrote it, with its syntax coloured.
"Switch between editing and reading" shows the note rendered instead:
headings, lists, tables, task boxes, links you can click, pictures from the
vault, and the tables that [queries](#queries) compute. The reading view is
for reading: to change the note, switch back.

"Open a live preview to the side" gives you both at once: the editor on the
left and the rendered note on the right, following every keystroke.

### Saving

There is nothing to remember. A note is saved 0.8 seconds after you stop
typing, when you switch to another note or tab, when you close the window
and when you quit. "Save" saves at once. A dot before a tab's name means it
has changes that are not on disk yet.

If another program changes a note while you have it open, Diamond shows the
new version. If you had unsaved changes of your own at that moment, Diamond
keeps yours on screen, stops saving automatically and tells you in the
status line. Then:

- "Save" keeps your version.
- Leaving the note keeps both: the other program's version stays in the
  note, and yours goes into a copy beside it named `Note (conflict).md`.

## Commands and shortcuts

"Show every command" lists everything Diamond can do. Type a few letters to
narrow the list, then press Enter. This table is the same list.

<!-- commands -->
| Command | macOS | Linux |
| --- | --- | --- |
| New note | `Cmd-N` | `Ctrl-N` |
| Open today's daily note | `Cmd-Shift-D` | `Ctrl-Shift-D` |
| Insert template | `Cmd-Shift-T` | `Ctrl-Shift-T` |
| Go to note | `Cmd-O` | `Ctrl-O` |
| Search in all notes | `Cmd-Shift-F` | `Ctrl-Shift-F` |
| Show every command | `Cmd-Shift-P` | `Ctrl-Shift-P` |
| Go back | `Cmd-Alt-Left` | `Alt-Left` |
| Go forward | `Cmd-Alt-Right` | `Alt-Right` |
| Follow link under cursor | `Alt-Enter` | `Alt-Enter` |
| Switch between editing and reading | `Cmd-E` | `Ctrl-E` |
| New tab | `Cmd-T` | `Ctrl-T` |
| Close tab | `Cmd-W` | `Ctrl-W` |
| Next tab | `Ctrl-Tab` | `Ctrl-Tab` |
| Previous tab | `Ctrl-Shift-Tab` | `Ctrl-Shift-Tab` |
| Split right | `Cmd-\` | `Ctrl-\` |
| Next pane | `F6` | `F6` |
| Previous pane | `Shift-F6` | `Shift-F6` |
| Rename or move this note | `F2` | `F2` |
| Delete this note | | |
| Save | `Cmd-S` | `Ctrl-S` |
| Switch between light and dark | | |
| Follow the system's light or dark setting | | |
| Reload vault settings | | |
| Open another vault | `Cmd-Shift-O` | `Ctrl-Shift-O` |
| Quit | `Cmd-Q` | `Ctrl-Q` |
| Bookmark this note, or remove its bookmark | `Cmd-D` | `Ctrl-D` |
| Show tasks | | |
| Show calendar | | |
| Open a live preview to the side | `Cmd-Shift-E` | `Ctrl-Shift-E` |
| Show graph | | |
| Show this note as a board | | |
| New canvas | | |
| Insert table | | |
| Line up table columns | | |
| Add table row | | |
| Add table column | | |
| Git: save a version | | |
| Git: sync with the remote | | |
| Git: start keeping versions | | |
<!-- /commands -->

The shortcuts cannot be changed yet. Inside the editor, the usual keys for
moving, selecting, copying, pasting and undoing work as they do elsewhere.

## Writing notes

A note is a Markdown file ending in `.md`. Its name is its file name, unless
it has a `title` [property](#properties), which is shown instead.

### Links

| You write | It is |
| --- | --- |
| `[[Plan]]` | a link to the note named Plan |
| `[[Projects/Plan]]` | a link to that note in that folder |
| `[[Plan\|the plan]]` | a link shown as "the plan" |
| `[[Plan#Budget]]` | a link that names a heading in the note |
| `![[diagram.png]]` | a picture from the vault, shown in the reading view |
| `[the plan](Projects/Plan.md)` | an ordinary Markdown link to a note |
| `[a site](https://example.com)` | a web link, opened in your browser |

To follow a link, put the cursor in it and press Alt-Enter, or click it in
the reading view. Following a link to a note that does not exist creates the
note, so you can write the link first and fill the note in later.

How a link finds its note:

- Capitals do not matter, and `.md` may be left off.
- A bare name finds the note with that name in any folder. If several notes
  share the name, the one in the same folder as the linking note wins, then
  the one with the shortest path.
- A link with a folder in it, like `[[Projects/Plan]]`, matches the end of a
  note's path.
- If no note matches, the name is tried as an alias (see
  [Properties](#properties)), then as a file that is not a note.

A link to a heading opens the note but does not scroll to the heading yet.
In a table, write the bar in a link as `\|`.

### Tags

A tag is a `#` followed by letters, digits, `_`, `-`, or `/`, at the start
of a line or after a space: `#idea`, `#project/active`. It needs at least
one character that is not a digit, so `#1` is not a tag. A `/` nests tags:
searching for `project` also finds `#project/active`. Tags can also be
listed in the `tags` property. Tags inside code are not tags.

### Pictures and other files

A picture in the vault (png, jpg, jpeg, gif, webp, svg, bmp or avif) opens
in a tab when you click it in the sidebar, and shows in the reading view
where a note embeds it with `![[name.png]]`. Any other file opens in the app
your system uses for it. Pictures on the web are not fetched: Diamond makes
no network connections of its own.

## Finding notes

**Go to note** finds a note by name. Type any part of its title, file name
or an alias; the letters do not have to be next to each other, so `qp` finds
"Quarterly Plan".

**Search in all notes** searches the text of every note. Enter opens the
note at the matching line.

| You type | It finds notes that |
| --- | --- |
| `budget` | contain that text, or have it in their name |
| `budget venue` | contain both |
| `"spring launch"` | contain that exact phrase |
| `tag:project` | carry the tag, or one nested under it |
| `path:Archive` | have that text in their path |
| `-draft`, `-tag:done` | do not match what follows the `-` |

Capitals never matter. Both lists show the best 50 matches.

**Go back** and **Go forward** step through the notes a tab has shown, and
put the cursor back where it was in each.

## Files and folders

- **New note** makes `Untitled.md` at the top of the vault. "New note here"
  in the sidebar's menu makes it in the folder you clicked.
- **Rename or move.** Type a new name to rename. Type a name with a `/` in
  it, such as `Archive/2026/Plan`, to move: it is a path from the top of the
  vault, and folders are made as needed. Renaming a folder moves everything
  in it. Every link to a renamed or moved note is rewritten in the notes
  that link to it, so nothing breaks. Diamond never renames over a file that
  already exists.
- **Delete** moves the file or folder to `.diamond/trash` inside the vault.
  Nothing is erased; to get something back, move it out of that folder.

To make a folder, move a note into it. Files and folders whose names start
with a dot are not shown.

## Daily notes and templates

"Open today's daily note" opens the note for today, named for the date
(`2026-11-14.md`) in the `Daily` folder. The first time each day it is
created from the template `Daily` in the templates folder, if there is one,
and empty otherwise.

A **template** is any note in the `Templates` folder. "Insert template"
lists them and puts the one you pick at the cursor. These are filled in when
a template is inserted or a daily note is made from it:

| Placeholder | Becomes |
| --- | --- |
| `{{title}}` | the note's title |
| `{{date}}` | today, as `2026-11-14` |
| `{{time}}` | now, as `09:05` |
| `{{weekday}}` | `Saturday` |
| `{{year}}`, `{{month}}`, `{{day}}` | `2026`, `11`, `14` |
| `{{yesterday}}`, `{{tomorrow}}` | the dates either side of today |
| `{{date+7}}`, `{{date-1}}` | the date that many days away |

Anything else in double braces is left as you wrote it. The folders and the
daily template can be changed in the [vault's settings](#settings).

## Properties

Properties are facts about a note, written as YAML between two `---` lines
at the very top:

```markdown
---
title: Spring launch
status: active
due: 2026-12-01
tags: [project, marketing]
aliases: [Launch]
---
```

The context panel lists them. Click one to change its value, clear the value
to remove it, and use "Add a property" to add one. What you type is written
as it is, so `true`, `3` and `[a, b]` mean what they mean in YAML.

Three properties mean something to Diamond: `title` is the name shown for
the note, `tags` adds tags, and `aliases` gives other names that links and
"Go to note" find the note by. Every property can be used in
[queries](#queries).

## Tasks

A task is an ordinary Markdown task item:

```markdown
- [ ] Book the venue due:2026-11-27
- [x] Pick a name
```

"Show tasks" lists the tasks from every note in one tab. Writing
`due:` and a date as `YYYY-MM-DD` anywhere in a task gives it a due date.
Tasks with a date come first, soonest first, and a date that has passed is
shown in red. Click a task's box to tick it in its note; click the task to
open the note at that line. "Show finished" brings back the ticked ones.

## Queries

A query computes a table from your notes. It is a fenced block marked
`query`, and the table replaces it in the reading view and the live preview:

````markdown
```query
tag:project -tag:done path:Work
show: title, status, due
sort: due desc
limit: 20
```
````

- The first lines choose notes, in the same words as
  [search](#finding-notes). With no such line, every note is chosen.
- `show:` lists the columns. `title`, `name`, `path`, `folder` and `tags`
  are about the note itself; any other name is a property. Without `show:`
  the table has one column, the title.
- `sort:` names one column, with `desc` after it for largest first. Numbers
  sort as numbers, and notes without a value come last. Without `sort:` the
  rows are in order of title.
- `limit:` keeps the first so many rows.

The first column of each row links to its note.

## Boards

"Show this note as a board" shows any note as columns of cards. A board is
not a special kind of file. In the note:

- each second-level heading (`## Doing`) is a column;
- each list item directly under it is a card, along with any indented lines
  beneath the item.

```markdown
## To do

- [ ] Write the announcement
- Book the venue

## Done

- [x] Pick a name
```

The arrows on a card move it up or down, or into the column to its left or
right, and "Add a card" adds one at the bottom of a column. Each change
rewrites only those lines of the note. While the note is open in a tab, the
change can be undone there like any other edit.

## Canvases

A canvas is a surface for cards placed wherever you like, with lines between
them. "New canvas" makes one; clicking it in the sidebar opens it.

- **Add a card:** type its text, or `[[Note name]]` for a card that stands
  for a note. Clicking such a card's name opens the note.
- **Move a card:** drag it by the strip along its top.
- **Join two cards:** click "link" on one, then on the other. Doing the same
  again removes the line.
- **Remove a card:** the × on its strip. Its lines go with it.

A canvas is a file of its own, named `Something.canvas.toml`, that can be
read and fixed by hand:

```toml
[[card]]
id = 1
x = 40.0
y = 60.0
text = "An idea"

[[card]]
id = 2
x = 320.0
y = 60.0
note = "Projects/Plan"

[[link]]
from = 1
to = 2
```

If another program changes the file while the canvas is open, your next
change is not made; Diamond shows the file's version instead and says so.

## Calendar, graph and bookmarks

**Show calendar** shows a month. Days that have a daily note are in colour,
and today is outlined. Click a day to open its daily note, which is created
if it does not exist. The arrows change the month.

**Show graph** draws notes as dots and links as lines. It opens on the notes
within two links of the note in front; "Show whole vault" shows everything,
or the 300 best-connected notes in a larger vault. Bigger dots have more
links, and names are shown while there are 60 notes or fewer. Click a dot to
open its note.

**Bookmarks.** "Bookmark this note" adds the note in front to the list at
the bottom of the context panel, and removes it if it is already there.
Bookmarks follow notes that are renamed or moved.

## Tables

With the cursor in a Markdown table:

- **Line up table columns** pads every column to the same width and keeps
  each column's alignment.
- **Add table row** and **Add table column** add one at the end.

**Insert table** puts an empty two-column table at the cursor.

## Versions and sync with git

Diamond can keep the history of a vault with [git](https://git-scm.com),
using the `git` program installed on your computer and the identity,
credentials and remotes it is already set up with.

- **Git: start keeping versions** makes the vault a git repository. If the
  vault has no `.gitignore`, it writes one that leaves `.diamond/trash` out
  of the history.
- **Git: save a version** commits everything that changed, with a message
  like `Vault 2026-11-14 09:05`.
- **Git: sync with the remote** saves a version, takes in what the remote
  has (`git pull --rebase`), and sends what it lacks (`git push`). The
  remote and its branch are set up with git itself; Diamond does not create
  them.

These work only when the vault folder is itself the top of a repository. A
vault that sits inside a larger repository is left alone, so that saving a
version can never commit files outside the vault.

If a sync cannot finish, the status line says why. When the cause is that
both sides changed the same lines, the vault is left the way git left it,
partway through a rebase, and it is finished or abandoned with git itself
(`git rebase --continue` or `git rebase --abort`).

## Settings

There is no settings screen yet. Settings are two small files, written to be
read and edited by hand. A line that is missing takes its default, so a file
only needs the lines you want to change.

### A vault's settings

`.diamond/settings.toml` inside the vault. It travels with the vault. These
are the defaults:

<!-- vault-settings -->
```toml
[daily]
folder = "Daily"        # where daily notes go; "" for the top of the vault
template = "Daily"      # a note in the templates folder, or a path with a /

[templates]
folder = "Templates"    # notes in here are offered by "Insert template"

[calendar]
week_starts = "monday"  # or "sunday"
```

After editing the file, run "Reload vault settings". If the file has a
mistake in it, the status line says what is wrong, the defaults are used
until it is fixed, and the file is left as you wrote it.

### The app's settings

`settings.toml` in Diamond's settings folder, for this computer only:

<!-- app-settings -->
```toml
appearance = "system"   # or "light", or "dark"
```

The light and dark switch in the status line writes this for you.

The settings folder is:

| System | Folder |
| --- | --- |
| macOS | `~/Library/Application Support/Diamond Markdown` |
| Linux | `$XDG_CONFIG_HOME/diamond-markdown`, or `~/.config/diamond-markdown` |

Setting the `DIAMOND_CONFIG_DIR` environment variable uses another folder
instead.

## What Diamond keeps on disk

In the vault, apart from your own files:

| Path | What it is |
| --- | --- |
| `.diamond/settings.toml` | the vault's settings, if you wrote any |
| `.diamond/trash/` | deleted files and folders |
| `.diamond/bookmarks.toml` | your bookmarks |
| `Note (conflict).md` | your version of a note that changed elsewhere while you were editing it |
| `.gitignore` | written by "Git: start keeping versions", if there was none |
| `.git/` | git's own folder, once the vault keeps versions |

In the settings folder:

| File | What it is |
| --- | --- |
| `settings.toml` | the app's settings |
| `recent-vaults` | the last ten vaults you opened, one folder per line |

Diamond reads and writes nothing else, and nothing outside these two
folders.

## Not built yet

- Markdown rendered in place in the editor as you type. The live preview
  beside the editor is what there is.
- Finding and replacing text within one note. Search covers the whole
  vault.
- A settings screen, and changing shortcuts.
- Reopening the notes that were open when you last quit: a vault opens on an
  empty tab.
- Scrolling to a heading: a link to a heading opens the note at its top, and
  clicking a heading in the outline while reading switches to the editor.
- Dragging tabs between panes, and splitting a pane downwards.
- Undo that carries across two views of the same note.
- Tasks that repeat.
- Browsing a vault's history. Versions are saved; looking through them is
  done with git.
- Editing a table as a grid, and dragging cards on a board.
- Panning and zooming a canvas. A note card does not follow its note when
  the note is renamed.
- Typeset maths, drawn diagrams and PDFs shown in the app, and one note
  embedded inside another.
- Plugins from outside the app.
- Windows.
- Menus in the system's menu bar, and packaged releases you can install.
