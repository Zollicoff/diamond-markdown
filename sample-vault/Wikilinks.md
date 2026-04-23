---
title: Wikilinks
tags: [features, core]
---

# Wikilinks

A **wikilink** is a link written as `[[Note Title]]`. DiamondMD resolves it to an actual note in the current vault.

## Syntax

| Form | Meaning |
|---|---|
| `[[Note Title]]` | Link to the note whose title (or filename stem) is "Note Title" |
| `[[path/to/note]]` | Link to the note at this vault-relative path |
| `[[Note Title\|display text]]` | Same target, but render as "display text" |
| `[[Note Title#Heading]]` | Link directly to a heading within the note |
| `[[Note Title#^block-id]]` | Link to a block (future) |

## Resolution order

When you write `[[Foo]]`, DiamondMD tries (in order):

1. **Exact path match** — is there a file at `Foo.md`?
2. **Basename match** — any `.md` in the vault with stem `Foo`?
3. **Alias match** — any note with `Foo` in its frontmatter `aliases`?
4. **Broken link** — nothing matched. Renders in italic red. Click to create it.

Order matches [[Philosophy|Obsidian's rules]] so existing vaults port over cleanly.

## See also

- [[test/Backlinks]] — the reverse view
- [[Frontmatter]] — where `aliases` are declared
- [[Search]] — wikilinks share the same title index as the search box

#feature
