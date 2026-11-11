# Diamond

A Markdown knowledge-base app for macOS and Linux. Notes are plain Markdown
files in a folder, linked to each other with `[[wikilinks]]`, with the tools
to write, find and connect them.

Diamond is a native app written in Rust and drawn on the GPU with
[GPUI](https://www.gpui.rs). There is no web view in it. It is MIT licensed.

**Status:** in development on the `desktop-rewrite` branch. Nothing is
released yet.

## Try it

```sh
cargo run -p diamond-app -- sample-vault
```

That opens the small vault in this repository, which has a note for each
thing worth trying. Without a folder, Diamond reopens the last vault, or asks
for one the first time.

Rust comes from [rustup](https://rustup.rs), which reads the version from
`rust-toolchain.toml`. On Linux the system libraries GPUI needs are listed in
`.github/workflows/ci.yml`.

Press **Cmd-Shift-P** (Ctrl-Shift-P on Linux) for every command and its
shortcut.

## What it does

- Notes in tabs and side-by-side panes, saved as you type
- Links between notes, backlinks, tags and an outline that follows the editor
- Go to a note by name, and full-text search with `tag:` and `path:` filters
- A rendered reading view, and a live preview beside the editor
- Rename or move a note or folder, with every link to it rewritten
- Daily notes and templates with date placeholders
- Properties shown and edited beside the note
- Tasks from every note in one list, with due dates
- Queries: tables computed from notes and their properties
- A calendar of daily notes, a graph of links, boards and canvases
- Table commands, bookmarks, and versions and sync through git
- Light and dark appearance

`docs/desktop-architecture.md` describes each of these, the shortcuts, how
the code is laid out, and what is not built yet.

## Layout

```
crates/
  diamond-vault   file access: safe paths, atomic writes, watching
  diamond-parse   what a note contains: links, tags, headings, properties
  diamond-index   the vault as a whole: link resolution, search, queries
  diamond-app     the desktop app (binary: diamond)
sample-vault/     a vault to try the app on
docs/             architecture
scripts/          release-age.py, the dependency cooling-off check
```

## Development

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

The window tests run headless, so none of this needs a display. See
`CONTRIBUTING.md` before sending a change.

## License

MIT. See `LICENSE` and `ACKNOWLEDGMENTS.md`.
