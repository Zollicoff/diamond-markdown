# Open-Source Obsidian Replacement Plan

Diamond Markdown is already past a basic notes app: vaults, wikilinks,
backlinks, graph, live preview, git history, templates, daily notes, ranked
indexed search, tags, embeds, publishing, PWA app-shell caching, conservative
GitHub sync, attachment organization, Obsidian import guidance, plugin
scaffolding, and broad Canvas compatibility exist. This plan now tracks the
remaining work needed to keep it trustworthy as an open-source daily driver
without overstating full Obsidian ecosystem parity.

## Current Assessment

Strengths:
- Clear single-app architecture: SvelteKit frontend, server-only filesystem/git
  code, no database, no Electron.
- User-owned markdown and git history are the right differentiators against
  proprietary sync.
- The feature surface covers most core Obsidian workflows.
- Release verification covers dependency audit, Svelte diagnostics, clean
  production build, Basic Auth smoke, read-only smoke, and the full Playwright
  suite.

Risks:
- Server APIs are single-user and powerful by design. Any public deployment
  needs Basic Auth, read-only mode, Tailscale, or an authenticated reverse proxy
  before it is safe.
- Large-vault work has improved through index caching, virtualized file/search
  views, vault-local saved searches, and graph scale paths, but grouped search
  polish is still basic.
- File/path safety must remain centralized; any new disk-touching route should
  go through `src/lib/server/paths.ts`.
- The plugin system is intentionally small. Expanding it toward full Obsidian
  API compatibility would lock in maintenance burden and is not a core goal.
- Desktop has a Tauri shell and current-host self-contained preflight, but
  cross-platform release automation, signing, notarization, and artifact upload
  remain open.

## Next Moves

### 1. Keep The Core Verified

- Preserve zero-error `npm run check` as a release gate.
- Keep route-level tests around path traversal, symlink escape prevention, raw
  asset headers, note/folder mutations, Canvas mutations, and sync guards.
- Keep indexer coverage around backlinks, aliases, tags, embeds, rename
  rewrites, deleted notes, and unlinked mentions.
- Use `npm run verify:release` as the canonical local gate for dependency
  audit, type checking, production build, auth/read-only smoke, and browser
  coverage.

### 2. Make It Safe To Self-Host

- Keep documenting localhost/Tailscale/reverse-proxy deployment as the safe
  default; there is no built-in multi-user authorization model yet.
- Basic Auth is available via `DIAMOND_BASIC_AUTH`; trusted-header auth remains
  a possible later proxy integration.
- Server-enforced `DIAMOND_READ_ONLY` mode is available for browse-only demos;
  future work can hide more write controls in the UI.
- Keep raw asset serving sandboxed and non-executable.

### 3. Make Sync Real

- Maintain the explicit git status/sync/fetch/pull/push UI per vault.
- Keep write APIs blocked after fetch when the remote is behind, diverged, or
  merge-conflicted.
- Keep remote setup instructions, health checks, incoming-file review, safe
  one-click sync, and divergence recovery visible.
- Treat background sync and automatic conflict resolution as future work only
  if they can preserve git transparency.

### 4. Improve Daily-Driver UX

- Continue mobile polish around touch-friendly dense controls and context menus.
- Keep service-worker behavior limited to the app shell and immutable assets;
  vault APIs stay server-backed so note/git state does not go stale silently.
- Consider bulk file operations when they can reuse existing path-safety and
  git-backed mutation helpers.
- Continue import helpers for remaining Obsidian configuration edges without
  executing Obsidian plugins or silently rewriting vault files.

### 5. Scale Large Vaults

- Keep the persisted vault index cache warm across restarts.
- File tree and search result virtualization are present; preserve coverage as
  rendering changes.
- Keep improving advanced search ergonomics, especially grouping, and consider
  a token/inverted index only if real-world vaults
  outgrow the current ranked indexed body corpus.
- Graph scale paths exist; keep cosmetic graph parity secondary to correctness
  and responsiveness.

### 6. Plugin System, Small And Late

- Keep the plugin surface intentionally small: commands, markdown
  postprocessors, editor commands, settings panels, and right-panel views.
- Run plugin logic in workers/iframes, not the app's privileged server context.
- Require explicit per-vault plugin enablement and capability-mediated file or
  editor access.
- Do not chase full Obsidian plugin API parity.

### 7. Open-Source Readiness

- Keep `SECURITY.md`, self-hosting guidance, release checklist, and parity audit
  current as product claims change.
- Add issue templates and `CHANGELOG.md` before the next tagged public release.
- Add screenshots/GIFs generated from the actual app, not the marketing site.
- Keep contributor architecture guidance focused on safe file APIs, command
  registration, workspace state, sync boundaries, and plugin capability limits.

## Near-Term Release Target

For the next public milestone, aim for:
- zero type-check errors
- zero moderate/high audit findings
- green full release verifier
- exact claim boundary in README, ROADMAP, and parity audit
- current-host desktop release rehearsal passing
- no claim of full Obsidian plugin, Canvas, sync, offline, or desktop parity
  beyond verified behavior

That combination keeps Diamond Markdown credible as an open-source Obsidian
alternative without pretending the plugin ecosystem, full visual Canvas parity,
automatic conflict-free sync, or cross-platform desktop release story is
finished.
