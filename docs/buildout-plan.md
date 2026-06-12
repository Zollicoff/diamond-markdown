# Diamond Markdown Buildout Plan

This is the working plan for turning Diamond Markdown into a credible
open-source Obsidian-style daily driver with GitHub sync.

## Current State

Diamond Markdown already has the right foundation:

- SvelteKit app shell with server-only filesystem and git code.
- Vault registry, file tree, editor, live preview, read mode, backlinks,
  outgoing links, tags, graph view, templates, daily notes, history, publishing,
  bookmarks, recent notes, and mobile sidebar behavior.
- Per-vault git history plus explicit GitHub sync status, fetch, pull, push,
  remote setup, remote health checks, and remote-behind write guards.
- Basic Auth and read-only modes for safer single-user self-hosting.
- A small plugin runtime with manifest discovery, catalog installs, workers,
  iframe UI panels, markdown postprocessors, commands, and editor commands.
- Obsidian-vault import preflight that preserves markdown unchanged, detects
  `.obsidian`, attachment folders, media outside named attachment folders,
  Obsidian plugin folders, read-only Canvas files, and Git readiness before
  registration.
- Release verification that covers audit, type checking, build, auth smoke,
  read-only smoke, and Playwright e2e.

The app is past prototype status. The remaining work is about making the
architecture honest, boring, and durable while filling daily-driver gaps.

## Main Risks

1. **Browser-global UX primitives leaking into features.** Commands and plugin
   failures should use app-level dialogs and toasts, not `alert()` or
   `confirm()`.
2. **Large components still carry too many responsibilities.** `GraphView`,
   `GitSyncPanel`, `PluginPanel`, `FileTreePanel`, and `NoteView` should keep
   shedding pure logic into modules.
3. **Sync is real but still manual.** The current model is safe and explicit,
   but users need clearer recovery flows and future automation that never hides
   git conflicts.
4. **Plugin API must stay small.** Obsidian compatibility pressure can easily
   turn into a maintenance trap.
5. **Desktop distribution is not finished.** Local self-contained builds exist;
   cross-platform release automation needs GitHub workflow publishing with a
   credential that has `workflow` scope.
6. **Roadmap claims need to mean verified behavior.** If a feature is marked
   done, it should either have coverage or a documented verification path.

## Refactor Direction

Use small, pushable slices:

- Move shared UI infrastructure into reusable modules before adding more
  feature surface.
- Keep server mutation routes thin and delegate disk/git behavior to
  `src/lib/server/*`.
- Keep client commands declarative and route user interaction through shared
  dialog/toast APIs.
- Keep pure logic outside Svelte files when it is testable without the DOM.
- Prefer conservative git sync semantics: fetch, inspect, fast-forward pull,
  clean push, manual diverged recovery.

## Recently Landed Slices

- **App dialog/toast infrastructure.** Replace native browser dialogs in core
   commands, note interactions, templates, file-tree mutations, and plugin
   failures.
- **Git sync UX extraction.** Keep command builders and state labels outside
   `GitSyncPanel`; move remaining branch/status rendering helpers into modules.
- **Git sync component split.** Keep `GitSyncPanel` focused on orchestration
   by moving status-card and recovery-state markup into dedicated components.
- **Note view split.** Extract metadata, wikilink navigation, save/reload, and
   link-create behavior from `NoteView` so the component focuses on layout and
   editor/preview switching.
- **Plugin panel split.** Separate plugin install state, manifest validation
   feedback, catalog rendering, and installed-plugin rendering.
- **Import and migration helpers.** Add an Obsidian-vault import checklist:
   ignore `.obsidian`, detect attachment folders, flag media outside named
   attachment folders, preserve plugin settings and Canvas files unchanged, and
   recommend git initialization before first sync.
- **Graph view projection extraction.** Move graph filtering, visible-edge
   projection, selection-box math, and screen-to-graph coordinate conversion
   into pure helpers with focused tests.
- **Read-only Canvas preview.** Show `.canvas` files in the tree, open them in
   workspace tabs and panes, parse Obsidian Canvas JSON server-side, and render
   a read-only node/edge board.
- **Canvas file operations.** Rename, move, and delete `.canvas` files through
   the same git-backed file tree flow as notes and folders.
- **File tree toolbar split.** Move new-note/new-folder, sort, auto-reveal,
   and expand/collapse controls out of `FileTreePanel` into a presentational
   toolbar component.
- **Graph canvas split.** Move SVG node/edge/selection-box rendering out of
   `GraphView` into `GraphCanvas` so the graph tab keeps state, simulation,
   and pointer logic separate from rendering.
- **Obsidian image embed sizing.** Support image embed pipe metadata such as
   `![[image.png|300]]` and `![[image.png|300x200]]` in read mode and static
   publish output.
- **Markdown image asset compatibility.** Resolve standard Markdown image links
   relative to their source note, preserve Obsidian-style alt/size metadata, and
   copy local image assets during static publish.
- **Attachment embed compatibility.** Render Obsidian-style PDF, audio, video,
   and file embeds from vault-local assets and copy non-image attachments into
   static publish output.
- **Release verifier isolation.** Run release Playwright verification on a fresh
   local port and serve production static assets through an e2e preview wrapper
   that returns clean 404s instead of crashing on stale immutable chunk requests.
- **Dirty sync recovery state.** Surface local uncommitted vault changes as a
   distinct warning/review state with file visibility and commit/stash recovery
   commands.
- **Graph toolbar split.** Move graph counts, selection clear, settings toggle,
   reset, and centering controls out of `GraphView` into a presentational
   `GraphToolbar` component.
- **Graph interaction helper extraction.** Move zoom, pan, drag-threshold,
   selection-toggle, and node-open title logic out of `GraphView` into pure
   graph helpers with focused tests.
- **Canvas SVG export.** Export read-only Obsidian Canvas boards as sanitized
   SVG snapshots from the server and expose the download action in Canvas tabs.

## Next Implementation Slices

1. **Component diet.** Continue extracting `GraphView`, `GitSyncPanel`, and
   `FileTreePanel` into pure helpers and small presentational pieces.
2. **Obsidian compatibility gaps.** Add verified handling for more daily-driver
   import edges such as Canvas editing, richer attachment metadata, and
   plugin-settings visibility without executing Obsidian plugins.
3. **Verification hardening.** Add tests for remaining dialog-driven
   destructive actions and sync recovery flows before expanding automation.

## Verification Gates

Before calling a buildout slice shippable:

- `npm run check`
- targeted Playwright test for the changed user flow
- `npm run verify:release` before release-facing changes
- `git diff --check`
- pushed branch hash verified against upstream and `git ls-remote`

Exactness rule: "pushed", "synced", and "same" are exact claims only. If a
check is partial, say it is partial and name the exact scope.
