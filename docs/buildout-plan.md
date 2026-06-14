# Diamond Markdown Buildout Plan

This is the working plan for turning Diamond Markdown into a credible
open-source Obsidian-style daily driver with GitHub sync.

## Current State

Diamond Markdown already has the right foundation:

- SvelteKit app shell with server-only filesystem and git code.
- Vault registry, file tree, editor, live preview, read mode, backlinks,
  outgoing links, tags, graph view, templates, daily notes, history, publishing,
  git-backed bookmarks, recent notes, and mobile sidebar behavior.
- Per-vault git history plus explicit GitHub sync status, fetch, pull, push,
  remote setup, remote health checks, and remote-behind write guards.
- Basic Auth and read-only modes for safer single-user self-hosting.
- A small plugin runtime with manifest discovery, catalog installs, workers,
  iframe UI panels, markdown postprocessors, commands, and editor commands.
- Obsidian-vault import preflight that preserves markdown unchanged, detects
  `.obsidian`, attachment folders, media outside named attachment folders,
  supported Obsidian app settings, core-plugin and hotkey migration guidance,
  Obsidian plugin folders with manual settings-migration guidance, Canvas files,
  and Git readiness before registration.
- Obsidian-ready ZIP export that preserves vault content and `.obsidian` config
  while excluding Diamond metadata, generated publish output, and git internals.
- Release verification that covers audit, type checking, build, auth smoke,
  read-only smoke, and batched full-suite Playwright e2e.

The app is past prototype status. The remaining work is about making the
architecture honest, boring, and durable while filling daily-driver gaps.
The product-level gap matrix lives in
[docs/obsidian-parity-audit.md](./obsidian-parity-audit.md); use it to pick
work that moves Diamond toward the Obsidian-style daily-driver goal, not merely
the next convenient subsystem slice.

## Main Risks

1. **Browser-global UX primitives leaking into features.** Commands and plugin
   failures should use app-level dialogs and toasts, not `alert()` or
   `confirm()`.
2. **Large components still carry too many responsibilities.** `GraphView`,
   `GitSyncPanel`, `PluginPanel`, `FileTreePanel`, and `NoteView` should keep
   shedding pure logic into modules.
3. **Sync is real but still too manual.** The current model is safe and
   explicit, but users need one obvious "Sync now" path plus recovery flows
   that never hide git conflicts.
4. **Plugin API must stay small.** Obsidian compatibility pressure can easily
   turn into a maintenance trap.
5. **Desktop distribution is not finished.** Local self-contained builds and
   unsigned GitHub Actions artifact builds exist; signed/notarized release
   publishing still needs release credentials and policy.
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
- **Release build-output hardening.** Bound production build hangs with a
   timeout/retry in `verify:release`, and make the Playwright webserver verify
   required adapter-node output before importing the production handler.
- **Batched release Playwright verification.** Run full-suite Playwright
   release checks through deterministic file/test batches, each on its own
   local port, so release verification keeps exact coverage without one long
   fragile browser process.
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
- **Canvas text-card markdown preview.** Render Canvas text cards through a
   safe, lightweight markdown preview for headings, lists, tasks, quotes,
   inline emphasis, links, wikilinks, and fenced code while keeping the raw
   text editor available.
- **Sync recovery tree refresh.** Invalidate the vault tree after successful
   pull/sync operations and verify the incoming-remote-changes recovery panel
   can sync from the visible UI while newly pulled files appear without a
   manual page refresh.
- **Obsidian export package.** Download a portable ZIP of vault files from
   Settings, preserving `.obsidian` configuration and excluding `.diamondmd`,
   `.diamond-publish`, `.git`, `node_modules`, and `.DS_Store` metadata.
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
- **Canvas asset file previews.** Render vault-local image previews and raw
   asset links for Canvas file cards that point at attachments, while keeping
   Markdown and `.canvas` paths as workspace-tab targets.
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
   original `.canvas` file, and edit node/edge colors through validated
   git-backed Canvas mutations.
- **Honest public roadmap cleanup.** Align README, ROADMAP, and the open-source
   Obsidian plan with the parity audit so public docs claim core Obsidian-style
   workflows, conservative GitHub sync, and broad Canvas compatibility without
   implying full Canvas/plugin/offline/desktop parity.
- **Obsidian attachment-folder uploads.** Honor a safe
   `.obsidian/app.json` `attachmentFolderPath` for new uploads, falling back to
   `Attachments/` when the setting is missing or unsafe.
- **Obsidian plugin settings guidance.** Surface per-plugin migration notes for
   preserved Obsidian `data.json` files during import preview, including
   enabled state, manifest/settings health, top-level setting keys, and manual
   action text without executing plugins or dumping full settings values into
   the UI.
- **Graph data adapter extraction.** Move API-to-simulation graph conversion
   and dangling-edge filtering out of `GraphView` into a pure helper with
   deterministic tests.
- **Graph settings helper extraction.** Move settings defaults, storage keys,
   and persisted-value parsing out of `GraphView` into pure helpers with
   focused tests.
- **Obsidian plugin settings visibility.** Surface Obsidian plugin manifests,
   enabled state, and `data.json` presence in import preflight without
   executing or modifying Obsidian plugins.
- **Obsidian bookmark import.** Detect `.obsidian/bookmarks.json` and legacy
   `.obsidian/starred.json` during import preflight, seed visible note-level
   file bookmarks into `.diamondmd/bookmarks.json` on registration when no
   Diamond bookmark store exists, and commit that metadata file for git-backed
   imported vaults.
- **Obsidian link-style preference.** Honor safe `.obsidian/app.json`
   `useMarkdownLinks` by switching the editor link toolbar action between
   Obsidian wikilinks and Markdown link syntax without changing existing note
   content.
- **Obsidian editor line-number preference.** Honor `.obsidian/app.json`
   `showLineNumber` by showing or hiding CodeMirror's line-number gutter per
   vault while keeping Diamond's default line numbers when the setting is
   absent.
- **Search view presentation split.** Keep query execution, saved-search
   mutations, result paging, and virtual window orchestration in `SearchView`
   while moving header controls, saved-search chrome, and result-list DOM/CSS
   into focused presentation components.
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
- **Attachment organization.** Bulk-move selected vault-local assets from the
   attachment picker into a safe destination folder, avoid filename collisions,
   and rewrite Obsidian embeds plus source-relative Markdown image links in one
   git-backed commit.
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
- **Canvas group label editing.** Rename or clear imported Obsidian Canvas
   group labels inline through the same git-backed stale-revision mutation
   path as other Canvas card edits.
- **Obsidian callout rendering.** Render `> [!TYPE]` callouts, including
   collapsed and expanded fold markers, in both read mode and static publish
   while preserving markdown inside the callout body.
- **Obsidian block-reference compatibility.** Render paragraph/list block IDs
   such as `^install-steps` as linkable anchors and preserve
   `[[Note#^block-id]]` fragments in Live Preview, read mode, and static
   publish.
- **Obsidian block-reference navigation.** Preserve `[[Note#^block-id]]`
   fragments in live preview links, read-mode routing, context menus, and
   editor/source scrolling.
- **Obsidian block-list frontmatter.** Parse block-list `tags` and `aliases`
   from imported vaults so tag indexes, search, and alias wikilinks match
   common Obsidian frontmatter without rewriting note files.
- **File tree mutation helper extraction.** Move rename and drag/drop mutation
   classification out of `FileTreePanel` into pure tree helpers with coverage
   for note, Canvas, folder, and no-op rename cases.
- **Git sync controls split.** Move the remote configuration form and primary
   fetch/pull/push action row out of `GitSyncPanel` into focused
   presentational sync components while keeping API orchestration centralized.
- **Graph viewport helper extraction.** Move graph centering and client-to-SVG
   viewport coordinate math out of `GraphView` into pure interaction helpers
   with deterministic graph helper coverage.
- **Canvas edge-side compatibility.** Respect imported Obsidian Canvas
   `fromSide` and `toSide` anchors when drawing board and SVG export
   connections, edit those anchors through git-backed edge routing controls,
   and keep center anchors as the fallback.
- **Graph canvas edge helper extraction.** Resolve graph canvas edge endpoints
   in a pure helper so `GraphCanvas` renders prepared edge view data instead
   of doing repeated template lookups.
- **Graph canvas layer split.** Move SVG edge and node rendering out of
   `GraphCanvas` into focused `GraphEdgeLayer` and `GraphNodeLayer`
   components so the canvas wrapper owns only the SVG shell.
- **Canvas edge endpoint compatibility.** Preserve JSON Canvas `fromEnd` and
   `toEnd` metadata and render endpoint arrows in both the live board and SVG
   export, including the spec default arrow at the target endpoint; edit
   source/target arrowheads through the same edge routing controls.
- **Release build handoff hardening.** Verify that adapter-node production
   output and manifest-referenced server chunks are readable before starting
   auth, read-only, and Playwright release checks.
- **Safe one-click GitHub sync.** Add a `sync` action that fetches first, pulls
   fast-forward remote-only changes, pushes local-only commits or first-time
   remote branches, and stops on dirty, conflicted, or diverged states.
- **Index-backed full-text search.** Persist normalized note body text in the
   vault index cache and serve full-text queries from that index instead of
   reading every markdown file on each search request.
- **Search ranking and capped-result metadata.** Rank indexed full-text
   results across title, alias, path, and body matches, support multi-token
   fallback matches, and return total/limited metadata so UI surfaces do not
   imply every match is rendered.
- **Search query operators.** Support quoted phrases, `tag:`, `path:`,
   `file:`/`title:`, `content:`/`body:`, and leading `-` exclusions inside
   the indexed full-text search path.
- **Search boolean and regex terms.** Support uppercase `OR` groups and safe
   `/regex/` terms, including field-scoped regex such as
   `content:/roof\\s+photos/`, while rejecting invalid or risky regex patterns
   without crashing search.
- **Desktop release preflight.** Add `npm run verify:desktop-release` plus
   `docs/desktop-release.md` so current-host desktop bundle inputs, sidecars,
   signing inputs, and artifact expectations are checked before packaging.
- **Cross-platform release verifier launcher.** Run Playwright e2e preview
   setup through a Node launcher instead of Unix shell syntax, and make the
   release verifier invoke `npm.cmd` on Windows so future desktop matrix jobs
   can exercise the same release gate.
- **Search result virtualization.** Render large returned search result sets
   through a virtual window in the search tab, backed by pure view helpers and
   browser coverage for scrolling from the first to last returned match.
- **Search pagination beyond capped results.** Treat the search response limit
   as a page size instead of a hard stop, expose `offset`/`nextOffset`
   metadata, and let the Search tab load more ranked matches without
   over-rendering.
- **Search result folder grouping.** Keep ranked/paged search responses flat
   while adding a client-side grouped row model, virtualized folder headers,
   and Search tab controls so loaded results can be scanned by vault location
   without changing server search semantics.
- **Search folder facets.** Derive compact folder facets from loaded
   full-text results, expose one-click `path:` narrowing in the Search tab, and
   keep the server search response flat so facets remain a client-side
   dashboard affordance.
- **Saved searches.** Persist named title/full-text searches in
   `.diamondmd/searches.json`, commit changes with the vault, and expose compact
   restore/delete controls in the Search tab so recurring searches follow
   GitHub sync.
- **Git-backed bookmarks.** Persist per-vault bookmarks in
  `.diamondmd/bookmarks.json`, commit user bookmark changes, and update stored
  bookmark paths during note/folder rename and delete operations so bookmarks
  follow GitHub sync with the vault.
- **Unlinked mentions.** Surface notes that mention the active note title,
   stem, or aliases without already wikilinking it, using the existing index
   and right-panel link list instead of a new vault scan.
- **Obsidian app config guidance.** Parse supported `.obsidian/app.json`
   settings during import preflight, surface safe attachment-folder behavior
   and migration notes for new-note/link/delete preferences, and reuse the same
   safe folder parser for attachment uploads and attachment organization.
- **Obsidian Appearance guidance.** Surface `.obsidian/appearance.json` theme,
   font, accent, and CSS snippet filenames as read-only migration guidance
   without loading Obsidian community themes, CSS snippets, or raw CSS contents.
- **Obsidian core-plugin and hotkey guidance.** Surface
   `.obsidian/core-plugins.json` support levels and sanitized
   `.obsidian/hotkeys.json` shortcut summaries as migration guidance, mapping
   known Obsidian command IDs to Diamond command equivalents without
   enabling/disabling features or remapping shortcuts automatically.
- **Obsidian configured new-note folder.** Use a safe
   `.obsidian/app.json` `newFileLocation: "folder"` plus
   `newFileFolderPath` as the default destination for generic new-note
   commands, while folder context-menu actions continue to create notes in the
   selected folder.
- **Obsidian link-update preference.** Honor
   `.obsidian/app.json` `alwaysUpdateLinks: false` by leaving existing
   note/folder references unchanged during explicit note and folder rename or
   move operations; keep reference-safe rewrites as the default when the
   setting is missing or enabled.
- **Obsidian Markdown-link preference.** Honor `.obsidian/app.json`
   `useMarkdownLinks: true` for the editor link toolbar button so new inserted
   links use Markdown `[]()` syntax while existing wikilinks and imported notes
   remain untouched.
- **Obsidian line-number preference.** Honor `.obsidian/app.json`
   `showLineNumber: false` by hiding the editor line-number gutter for that
   vault while leaving Diamond's default gutter visible when the setting is
   missing.
- **Obsidian Daily Notes settings.** Reuse safe `.obsidian/daily-notes.json`
   `folder`, `template`, and Moment-style date-format settings for the daily
   note command, with unsafe paths falling back to Diamond defaults.
- **Obsidian Templates settings.** Reuse safe `.obsidian/templates.json`
  `folder`, `dateFormat`, and `timeFormat` settings for the insert-template
  picker, with unsafe settings falling back to Diamond defaults and the import
  preflight surfacing supported fields only.
- **Git sync incoming-file recovery.** Populate remote changed paths for
  behind-only sync states and show incoming file names beside the recovery
  controls before users pull or run one-click sync.
- **Canvas node resizing.** Resize Canvas cards from the board, preview the
  dimensions while dragging, and persist clamped width/height updates through
  the same git-backed stale-revision mutation path as moves and edits.
- **Canvas file-card subpaths.** Preserve JSON Canvas file-node `subpath`
  values, expose them in the file-card editor, and route Markdown file cards to
  heading or block anchors without changing asset or nested-Canvas handling.
- **Canvas viewport zoom.** Add Canvas zoom in/out/reset/fit controls with a
  scaled board shell and zoom-aware node drag/resize math so board navigation
  is closer to the Obsidian Canvas daily-driver workflow.
- **Canvas text-card callouts.** Render Obsidian `> [!TYPE]` callout blocks in
  the lightweight Canvas text-card preview, preserving open/closed fold markers
  while leaving raw card text editable.
- **Canvas text-card tables.** Render simple Markdown pipe tables in the
  lightweight Canvas text-card preview, with inline formatting inside cells and
  compact overflow handling.
- **Canvas text-card highlight and strikethrough.** Render Obsidian-style
  `==highlight==` and common Markdown `~~strikethrough~~` inline marks in the
  lightweight Canvas text-card preview while leaving the raw card text editable.
- **Canvas text-card asset embeds.** Render standalone Obsidian embeds and
  Markdown image syntax that point at safe vault-local assets inside Canvas
  text-card previews, using the existing raw-asset route and preserving the raw
  editable card text.
- **Canvas text-card note and Canvas embeds.** Render explicit standalone
  `![[Note.md#Heading]]` and `![[Board.canvas]]` lines as internal preview
  chips in Canvas text cards, preserving safe heading/block subpaths and
  leaving alias-only unresolved embeds conservative.
- **Canvas text-card explicit wikilinks.** Render explicit inline
  `[[Note.md#Heading|label]]` and `[[Board.canvas|label]]` links as internal
  preview navigation targets in Canvas text cards while leaving alias-only
  links conservative.
- **Canvas text-card resolved wikilinks.** Resolve inline Canvas text-card note
  wikilinks through the vault index by path, title, stem, or alias, preserving
  heading/block subpaths while leaving missing links inert and `.canvas` links
  explicit.
- **Canvas text-card resolved note embeds.** Resolve standalone Canvas
  text-card note embed chips through the same vault index by path, title,
  stem, or alias, preserving heading/block subpaths while leaving missing
  embeds literal and `.canvas` embeds explicit.
- **Canvas text preview split.** Keep text-card draft editing, save/delete
  actions, and mutation callbacks in `CanvasTextNodeEditor` while moving the
  markdown-aware preview renderer and internal note/Canvas navigation into a
  focused `CanvasTextPreview` component.
- **Desktop release workflow.** Add `.github/workflows/desktop-release.yml` to
  run the web release gate, desktop preflight, self-contained Tauri build, and
  unsigned bundle artifact upload across macOS, Windows, and Linux.
- **Desktop artifact manifests.** Generate and upload per-platform desktop
  artifact manifests containing source commit/ref, package and Tauri versions,
  runner platform, requested bundle targets, file sizes, and SHA-256 hashes so
  unsigned CI bundles are ready for later GitHub Release publishing policy.

## Next Implementation Slices

1. **Signed desktop release publishing.** Configure signing/notarization
   secrets, release notes, installer policy, and GitHub Release attachment
   automation once Zach is ready to publish public desktop installers.
2. **Obsidian compatibility gaps.** Add verified handling for more daily-driver
   import edges such as deeper Canvas formatting support and remaining
   Obsidian config interpretation without executing Obsidian plugins.
3. **Verification hardening.** Add tests for remaining dialog-driven
   destructive actions and sync recovery flows, and keep release checks
   batched when the full suite grows.
4. **Component diet.** Continue extracting large views only when the split
   directly supports a product-facing feature or verification gap.

## Verification Gates

Before calling a buildout slice shippable:

- `npm run check`
- targeted Playwright test for the changed user flow
- `npm run verify:release` before release-facing changes
- `git diff --check`
- pushed branch hash verified against upstream and `git ls-remote`

Exactness rule: "pushed", "synced", and "same" are exact claims only. If a
check is partial, say it is partial and name the exact scope.
