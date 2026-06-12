# Importing Existing Vaults

Diamond Markdown registers an existing folder in place. It does not copy,
rewrite, or normalize markdown files during import.

## Obsidian Vaults

Use the home screen's **Add vault** form and run **Inspect import** before adding
an existing Obsidian vault. The preflight reports:

- markdown file count
- likely attachment folders
- whether `.obsidian` exists
- Obsidian plugin folders plus read-only manifest/settings visibility
- Obsidian Canvas files that will be preserved and opened with visual editing
- whether the folder already has `.git`
- folders Diamond skips from note indexing

The `.obsidian` folder is preserved on disk but skipped from note indexing.
Diamond will not execute Obsidian community plugins. The import preview reads
plugin manifests plus the top-level keys in each plugin `data.json`, so you can
see which settings files will be preserved before registering the vault without
exposing full plugin setting values in the preview.

Common attachment folders such as `Attachments`, `assets`, `images`, and
`media` are detected so the user can confirm embeds are present before opening
the vault.

Image embeds using Obsidian wikilink syntax (`![[image.png|300x200]]`) and
standard Markdown image syntax (`![Alt|300x200](Attachments/image.png)`) render
from vault assets. Markdown image paths are resolved relative to the source note,
and static publish copies local image assets into the exported `images/` folder.
Audio, video, PDF, and generic file embeds using Obsidian wikilink syntax render
as vault-local attachments in read mode. Attachment fragments and query suffixes
such as `![[packet.pdf#page=3|Site packet]]` are preserved in rendered links.
Static publish copies those non-image attachments into the exported `assets/`
folder.

Obsidian callouts such as `> [!NOTE]`, `> [!WARNING]-`, and `> [!TIP]+`
render as styled callout blocks in read mode and static publish. Fold markers
use native disclosure blocks, so collapsed and expanded defaults survive
without client-only JavaScript.

Frontmatter `tags` and `aliases` are read from either flow arrays
(`tags: [project/foo, review]`) or Obsidian-style block lists, so imported
vaults keep their search, tag index, and alias-based wikilink behavior without
rewriting note files.

In edit mode, dropping or pasting local files into a note copies them into the
vault's configured Obsidian attachment folder when `.obsidian/app.json` declares
a safe relative `attachmentFolderPath`; otherwise Diamond uses `Attachments/`.
Uploads receive non-overwriting filenames, are committed to the vault git
history, and insert Obsidian-style embed links.

If media files are present outside a named attachment folder, the preflight
marks that as a review item. Diamond still registers the vault in place, but
you should verify embeds after opening it.

Obsidian Canvas files (`.canvas`) and Obsidian plugin settings are preserved on
disk. Diamond Markdown opens Canvas files as visual boards and can rename,
move, delete, export the `.canvas` files as SVG snapshots, and add or edit text
cards, file cards, URL cards, node positions, edge connections, edge labels, and
node or edge deletion with git-backed commits. Canvas group nodes are rendered
behind cards and can be created from the Canvas toolbar. Canvas node and edge
colors are preserved and rendered in the board and SVG export. Canvas edge
side anchors (`fromSide`/`toSide`) are respected when drawing board and SVG
connections. Canvas file cards can open their referenced Markdown notes or
Canvas files in workspace tabs, unsupported asset file cards remain editable
but non-openable, and URL cards expose safe `http`/`https` links. Obsidian
plugin execution is not implemented yet.

## GitHub Sync

Diamond Markdown uses Git for sync. Existing `.git` repositories are reused.
If no `.git` folder is present, initialize Git before first GitHub sync so the
initial state of the imported vault is captured explicitly.

## What Import Does Not Do

- It does not import Obsidian plugins.
- It does not rewrite wikilinks or embeds.
- It does not move attachments.
- It does not delete or modify `.obsidian`.
- It does not automatically push anything to GitHub.
