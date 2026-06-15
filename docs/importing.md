# Importing Existing Vaults

Diamond Markdown registers an existing folder in place. It does not copy,
rewrite, or normalize markdown files during import.

## Exporting Back To Obsidian

Use **Settings → Vault → Obsidian export** to download an Obsidian-ready ZIP
package of the active vault. The package preserves Markdown files, Canvas files,
attachments, and `.obsidian` configuration files so the extracted folder can be
opened directly in Obsidian. Diamond-specific `.diamondmd/` metadata, generated
`.diamond-publish/` output, `.git/`, `node_modules/`, and `.DS_Store` files are
left out of the package.

The export does not rewrite notes or convert Diamond plugins into Obsidian
plugins; it is a clean vault-file handoff, not a full ecosystem migration.

## Obsidian Vaults

Use the home screen's **Add vault** form and run **Inspect import** before adding
an existing Obsidian vault. The preflight reports:

- markdown file count
- likely attachment folders
- whether `.obsidian` exists
- supported `.obsidian/app.json` settings, including safe attachment folder,
  new-note folder, link style, link-update preference, link format,
  line-number display, spellcheck, tab size, readable line length, strict
  line-break rendering, initial view mode, and trash preference
- safe `.obsidian/daily-notes.json` folder, template, and date-format settings
- safe `.obsidian/templates.json` folder plus default date/time-format settings
- `.obsidian/appearance.json` theme settings and CSS snippet filenames as
  migration guidance, with safe base font size and hex accent color applied
  while the vault is open
- `.obsidian/graph.json` filter/display/force settings as read-only migration
  guidance
- `.obsidian/core-plugins.json` support notes for enabled Obsidian core plugins
- `.obsidian/hotkeys.json` custom shortcut summaries as manual migration
  guidance
- Obsidian `bookmarks.json` or legacy `starred.json` note bookmarks that can
  seed Diamond's git-backed bookmarks
- Obsidian plugin folders plus read-only manifest/settings migration guidance
- Obsidian Canvas files that will be preserved and opened with visual editing
- whether the folder already has `.git`
- folders Diamond skips from note indexing

The `.obsidian` folder is preserved on disk but skipped from note indexing.
Diamond reads known-safe `.obsidian/app.json` settings during preflight and
shows them as migration notes instead of dumping the raw JSON. It currently
honors a safe `attachmentFolderPath` for dropped, pasted, and uploaded
attachments, a safe `newFileLocation: "folder"` plus `newFileFolderPath` as the
default destination for generic New Note commands, `useMarkdownLinks` for the
editor link button's inserted syntax, local Markdown note links for navigation,
backlinks, and static publish output, `showLineNumber` for the editor
line-number gutter, `showInlineTitle` for the note-body file title row,
`spellcheck` for the markdown editor's browser spellcheck attribute, safe
integer `tabSize` values from 1 to 16 for editor indentation and tab rendering,
`readableLineLength` for narrowing editor and reading surfaces,
`foldHeading` / `foldIndent` for editor fold controls,
`strictLineBreaks` for Read mode, hover-preview, and static-publish line-break
rendering, `defaultViewMode` plus `livePreview` for the initial note view mode,
`alwaysUpdateLinks` for note/folder rename and move operations, and
`trashOption: "local"` for portable vault-local delete-to-trash behavior.
Explicit folder context actions such as New note here still use the selected
folder. Other app settings such as `newLinkFormat` and non-local trash modes
are reported so migration mismatches are visible before opening the vault;
Diamond does not rewrite existing note links during import.

When `.obsidian/daily-notes.json` is present, the daily-note command reuses safe
`folder`, `template`, and `format` settings. Date formats support the same
Moment-style token subset used by Diamond templates, including `YYYY`, `MM`,
`DD`, `ddd`, `dddd`, `MMM`, and `MMMM`; unsafe paths fall back to Diamond's
default `Daily Notes/YYYY-MM-DD.md` and `Daily Notes/Template.md` behavior.
The import preview surfaces those supported Daily Notes settings and the note
path Diamond would create today without exposing unknown raw config values.

When `.obsidian/templates.json` is present, the insert-template picker reuses a
safe `folder` setting instead of hardcoding `Templates/`. It also uses supported
`dateFormat` and `timeFormat` values as the default expansion for `{{date}}`
and `{{time}}`; explicit template tokens such as `{{date:YYYY-MM-DD}}` still
override the default. Unsafe folder or format settings fall back to Diamond's
default `Templates/`, `YYYY-MM-DD`, and `HH:mm` behavior. The import preview
surfaces only those supported Templates fields, not unknown raw config values.

Diamond will not execute Obsidian community plugins. The import preview reads
plugin manifests plus the top-level keys in each plugin `data.json`, then shows
per-plugin migration notes for enabled state, manifest health, settings-file
health, preserved file location, and manual migration action. It does not expose
full plugin setting values in the preview.

When `.obsidian/appearance.json` or `.obsidian/snippets/*.css` is present,
Diamond surfaces theme names, base font size, accent color, enabled snippet
names, missing enabled snippets, and snippet filenames as migration guidance.
Safe integer `baseFontSize` values from 12px to 24px and safe hex
`accentColor` / `customAccentColor` values are applied while the vault is open.
Diamond does not load Obsidian community themes, execute CSS snippets, or show
CSS file contents during import preview.

When `.obsidian/graph.json` is present, Diamond surfaces recognized graph
search, orphan visibility, attachment/tag/unresolved-node visibility, custom
color-group count, zoom scale, and force/display tuning values as migration
guidance. Diamond's graph remains note-link focused today, so attachment nodes,
tag nodes, unresolved-link nodes, and Obsidian color-group rules are marked for
manual review rather than imported as hidden app state.

When `.obsidian/core-plugins.json` or `.obsidian/hotkeys.json` is present,
Diamond surfaces enabled core-plugin support levels and custom shortcut
bindings as migration guidance. Supported core plugins are called out where
Diamond already has an equivalent workflow, partial/manual plugins are marked
for review, and hotkeys are shown as command IDs plus sanitized key bindings.
When a known Obsidian command has a Diamond equivalent, the preview names the
Diamond command beside the imported binding. Diamond does not enable or disable
app features from Obsidian's core-plugin list and does not automatically remap
Obsidian shortcuts.

When `.obsidian/bookmarks.json` or legacy `.obsidian/starred.json` is present,
Diamond imports visible Markdown file bookmarks into `.diamondmd/bookmarks.json`
and imports Obsidian search bookmarks as full-text saved searches in
`.diamondmd/searches.json` when the vault is registered, as long as the
corresponding Diamond store does not already exist. The importer supports
nested Obsidian bookmark groups but does not recreate group hierarchy; missing
files, hidden/config paths, Canvas files, and other non-note/non-search entries
remain preserved in `.obsidian` but are not converted. If the imported vault
already has Git initialized, Diamond commits the seeded metadata files.

Common attachment folders such as `Attachments`, `assets`, `images`, and
`media` are detected so the user can confirm embeds are present before opening
the vault.

Image embeds using Obsidian wikilink syntax (`![[image.png|300x200]]`) and
standard Markdown image syntax (`![Alt|300x200](Attachments/image.png)`) render
from vault assets. Markdown image paths are resolved relative to the source
note, `?query` and `#fragment` suffixes are preserved, and static publish
copies local image assets into the exported `images/` folder.
Audio, video, PDF, and generic file embeds using Obsidian wikilink syntax render
as vault-local attachments in read mode. Attachment fragments and query suffixes
such as `![[packet.pdf#page=3|Site packet]]` are preserved in rendered links.
Static publish copies those non-image attachments into the exported `assets/`
folder.

Obsidian callouts such as `> [!NOTE]`, `> [!WARNING]-`, and `> [!TIP]+`
render as styled callout blocks in read mode and static publish. Fold markers
use native disclosure blocks, so collapsed and expanded defaults survive
without client-only JavaScript.

Obsidian highlights such as `==important==` render in Live Preview and as
`<mark>` spans in read mode and static publish. Inline Markdown inside the
highlighted span, including wikilinks, tags, and emphasis, still renders through
Diamond's normal pipeline.

Obsidian block IDs on paragraphs and list items, such as
`Important install step ^install-steps`, render as linkable anchors in read mode
and static publish. Wikilinks like `[[Target#^install-steps]]` preserve the
block-reference fragment in Live Preview, Read mode, and static publish instead
of treating it as a heading link.

Paired Obsidian comments such as `%% hidden note %%` are hidden from Live
Preview, Read mode, static publish, search/link/tag indexing, and Canvas
text-card previews while remaining unchanged in source. Literal `%%` markers
inside inline code and fenced code blocks remain visible.

Frontmatter `tags` and `aliases` are read from either flow arrays
(`tags: [project/foo, review]`) or Obsidian-style block lists, so imported
vaults keep their search, tag index, and alias-based wikilink behavior without
rewriting note files.

In edit mode, dropping or pasting local files into a note copies them into the
vault's configured Obsidian attachment folder when `.obsidian/app.json` declares
a safe relative `attachmentFolderPath`; otherwise Diamond uses `Attachments/`.
Uploads receive non-overwriting filenames, are committed to the vault git
history, and insert Obsidian-style embed links.

When `.obsidian/app.json` sets `trashOption: "local"`, Diamond follows the
portable Obsidian trash behavior for note, Canvas, folder, and attachment
delete actions by moving deleted vault files under `.trash/` and committing the
move. The `.trash/` folder stays hidden from the active tree, search index, and
attachment picker.

After import, the attachment picker can move selected vault assets into a safe
destination folder. Moves pick non-overwriting filenames and rewrite Obsidian
embeds plus source-relative Markdown image links in the same git-backed commit.

If media files are present outside a named attachment folder, the preflight
marks that as a review item. Diamond still registers the vault in place, but
you should verify embeds after opening it.

Obsidian Canvas files (`.canvas`) and Obsidian plugin settings are preserved on
disk. Diamond Markdown opens Canvas files as visual boards and can zoom or fit
the board while keeping node move/resize coordinates in Canvas units. It can
rename, move, delete, export the `.canvas` files as SVG snapshots, and add or
edit text cards, file cards, URL cards, group labels, node positions and
dimensions, node and edge colors, edge connections, edge labels, and node or
edge deletion with git-backed commits. Canvas text cards show a safe
markdown-aware preview while preserving the raw editable text.
Canvas text cards preview common Markdown plus H1-H6 headings, thematic
breaks, hidden Obsidian comments, Obsidian callout blocks, highlights,
strikethrough, simple Markdown tables, resolved note/title/alias inline
wikilinks such as `[[Survey Photos#Meter|site photos]]` and
`[[Home.md#Install Steps|Launch link]]`, explicit Canvas links such as
`[[Boards/Map.canvas|Map board]]`, resolved note embed chips such as
`![[Survey Photos#Meter|Survey note]]` or `![[Home.md#Install Steps]]`,
explicit Canvas embed chips such as `![[Boards/Map.canvas]]`, and safe
vault-local asset embed lines such as `![[Images/roof.png]]` or
`![Roof](Images/roof.png)`,
while leaving the raw card text editable. Canvas group
nodes are rendered behind cards and can be created from the Canvas toolbar.
Canvas node and edge colors
are preserved, edited, and rendered in the board and SVG export. Canvas edge
side anchors (`fromSide`/`toSide`) and endpoint arrows (`fromEnd`/`toEnd`) are
respected when drawing board and SVG connections, and can be edited from the
Canvas edge row. Canvas file cards preserve JSON Canvas `subpath` values,
render frontmatter-stripped Markdown note previews for `.md` targets, and can
open referenced Markdown notes at heading or block anchors, or open Canvas
files in workspace tabs. Vault-local asset file cards render safe raw previews
or links without pretending to be note tabs, and URL cards expose safe
`http`/`https` links. Obsidian plugin execution is not implemented yet.

## GitHub Sync

Diamond Markdown uses Git for sync. Existing `.git` repositories are reused.
If no `.git` folder is present, initialize Git before first GitHub sync so the
initial state of the imported vault is captured explicitly.

## What Import Does Not Do

- It does not import or execute Obsidian plugins.
- It does not automatically migrate Obsidian plugin settings into Diamond plugins.
- It does not load Obsidian community themes or CSS snippets.
- It does not automatically enable/disable features from Obsidian core-plugin
  settings.
- It does not automatically remap Obsidian hotkeys into Diamond shortcuts.
- It does not automatically apply Obsidian graph layout, color groups, tag
  nodes, attachment nodes, or unresolved-link nodes.
- It imports Obsidian search bookmarks as Diamond saved searches, but does not
  recreate Obsidian bookmark groups or convert non-note bookmarks into Diamond
  bookmarks.
- It does not automatically apply every `.obsidian/app.json` UI preference or
  non-local trash behavior.
- It does not rewrite wikilinks or embeds.
- It does not move attachments during import.
- It does not delete or modify `.obsidian`.
- It does not automatically push anything to GitHub.
