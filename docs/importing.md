# Importing Existing Vaults

Diamond Markdown registers an existing folder in place. It does not copy,
rewrite, or normalize markdown files during import.

## Obsidian Vaults

Use the home screen's **Add vault** form and run **Inspect import** before adding
an existing Obsidian vault. The preflight reports:

- markdown file count
- likely attachment folders
- whether `.obsidian` exists
- whether the folder already has `.git`
- folders Diamond skips from note indexing

The `.obsidian` folder is preserved on disk but skipped from note indexing.
Common attachment folders such as `Attachments`, `assets`, `images`, and
`media` are detected so the user can confirm embeds are present before opening
the vault.

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
