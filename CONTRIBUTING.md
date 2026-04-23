# Contributing to DiamondMD

Thanks for considering a contribution. DiamondMD is young and the cost of early decisions is high, so please open an issue before starting a PR if you're planning something larger than a bugfix.

## Style

- **TypeScript strict** — no `any` unless there's a comment explaining why
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — no legacy `$:` reactive syntax
- **Vanilla CSS** — no Tailwind, no CSS-in-JS. Colors come from CSS custom properties defined on `:root`
- **No dependencies without a good reason** — the bundle stays small; prefer standard library over a package for anything trivial

## Path safety

Every server route that reads or writes a file goes through `src/lib/server/paths.ts`'s resolver. Never `fs.readFile(req.body.path)`. If your code takes a path from the client, it must be vault-relative and go through the resolver.

## Commits

Conventional-ish, but not strict. Aim for one logical change per commit. Examples of good messages:

- `editor: wire Cmd-K quick switcher`
- `server: fix backlink index missing on rename`
- `docs: clarify vault registry format in README`

One-line subject ≤ 72 chars. Body optional; use it if the "why" matters.

## Tests

We don't have a test suite yet. If your change warrants one (tricky path handling, regex, index invariants), write a test next to the code (`paths.test.ts` next to `paths.ts`). We'll formalize the test runner when we add the second test.

## Issues

- **Bug report**: what did you do, what did you expect, what happened, environment (OS, node version, vault size)
- **Feature request**: what problem are you solving, and is the feature already on the [roadmap](./ROADMAP.md)?
