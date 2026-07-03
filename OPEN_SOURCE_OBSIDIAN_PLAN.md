# Open-Source Obsidian Replacement Plan

Diamond Markdown is already past a basic notes app: vaults, wikilinks,
backlinks, graph, live preview, git history, templates, daily notes, search,
tags, embeds, publishing, and PWA plumbing exist. The next work should make it
trustworthy as an open-source daily driver.

## Current Assessment

Strengths:
- Clear single-app architecture: SvelteKit frontend, server-only filesystem/git
  code, no database, no Electron.
- User-owned markdown and git history are the right differentiators against
  proprietary sync.
- The feature surface covers most core Obsidian workflows.
- E2E coverage exists for boot, workspace shell, graph/search/settings,
  shortcuts, wikilinks, and editor toolbar behavior.

Risks:
- Server APIs are single-user and powerful by design. Any public deployment
  needs an auth/reverse-proxy story before it is safe.
- Large-vault performance is still mostly in-memory scans and recursive trees.
- File/path safety must remain centralized; any new disk-touching route should
  go through `src/lib/server/paths.ts`.
- The plugin system is still a major design risk. A too-large API would lock in
  maintenance burden before the core is stable.

## Next Moves

### 1. Stabilize The Core

- Finish reducing `svelte-check` warnings, especially remaining accessibility
  warnings in workspace tabs, graph, preview, and pane focus handling.
- Add route-level tests for path traversal, symlink escape prevention, raw asset
  headers, note create/read/update/delete, rename, duplicate, and folder moves.
- Add indexer tests for backlinks, aliases, tags, embeds, rename rewrites, and
  deleted notes.
- Add a release checklist: `npm run check`, `npm run build`, `npm run test:e2e`,
  `npm audit --audit-level=moderate`.

### 2. Make It Safe To Self-Host

- Document the security model in README: localhost/Tailscale/reverse proxy by
  default, no built-in multi-user auth yet.
- Add optional basic auth or trusted-header auth for simple self-hosted installs.
- Add read-only mode for public demos and sample vaults.
- Keep raw asset serving sandboxed and non-executable.

### 3. Make Sync Real

- Add explicit git status/pull/push UI per vault.
- Add conflict detection before save when the working tree diverges.
- Add a conflict-resolution workflow for remote pulls and local edits.
- Support per-vault remote setup instructions and health checks.

### 4. Improve Daily-Driver UX

- Finish mobile ergonomics: sidebar gestures, tab switching, editor controls,
  and touch-friendly context menus.
- Add service worker/offline behavior with clear conflict rules.
- Add bulk file operations: multi-select, move, delete, rename, and command
  palette actions over selections.
- Add import helpers for existing Obsidian vaults, including attachment folders,
  `.obsidian` ignore defaults, and common frontmatter patterns.

### 5. Scale Large Vaults

- Add persisted index cache keyed by file mtimes and content hashes.
- Virtualize the file tree and search results.
- Replace full-text substring scans with an indexed search backend when vaults
  exceed a configurable threshold.
- Replace graph O(n^2)-style interactions with spatial indexing for large
  graphs.

### 6. Plugin System, Small And Late

- Start with three extension points only: markdown render extension, command
  registration, and side-panel view.
- Run plugin logic in workers/iframes, not the app's privileged server context.
- Require explicit per-vault plugin enablement.
- Treat plugin persistence and filesystem access as separate capabilities.

### 7. Open-Source Readiness

- Add issue templates for bug reports, feature requests, and security reports.
- Add `SECURITY.md` with supported versions and private disclosure process.
- Add `CHANGELOG.md` before the next tagged release.
- Add screenshots/GIFs generated from the actual app, not the marketing site.
- Add a contributor architecture guide focused on safe file APIs, command
  registration, and workspace state.

## Near-Term Release Target

For the next public milestone, aim for:
- zero type-check errors
- zero moderate/high audit findings
- green e2e suite
- explicit self-hosting/security documentation
- git sync status UI
- path/indexer route tests
- mobile polish pass

That combination makes Diamond Markdown credible as an open-source Obsidian
alternative without pretending the plugin ecosystem or large-vault story is
finished.
