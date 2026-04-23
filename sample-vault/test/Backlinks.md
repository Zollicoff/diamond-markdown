---
title: Backlinks
tags: [features, core]
---

# Backlinks

A **backlink** is a link *from* another note *to* this one. DiamondMD computes the full backlink graph on startup and updates it every time a note is saved.

## Why backlinks matter

[[Wikilinks]] give you forward links — "this note mentions that one." Backlinks give you the reverse — "these notes mention this one." Together they form a graph, which is the whole point of a knowledge base.

Without backlinks, wikilinks are just hyperlinks. With backlinks, your notes network together the way your thoughts do.

## Where to find them

- **Right-hand panel** when a note is open — every note linking here is listed
- **`/api/vaults/[id]/backlinks?note=<path>`** if you want them programmatically

## Example

Every sample note in this vault links back to [[Welcome to DiamondMD|the welcome page]] somewhere. Open it and look at the backlinks panel — it should list all of the tour pages.

## See also

- [[Wikilinks]] — the forward side of the graph
- [[Search]] — backlinks are a derived query; search is a real-time one

#feature
