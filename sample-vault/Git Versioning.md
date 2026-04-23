---
title: Git Versioning
tags: [features, core, git]
---

# Git Versioning

Every vault is a git repository. Every save is a commit. That's it.

## Why git

[[Philosophy|Obsidian Sync]] is proprietary, paid, and gives you an opaque time-machine. Git gives you:

- Real per-file history (`git log` on a note)
- Real diffs between any two points in time
- Real branches — "I'm writing a draft of this essay" becomes a branch, merge when done
- Real offline sync — commit anywhere, push when you're back online
- Free cross-device sync via your existing GitHub / Forgejo / self-hosted remote

And everything is inspectable with standard tools. Your vault doesn't depend on DiamondMD being alive — it's just a git repo full of `.md` files.

## What DiamondMD does automatically

1. First save to a folder → `git init` if it isn't already a repo
2. Every save → `git add <path> && git commit -m "edit: <path>"`
3. Rename → `git mv` + commit, includes updated wikilinks in other notes as part of the commit
4. Delete → `git rm` + commit
5. Per-note history panel calls `git log` on the file

## What DiamondMD does NOT do automatically

- **Push.** We don't auto-push because that surprises people. A "push" action is a deliberate click or keyboard shortcut.
- **Pull on open.** Same reason. You control when network I/O happens.
- **Conflict resolution.** Rare in practice (one user, one device usually). When it happens, we surface the conflicted file in the UI and let you edit the merge markers directly.

## See also

- [[Philosophy]] — why this matters
- [[Multi-Vault]] — each vault is independent, each its own git repo

#feature #git
