---
title: Tags
tags: [features, core]
---

# Tags

DiamondMD supports two ways to tag a note:

## Inline tags

A `#word` anywhere in the body text:

> Today I worked on the #editor and fixed the #wikilink parser.

Tag characters: letters, digits, `-`, `_`, `/` (for nested tags like `#project/client-a`).

## Frontmatter tags

In the YAML block at the top of a note:

```yaml
---
title: My Note
tags: [research, idea]
---
```

Frontmatter tags are equivalent to inline tags — both populate the same index.

## Tag pages

Every tag has its own page at `/vault/<id>/tag/<name>` listing every note that uses it. In the UI, click any tag to jump to its page.

## See also

- [[Frontmatter]] — where frontmatter tags are declared
- [[Features Overview]] — back to the tour
- [[Welcome to DiamondMD]]

#feature #docs
