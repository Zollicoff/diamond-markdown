---
title: Search
tags: [features, core]
---

# Search

Two search surfaces, each with a specific job.

## Quick switcher (Cmd-K / Ctrl-K)

Fuzzy match on note titles + [[Frontmatter|aliases]]. Use it to jump to a note you know by name.

Typing "wiki" finds [[Wikilinks]]. Typing "yaml" finds [[Frontmatter]] (via its `YAML` alias). Sorted by match quality, then by recency.

## Full-text search (Cmd-Shift-F)

Searches note body text — every `.md` in the active vault. Returns matches with surrounding context.

## Implementation

v0.1 uses **Fuse.js** for the quick switcher (in-memory, small vaults) and a simple substring scan for full-text. Good enough for 1–2k notes.

Past ~5k notes we switch to a trigram index or SQLite FTS5. Flagged in [[Philosophy|the design doc]] as "defer until someone hits the wall."

## See also

- [[Wikilinks]] — the same title index powers wikilink resolution
- [[Tags]] — tag pages are a form of saved search
- [[Features Overview]]

#feature
