---
title: Daily Notes
tags: [features, workflow]
---

# Daily Notes

Every day gets a note at `Daily/YYYY-MM-DD.md`. Click the "Today" button in the sidebar to open (and create if missing) today's note.

## Template

Ships with a minimal template — override by creating `Templates/Daily.md` in your vault.

Default:

```md
---
title: {{date}}
tags: [daily]
---

# {{date}}

## Log



## Notes



```

## Variables

- `{{date}}` → today's date (`YYYY-MM-DD`)
- `{{time}}` → current time (`HH:MM`)
- `{{weekday}}` → "Monday" etc.
- `{{yesterday}}` → previous day's ISO date

## Use it as an index

A common pattern: link out from a daily note to any long-form note you worked on that day. Over time the [[test/Backlinks]] panel on each long-form note becomes a timeline of when you touched it.

## See also

- [[Frontmatter]] — template can use any keys
- [[Features Overview]]

#workflow
