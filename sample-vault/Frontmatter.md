---
title: Frontmatter
tags: [features, core]
aliases: [YAML, Metadata]
---

# Frontmatter

Optional YAML block at the top of a note, between two `---` lines:

```yaml
---
title: My Note
tags: [research, draft]
aliases: [MN, First Note]
created: 2026-04-22
---
```

## Recognized keys

| Key | Used for |
|---|---|
| `title` | Display title (otherwise the filename stem is used) |
| `tags` | Array of tag names; merged with inline `#tags` |
| `aliases` | Array of alternate names this note answers to in [[Wikilinks]] |
| `created` | ISO date of first creation (filled automatically) |
| `updated` | ISO date of last edit (filled automatically on save) |
| `public` | Boolean — if the vault is published, is this note included? |

Any other keys are preserved but ignored by DiamondMD's core. Plugins may use them.

## See also

- [[Wikilinks]] — aliases make `[[MN]]` resolve to this note
- [[Tags]] — frontmatter + inline tags share one index
- [[Daily Notes]] — ships with a default template

#feature
