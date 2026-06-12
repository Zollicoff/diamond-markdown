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
  Obsidian plugin folders, Canvas files, and Git readiness before
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
- **Canvas preview.** Show `.canvas` files in the tree, open them in workspace
   tabs and panes, parse Obsidian Canvas JSON server-side, and render node/edge
   boards.
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
- **Graph simulation runner extraction.** Move the RAF simulation lifecycle,
   frame cancellation, and per-frame reactivity callback out of `GraphView`
   into a deterministic graph runner module with lifecycle tests.
- **Graph stage split.** Move graph status, canvas staging, settings-panel
   mounting, and footer legend markup out of `GraphView` into a focused
   presentational component.
- **Attachment picker list split.** Keep attachment loading, selection, rename,
   delete, and insert orchestration in `AttachmentPicker` while moving the
   list, empty/error states, row metadata, and responsive row styling into a
   focused presentational component.
- **Markdown preview presentation split.** Keep markdown navigation,
   postprocessing, Mermaid rendering, and hover-preview state in `Preview`
   while moving the rendered markdown surface and hover-card DOM/CSS into
   focused presentational components.
- **Canvas stage split.** Keep Canvas loading, mutation, stale-revision, and
   drag orchestration in `CanvasView` while moving body states, warning
   display, edge-list mounting, and board mounting into a focused
   presentational component.
- **Canvas drag helper extraction.** Move Canvas node drag-state creation,
   pointer matching, position projection, and rounded movement math into a
   pure helper with deterministic coverage.
- **Graph drag coordinate helper.** Move graph node drag pinning math out of
   `GraphView` and into pure interaction helpers with deterministic coverage.
- **Note body split.** Keep note loading, saving, bus events, wikilink
   behavior, and attachment mutation in `NoteView` while moving toolbar,
   attachment upload status, editor/preview loading states, and dynamic view
   rendering into a focused body component.
- **Canvas SVG export.** Export Obsidian Canvas boards as sanitized SVG
   snapshots from the server and expose the download action in Canvas tabs.
- **Canvas text-card editing.** Add and edit Obsidian Canvas text cards through
   git-backed server mutations with stale-revision protection.
- **Canvas node positioning.** Drag Canvas cards to update node coordinates in
   `.canvas` files through git-backed commits with stale-revision protection.
- **Canvas edge creation.** Connect existing Canvas nodes from the board with
   optional labels and persist Obsidian-compatible edges through git-backed
   commits with stale-revision protection.
- **Canvas edge deletion.** List Canvas edges in the board view and remove
   them through git-backed commits with stale-revision protection.
- **Canvas edge label editing.** Edit or clear existing Canvas edge labels
   from the board view through git-backed commits with stale-revision
   protection.
- **Canvas file and URL node creation.** Add Obsidian-compatible file and URL
   cards from the Canvas board view through git-backed commits with
   stale-revision protection.
- **Canvas node deletion.** Remove Canvas cards from the board view and prune
   connected edges through git-backed commits with stale-revision protection.
- **Canvas file and URL node editing.** Edit Canvas file paths, URL targets,
   and optional display labels inline through git-backed commits with
   stale-revision protection.
- **Canvas file and URL node navigation.** Open Canvas file cards as vault note
   tabs and expose safe `http`/`https` URL-card links directly from the board.
- **Canvas file-card type routing.** Route Canvas file cards by extension:
   Markdown files open as note tabs, `.canvas` files open as Canvas tabs, and
   unsupported asset paths stay editable without pretending to be note tabs.
- **Canvas header split.** Move Canvas title, stats, add-node controls, edge
   creation controls, and SVG export markup out of `CanvasView` into focused
   presentational components.
- **Canvas board split.** Move Canvas SVG edge rendering and node-card layout
   out of `CanvasView` into a focused presentational board component.
- **Graph settings state extraction.** Move graph setting hydration,
   persistence, snapshots, and reset helpers out of `GraphView` into focused
   graph state modules with deterministic coverage.
- **File tree panel state extraction.** Move sort/auto-reveal preferences and
   expansion persistence out of `FileTreePanel` into focused tree state modules
   with deterministic parsing coverage.
- **Canvas color compatibility.** Render preserved Obsidian Canvas node and
   edge color metadata in the board and SVG export without rewriting the
   original `.canvas` file.
- **Obsidian attachment-folder uploads.** Honor a safe
   `.obsidian/app.json` `attachmentFolderPath` for new uploads, falling back to
   `Attachments/` when the setting is missing or unsafe.
- **Obsidian plugin settings guidance.** Surface top-level keys from preserved
   plugin `data.json` files during import preview without executing plugins or
   dumping full settings values into the UI.
- **Graph data adapter extraction.** Move API-to-simulation graph conversion
   and dangling-edge filtering out of `GraphView` into a pure helper with
   deterministic tests.
- **Graph settings helper extraction.** Move settings defaults, storage keys,
   and persisted-value parsing out of `GraphView` into pure helpers with
   focused tests.
- **Obsidian plugin settings visibility.** Surface Obsidian plugin manifests,
   enabled state, and `data.json` presence in import preflight without
   executing or modifying Obsidian plugins.
- **Shared pointer open-mode helper.** Move modifier-click and middle-click
   open-mode rules into a workspace helper used by note preview, search,
   file tree, bookmarks, and recent notes.
- **File tree virtualization helper extraction.** Move expanded-row flattening,
   viewport windowing, row styling, and drag/drop path ancestry helpers out of
   `FileTree` into pure tree helpers with focused tests.
- **File tree row split.** Keep virtualization, root drag/drop, and tree window
   state in `FileTree` while moving directory/file row rendering and rename
   input behavior into a focused presentational row component.
- **Attachment reference suffix preservation.** Resolve and publish asset
   embeds from clean vault paths while preserving `#fragment` and `?query`
   suffixes for images, PDFs, video, audio, and generic files.
- **Attachment upload affordance.** Drop or paste local files into the editor
   to copy them into `Attachments/`, commit them to vault git history, and
   insert Obsidian-style embed links.
- **Attachment picker.** List existing vault-local assets, filter them from the
   editor toolbar, and insert Obsidian-style embeds without re-uploading files.
- **Bulk attachment insertion.** Multi-select filtered vault assets from the
   attachment picker and insert multiple Obsidian-style embeds in one editor
   action.
- **Attachment deletion.** Delete selected vault-local assets from the
   attachment picker through confirmed, git-backed commits while leaving
   existing markdown references explicit.
- **Attachment rename with reference rewrite.** Rename one vault-local asset
   from the attachment picker and rewrite Obsidian embeds plus source-relative
   Markdown image links in the same git-backed commit.
- **Git sync recovery view split.** Move recovery headers, command blocks,
   file lists, and diverged-change view models out of the recovery panel so
   future GitHub conflict flows can stay small and testable.
- **Settings view section split.** Move settings navigation, appearance, vault,
   excluded-folder, and about sections into focused components with pure
   settings metadata helpers.
- **App dialog presentation split.** Keep event-bus subscriptions and promise
   resolution in `AppDialogs` while moving modal and toast DOM/CSS into focused
   presentation components backed by small dialog helper tests.
- **History diff and restore viewer.** Compare a selected git-history snapshot
   against the current saved note with tested line-level added/removed/
   unchanged rows, preserve raw snapshot copy, and restore a snapshot through a
   new git-backed save commit.
- **Stale-remote push guard.** Fetch remote refs before pushing so unseen
   GitHub commits turn into an explicit pull/divergence guard instead of a
   stale non-fast-forward push attempt.
- **Canvas group node compatibility.** Render imported Obsidian Canvas group
   nodes behind cards, include groups in SVG export, and create new group
   nodes through the git-backed Canvas toolbar.

## Next Implementation Slices

1. **Component diet.** Continue extracting `GraphView`, `GitSyncPanel`, and
   `FileTreePanel` into pure helpers and small presentational pieces.
2. **Obsidian compatibility gaps.** Add verified handling for more daily-driver
   import edges such as deeper Canvas formatting support, attachment folder
   organization, and deeper plugin-settings migration guidance without
   executing Obsidian plugins.
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
