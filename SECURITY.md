# Security policy

Diamond is a desktop app for one person on their own computer. It is
pre-release; fixes go to the development branch.

## What the app can touch

- **The vault folder.** Diamond reads and writes files only inside the vault
  you open. Paths are checked so that neither `..` nor a symlink can lead
  outside it (`crates/diamond-vault`). Deleted files are moved to
  `.diamond/trash` inside the vault, not removed.
- **Its settings folder**, for the list of vaults you have opened and how the
  app looks.
- **Other programs.** The git commands run the `git` that is installed, with
  your own identity, credentials and remotes, and only when you run them.
  Clicking a web link, or a file Diamond cannot show itself, hands it to the
  system's default app.

The app makes no network connections of its own and has no account, server
or telemetry.

## Reporting a vulnerability

Please do not open a public issue for anything that could expose or destroy
notes: a path that escapes the vault, a file overwritten or lost, or code
run from the contents of a note.

Contact the maintainer privately with the commit, the steps to reproduce,
the impact, and any files that show it.
