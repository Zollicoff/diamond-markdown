# DiamondMD — Design

Architectural notes. Read this before shipping a structural change.

## Design principles

1. **The filesystem is the database.** Every piece of user-visible state lives in a `.md` file (or its frontmatter). The server keeps derived indexes (backlinks, tags, full-text) in memory, but they're always reconstructable from scratch.
2. **Git is the versioning layer.** Not bolted on — load-bearing. Every save is a commit. The UI can show history because git already knows.
3. **No Electron, no native wrapper.** If a feature can't be done in a browser, it doesn't ship. Mobile works by default.
4. **Vanilla CSS, no UI framework.** Keeps the bundle small, keeps us honest about what we're building.
5. **Server-side path safety is non-negotiable.** Every request-handler resolves paths *inside* a vault; anything resolving outside the vault is rejected.

## Stack

- **SvelteKit** (Svelte 5, TypeScript, adapter-node)
- **CodeMirror 6** for the editor
- **marked** for markdown → HTML, with a wikilink extension
- **DOMPurify** to sanitize rendered HTML
- **simple-git** for `git init`, commit, log, diff
- **Fuse.js** for fuzzy search (small vaults). Will migrate to a trigram index if we grow past ~5k notes.
- **No SQLite.** Simplicity over performance until we need it.

## Directory layout

```
diamondmd/
├── sample-vault/           ← ships in-repo, doubles as docs + test fixture
├── src/
│   ├── lib/
│   │   ├── server/         ← only code that touches disk/git lives here
│   │   │   ├── vault.ts
│   │   │   ├── paths.ts
│   │   │   ├── note-service.ts
│   │   │   ├── wikilink.ts
│   │   │   ├── markdown.ts
│   │   │   ├── indexer.ts
│   │   │   ├── git.ts
│   │   │   └── git-sync.ts
│   │   └── components/     ← client-side Svelte components
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte                 ← vault picker
│       ├── vault/[vaultId]/+layout.svelte
│       ├── vault/[vaultId]/+page.svelte
│       ├── vault/[vaultId]/note/[...path]/+page.svelte
│       └── api/...
```

## Vault registry

`~/.diamondmd/config.json`:

```json
{
  "vaults": [
    { "id": "sample", "name": "Sample", "path": "/absolute/path/to/sample-vault" },
    { "id": "personal", "name": "Personal", "path": "/Users/zach/Documents/vault" }
  ],
  "activeVaultId": "personal"
}
```

Vault `id` is stable (used in URLs). `path` is stored absolute. Adding a vault via the UI resolves `~`, validates the directory exists, and assigns a slugified id.

## Path safety

`src/lib/server/paths.ts` exposes one resolver:

```ts
resolveInVault(vault, relPath: string): string
  → absolute filesystem path, or throws
```

It rejects anything that resolves outside `vault.path` after `path.resolve()`. Every API handler uses this; none of them accept absolute paths from the client.

## Wikilink resolution

Wikilinks are `[[Note Title]]` or `[[path/to/note]]` or `[[Note Title|display text]]` or `[[Note Title#heading]]`.

Resolution order (matches Obsidian's):

1. Exact path match (case-insensitive on macOS): `[[foo/bar]]` → `foo/bar.md`
2. Basename match: `[[Note Title]]` finds any `.md` whose stem equals "Note Title"
3. Alias match: any note with `aliases: [...]` in frontmatter containing the target text
4. If nothing matches → render as "broken" (clickable — click creates the note)

The indexer builds a `Map<title, notePath>` and an `aliases Map` to keep resolution O(1).

## Save flow

1. Client sends full note body (markdown + frontmatter) to `POST /api/vaults/[id]/note`
2. Client includes the content revision it loaded. The server rejects the save
   with `409` if the file has changed on disk since that revision.
3. The HTTP route delegates to `src/lib/server/note-service.ts`; filesystem
   writes do not live in Svelte components or route glue.
4. Server writes atomically (write to `foo.md.tmp`, rename)
5. Server re-indexes the note (extract links, tags; update backlink/tag index)
6. Server calls `git add <rel> && git commit -m "edit: <path>"` via `simple-git`
7. Server returns the new git sha + updated revision metadata

A debounce layer (client-side) avoids commit spam while typing — default is "commit on blur or after 3s idle," configurable.

## Index lifecycle

On server start:
- For each vault, walk the tree, parse frontmatter + links + tags for every `.md`
- Build: `links: Map<notePath, Set<outgoing notePath>>`, `backlinks: Map<notePath, Set<incoming notePath>>`, `tags: Map<tag, Set<notePath>>`

On save:
- Re-parse the changed note only; update the maps incrementally.

On delete:
- Remove the note from all maps; remove references *to* it.

On rename:
- Parse every note that links to the old path; rewrite wikilinks; commit all changes as one "rename" commit.

## Git semantics

Every vault is its own git repo. On first save to a vault whose directory isn't a git repo, we run `git init` + initial commit.

Commit message format:

```
<verb>: <vault-relative path>
```

Verbs: `create`, `edit`, `rename`, `delete`. Multi-file operations (rename with link updates) use `rename: old → new (+ N links updated)`.

`user.name` / `user.email` fall back to whatever's globally configured; if neither exists we use `DiamondMD <noreply@diamondmd>`.

## GitHub sync semantics

Remote sync lives in `src/lib/server/git-sync.ts` and is exposed through
`/api/vaults/[vaultId]/sync`. The sync route is intentionally conservative:

- Only GitHub HTTPS and SSH remotes are accepted for `origin`.
- Status reports branch, sha, clean/dirty state, conflicted files, ahead/behind counts, and the redacted remote URL.
- Fetch updates remote refs without changing local files.
- Pull is fast-forward only and requires a clean worktree.
- Push requires a clean worktree and refuses when the remote is ahead.
- Diverged histories are reported as a manual-merge state; the app does not create merge commits automatically.

This keeps the browser UI safe for normal Obsidian-style sync without hiding
Git's real conflict model.

## Security model

Single-user by default. Authentication is not built in — deploy behind Tailscale, a reverse proxy, or on localhost.

If anyone wants multi-user someday, the right move is a thin auth layer in front that maps user → vault set; the filesystem model stays the same.

## Open questions

- **Live preview**: CodeMirror 6 decorations can hide markdown syntax and render inline — the technique Obsidian uses. Shipping this well is a v0.3 target, not v0.1. MVP is source + split preview.
- **Image embeds**: `![[image.png]]`. Need to serve arbitrary asset files; straightforward but needs a separate `/api/vaults/[id]/asset/[...path]` endpoint.
- **Mobile editor ergonomics**: CodeMirror is fine on iPad, awkward on phone. May need a simpler mobile editor mode.
- **Large vaults (10k+ notes)**: switch from JSON config + in-memory index to SQLite with FTS5. Defer until someone hits the wall.
