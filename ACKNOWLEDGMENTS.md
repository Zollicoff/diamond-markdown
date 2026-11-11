# Acknowledgments

Diamond is an original implementation, licensed MIT. It is built on other
people's libraries, named here with the license each is used under.

## Interface

- **[GPUI](https://www.gpui.rs)** (Zed Industries), Apache-2.0: the
  GPU-rendered UI framework.
- **[GPUI Kit](https://gpui-kit.com)** (Longbridge), Apache-2.0: the
  component library, including the text editor and Markdown renderer, and
  the icons it bundles from Lucide.
- **Tree-sitter** and its Markdown grammar, MIT: syntax highlighting in the
  editor.

Zed's own editor crates are GPL-3.0 and are not used.

## Notes and files

- **pulldown-cmark**, MIT: Markdown structure.
- **yaml-rust2**, MIT or Apache-2.0: note properties.
- **notify**, CC0-1.0: watching the vault folder for changes.
- **walkdir**, Unlicense or MIT: listing the vault.
- **rayon**, MIT or Apache-2.0, and **memchr**, Unlicense or MIT: indexing
  and search.

## Everything else

- **serde** and **toml**, MIT or Apache-2.0: settings files.
- **chrono**, MIT or Apache-2.0: dates.
- **thiserror**, MIT or Apache-2.0, and **async-channel**, Apache-2.0 or
  MIT.
- **tempfile**, MIT or Apache-2.0: tests only.

`Cargo.lock` lists every package the build uses, with its exact version.
