---
title: Getting Started
tags: [meta, getting-started]
---

# Getting Started

## Run it

```sh
git clone https://github.com/Zollicoff/diamondmarkdown.git
cd diamondmarkdown
npm install
npm run dev
```

Open `http://localhost:5173`. You'll see this sample vault by default.

## Make it yours

1. Create a folder somewhere — `~/Documents/vault` is a good default
2. Copy your existing markdown in (or start empty)
3. In DiamondMD, click the vault switcher → **"+ Add vault"** → paste the absolute path
4. Switch to your new vault

Your original notes aren't modified on first load. The first time you save, DiamondMD runs `git init` if the folder isn't already a git repo.

## Coming from Obsidian

Your existing Obsidian vault should work as-is. DiamondMD uses the same [[Wikilinks]] syntax, the same [[Frontmatter]] conventions, the same file structure. Add it as a vault, point, use.

The main differences you'll notice:

- Live preview ships in [[Versioning|v0.3]]; v0.1 has a source + preview split
- Canvas is not supported (ever) — those `.canvas` files won't render, but they won't be damaged either
- No Obsidian plugins — the plugin ecosystem is the reason you'd stay on Obsidian

## Shortcuts

| Shortcut | Action |
|---|---|
| Cmd-K | Quick switcher |
| Cmd-Shift-F | Full-text search |
| Cmd-Shift-V | Switch vault |
| Cmd-S | Force save (auto-saves on blur / idle anyway) |
| Cmd-Enter | Toggle preview |

## See also

- [[Features Overview]] — what's in v0.1
- [[Philosophy]] — why this exists

#getting-started
