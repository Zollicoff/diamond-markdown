---
title: Multi-Vault
tags: [features, core]
---

# Multi-Vault

Multiple separate knowledge bases, one app.

## Why

- Separate personal notes from work notes
- A vault per project or client
- A throwaway sandbox vault for testing

## How

DiamondMD reads `~/.diamondmd/config.json`:

```json
{
  "vaults": [
    { "id": "personal", "name": "Personal", "path": "/Users/zach/Documents/vault" },
    { "id": "work",     "name": "Work",     "path": "/Users/zach/work/notes" }
  ],
  "activeVaultId": "personal"
}
```

- Add a vault from the UI (vault switcher → "+ Add vault")
- Switch between vaults with Cmd-Shift-V
- Each vault has its own [[Git Versioning|git repo]], its own backlink index, its own [[Tags|tag namespace]]

## Boundaries

- [[Wikilinks]] only resolve *within* the current vault. No cross-vault linking in v0.1.
- [[Search]] only searches the active vault.
- Settings (theme, debounce) are global; per-vault overrides come in v0.2.

## See also

- [[Git Versioning]]
- [[Features Overview]]
- [[Welcome to DiamondMD]]

#feature
