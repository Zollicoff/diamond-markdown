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
- Obsidian Canvas files that will be preserved and opened with partial editing
- whether the folder already has `.git`
- folders Diamond skips from note indexing

The `.obsidian` folder is preserved on disk but skipped from note indexing.
Diamond will not execute Obsidian community plugins. The import preview reads
plugin manifests and `data.json` presence so you can see which settings will be
preserved before registering the vault.

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

In edit mode, dropping or pasting local files into a note copies them into the
vault's `Attachments/` folder, assigns a non-overwriting filename, commits the
new asset to the vault git history, and inserts an Obsidian-style embed link.

If media files are present outside a named attachment folder, the preflight
marks that as a review item. Diamond still registers the vault in place, but
you should verify embeds after opening it.

Obsidian Canvas files (`.canvas`) and Obsidian plugin settings are preserved on
disk. Diamond Markdown opens Canvas files as visual boards and can rename,
move, delete, export the `.canvas` files as SVG snapshots, and add or edit text
cards with git-backed commits. Full Canvas whiteboard editing and Obsidian
plugin execution are not implemented yet.

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
