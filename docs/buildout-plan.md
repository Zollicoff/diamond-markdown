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
- **Note view split.** Extract metadata, wikilink navigation, save/reload, and
   link-create behavior from `NoteView` so the component focuses on layout and
   editor/preview switching.
- **Plugin panel split.** Separate plugin install state, manifest validation
   feedback, catalog rendering, and installed-plugin rendering.

## Next Implementation Slices

1. **Import and migration helpers.** Add an Obsidian-vault import checklist:
   ignore `.obsidian`, detect attachment folders, preserve markdown unchanged,
   and recommend git initialization before first sync.
2. **Verification hardening.** Add tests for dialog-driven destructive actions,
   sync recovery copy, plugin install replacement behavior, and import helpers.

## Verification Gates

Before calling a buildout slice shippable:

- `npm run check`
- targeted Playwright test for the changed user flow
- `npm run verify:release` before release-facing changes
- `git diff --check`
- pushed branch hash verified against upstream and `git ls-remote`

Exactness rule: "pushed", "synced", and "same" are exact claims only. If a
check is partial, say it is partial and name the exact scope.
