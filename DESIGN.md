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
│   │   │   ├── folder-service.ts
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
- For each vault, collect a stat snapshot of markdown files, respecting hidden
  folders, `node_modules`, and per-vault excluded folders.
- If `~/.diamondmd/index-cache/<vault-id>-<hash>.json` matches the vault id,
  absolute vault path, excluded-folder list, and exact file snapshot, hydrate
  the in-memory index from that cache.
- If the cache is missing, stale, corrupt, or unreadable, walk the tree, parse
  frontmatter + links + tags for every `.md`, then rewrite the cache.
- Build: `links: Map<notePath, Set<outgoing notePath>>`, `backlinks: Map<notePath, Set<incoming notePath>>`, `tags: Map<tag, Set<notePath>>`

On save:
- Re-parse the changed note only, rebuild derived lookup maps from indexed note
  metadata, and refresh the cache.

On delete:
- Remove the note from all maps, remove references *to* it, and refresh the cache.

On rename:
- Parse every note that links to the old path; rewrite wikilinks; commit all changes as one "rename" commit.

The cache is derived state and lives in the app config directory, never inside a
vault. It is safe to delete; the next index read rebuilds it from markdown files.

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
- Diverged histories are reported as a manual-merge state with local-only,
  remote-only, and overlapping changed-file lists computed from the merge base.
  The app does not create merge commits automatically.

This keeps the browser UI safe for normal Obsidian-style sync without hiding
Git's real conflict model.

## Bundle boundaries

The vault workspace shell lazy-loads tab views from `TabContent.svelte`.
Opening the vault should load the sidebar, rails, command surfaces, and a small
tab loader, not every editor/graph/settings surface at once.

Within `NoteView.svelte`, edit modes lazy-load CodeMirror (`Editor.svelte`) and
the formatting toolbar, while read mode lazy-loads the markdown preview
surface. This keeps CodeMirror out of read-only sessions and keeps preview
rendering dependencies out of pure editing sessions.

Known heavy lazy chunks:

- CodeMirror editor bundle: loaded only when a note is opened in live/source mode.
- Mermaid/diagram vendor bundle: loaded only by `Preview.svelte` when rendered
  markdown contains Mermaid blocks.

Do not raise Vite's chunk-size warning to hide these. Prefer additional dynamic
imports or dependency replacement if these lazy chunks become user-visible
latency.

## File tree rendering

`FileTree.svelte` flattens the expanded tree into visible rows and renders only
the viewport window plus overscan. The parent sidebar still owns sorting,
expanded folders, auto-reveal, context menus, drag/drop, rename state, and note
open behavior; the tree renderer is responsible only for windowing and row UI.

This keeps large vaults from mounting every expanded node at once while
preserving normal Obsidian-style sidebar behavior. The e2e suite includes a
600-note vault check that verifies the mounted `.file-link` count stays bounded
and the last note remains reachable by scrolling.

## Graph simulation

`src/lib/graph/sim.ts` keeps graph physics as pure logic. Small graphs use exact
pairwise repulsion because the overhead is tiny and the motion is precise.
Graphs at or above 180 nodes switch to Barnes-Hut style quadtree repulsion:
near cells are traversed exactly, distant cells are approximated by center of
mass.

The Svelte graph view does not own the approximation choice. It passes the same
force settings to `simulateStep`, so settings, dragging, filters, pan/zoom, and
note-opening behavior stay independent of the physics backend.

## Plugin runtime

Vault-local plugins live under `.diamondmd/plugins/<plugin-id>/`. Server-side
discovery in `src/lib/server/plugins.ts` reads `plugin.json` manifests and only
serves the declared ESM entry module for each valid plugin. The file tree and
indexer already skip hidden dot folders, so plugin implementation files do not
appear as notes.

Client boot calls `loadVaultPlugins(vaultId)` after built-in commands are
registered. Plugin modules export `activate(api)` and can register command
palette actions through a small API. Runtime command ids are scoped as
`plugin:<plugin-id>:<command-id>` so plugins cannot overwrite built-in command
ids accidentally.

Current plugins execute as trusted browser ESM. Sandboxed iframe/Worker execution
remains a v0.5 requirement before untrusted third-party plugins are safe.

## Offline / PWA

`src/service-worker.ts` is deliberately conservative. It precaches the app
shell, SvelteKit build output, and static assets, then serves same-origin
navigation requests network-first with a cached fallback. It does not intercept
`/api/` or non-GET requests; vault contents, git status, note saves, and sync
operations remain server-authoritative.

## Security model

Single-user by default. Authentication is not built in — deploy behind Tailscale, a reverse proxy, or on localhost.

If anyone wants multi-user someday, the right move is a thin auth layer in front that maps user → vault set; the filesystem model stays the same.

## Open questions

- **Live preview**: CodeMirror 6 decorations can hide markdown syntax and render inline — the technique Obsidian uses. Shipping this well is a v0.3 target, not v0.1. MVP is source + split preview.
- **Image embeds**: `![[image.png]]`. Need to serve arbitrary asset files; straightforward but needs a separate `/api/vaults/[id]/asset/[...path]` endpoint.
- **Mobile editor ergonomics**: CodeMirror is fine on iPad, awkward on phone. May need a simpler mobile editor mode.
- **Large vaults (10k+ notes)**: switch from JSON config + in-memory index to SQLite with FTS5. Defer until someone hits the wall.
