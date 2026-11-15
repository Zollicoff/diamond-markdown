# Security policy

Diamond is a desktop app for one person on their own computer. It is not
released yet; fixes go to the development branch.

## What the app can touch

- **The vault folder.** Diamond reads and writes files only inside the vault
  you open. Paths are checked so that neither `..` nor a symlink can lead
  outside it (`crates/diamond-vault`). Deleted files are moved to
  `.diamond/trash` inside the vault, not removed.
- **Its settings folder**, for the list of vaults you have opened and how
  the app looks.
- **Other programs, when you ask.** The git commands run the `git` that is
  installed, with your own identity, credentials and remotes. Clicking a web
  link opens it in your browser, and opening a file Diamond cannot show
  hands it to the app your system uses for that kind of file.

[The guide](docs/guide.md#what-diamond-keeps-on-disk) lists every file
Diamond writes.

Diamond makes no network connections of its own. It has no account, no
server and no telemetry, and it does not fetch pictures or anything else
that a note links to on the web. The only network traffic it can cause is
git's, when you run "Git: sync with the remote".

Nothing in a note is run as code. Templates fill in a fixed set of
placeholders, and queries only read notes.

## Reporting a vulnerability

Please do not open a public issue for anything that could expose or destroy
notes: a path that escapes the vault, a file overwritten or lost, or code
run from the contents of a note or a vault.

Contact the maintainer privately with the commit, the steps to reproduce,
the impact, and any files that show it.
