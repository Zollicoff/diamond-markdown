# Contributing to Diamond

Diamond is young and early decisions are expensive to undo, so please open
an issue before starting anything larger than a bug fix.

## Rules that do not bend

- **Written from scratch.** Never copy, decompile or reverse-engineer
  another app's code or styles, and take no code from other note-taking apps
  or reimplementations of them. Zed's GPL crates cannot be used: Diamond is
  MIT.
- **Diamond's own conventions.** It does not read or write another app's
  settings or files, and does not run or imitate another app's plugins or
  themes. Features are not added for the sake of compatibility.
- **No web technology** in the app: no web view, no bundled browser.

## Before sending a change

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

All three must pass; CI runs the same commands on macOS and Linux.

- A change in behaviour comes with a test. Logic is tested without a window;
  what the window does is tested in `crates/diamond-app/src/workspace/tests.rs`,
  which drives the real views with real keystrokes and clicks.
- Only `diamond-vault` touches the vault folder. Everything else names files
  through `VaultPath`, which cannot leave the vault.
- A feature is a plugin: a module in `crates/diamond-app/src/plugins` that
  uses only the interface in `plugin.rs`.

## Dependencies

Add one only with a good reason. A release must be at least 14 days old
before it is locked: after any `cargo update`, run

```sh
python3 scripts/release-age.py --pin
```

## Commits

One logical change per commit, with a subject of 72 characters or fewer that
starts with the area: `app: add tabs and split panes`,
`index: fix backlinks after a rename`. Use the body when the reason matters.

## Issues

- **Bug:** what you did, what you expected, what happened, and your system
  (OS, vault size).
- **Feature:** the problem you are trying to solve.
