//! Vault file access.
//!
//! A vault is a folder of Markdown files. This crate is the only code that
//! touches that folder: it validates paths, lists entries, reads notes and
//! writes them atomically. It has no UI and no index.

mod path;

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use walkdir::WalkDir;

pub use path::VaultPath;

/// Errors from vault operations.
#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    /// The path string is not a valid vault-relative path.
    #[error("invalid vault path: {0}")]
    InvalidPath(String),
    /// The path resolves outside the vault, usually through a symlink.
    #[error("{0} is outside the vault")]
    OutsideVault(String),
    /// The vault root does not exist or is not a folder.
    #[error("vault folder not found: {}", .0.display())]
    NotAVault(PathBuf),
    /// A filesystem error on a specific path.
    #[error("{path}: {source}")]
    Io {
        /// The vault-relative path, or the vault root for vault-wide errors.
        path: String,
        /// The underlying error.
        #[source]
        source: io::Error,
    },
}

/// A specialized `Result` for vault operations.
pub type Result<T> = std::result::Result<T, VaultError>;

/// What an entry in the vault is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EntryKind {
    /// A folder.
    Folder,
    /// A Markdown note (`.md`).
    Note,
    /// A JSON Canvas board (`.canvas`).
    Canvas,
    /// Any other file: images, PDFs, audio and so on.
    Attachment,
}

/// One file or folder in a vault.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    /// Where the entry is, relative to the vault root.
    pub path: VaultPath,
    /// What the entry is.
    pub kind: EntryKind,
    /// Size in bytes; zero for folders.
    pub size: u64,
    /// Last modification time, when the filesystem reports one.
    pub modified: Option<SystemTime>,
}

/// An open vault.
#[derive(Clone, Debug)]
pub struct Vault {
    root: PathBuf,
}

impl Vault {
    /// Opens the vault at `root`, which must be an existing folder.
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref();
        let canonical = root
            .canonicalize()
            .map_err(|_| VaultError::NotAVault(root.to_path_buf()))?;
        if !canonical.is_dir() {
            return Err(VaultError::NotAVault(root.to_path_buf()));
        }
        Ok(Self { root: canonical })
    }

    /// The vault's absolute, symlink-free root folder.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The vault's display name: the name of its root folder.
    pub fn name(&self) -> &str {
        self.root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Vault")
    }

    /// Turns a vault path into an absolute filesystem path.
    ///
    /// A [`VaultPath`] cannot contain `..`, but a symlink inside the vault
    /// can still point elsewhere. This follows the deepest part of the path
    /// that exists and rejects it if it leaves the vault root.
    pub fn resolve(&self, path: &VaultPath) -> Result<PathBuf> {
        let absolute = self.root.join(path.as_str());
        let mut probe = absolute.as_path();
        loop {
            match probe.canonicalize() {
                Ok(real) => {
                    if !real.starts_with(&self.root) {
                        return Err(VaultError::OutsideVault(path.to_string()));
                    }
                    return Ok(absolute);
                }
                Err(_) => match probe.parent() {
                    Some(parent) => probe = parent,
                    None => return Err(VaultError::OutsideVault(path.to_string())),
                },
            }
        }
    }

    /// Whether a file or folder exists at `path`.
    pub fn exists(&self, path: &VaultPath) -> bool {
        self.resolve(path).is_ok_and(|absolute| absolute.exists())
    }

    /// Reads a text file.
    pub fn read(&self, path: &VaultPath) -> Result<String> {
        let absolute = self.resolve(path)?;
        fs::read_to_string(&absolute).map_err(|source| io_error(path, source))
    }

    /// Writes a text file atomically, creating parent folders as needed.
    ///
    /// The content goes to a temporary file in the same folder, is flushed to
    /// disk, and is then renamed over the target. A crash or power loss
    /// leaves either the old file or the new one, never a truncated note.
    pub fn write(&self, path: &VaultPath, contents: &str) -> Result<()> {
        let absolute = self.resolve(path)?;
        let folder = absolute
            .parent()
            .ok_or_else(|| VaultError::OutsideVault(path.to_string()))?;
        fs::create_dir_all(folder).map_err(|source| io_error(path, source))?;

        let temporary = folder.join(temporary_name(path.file_name()));
        let written = (|| -> io::Result<()> {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(contents.as_bytes())?;
            file.sync_all()?;
            fs::rename(&temporary, &absolute)
        })();
        if let Err(source) = written {
            // Best effort: the write already failed, so report that error.
            let _ = fs::remove_file(&temporary);
            return Err(io_error(path, source));
        }
        Ok(())
    }

    /// Lists every visible file and folder in the vault, sorted by path.
    ///
    /// Entries whose name starts with a dot are skipped along with everything
    /// under them. That covers `.git`, `.obsidian`, `.trash` and our own
    /// temporary files. Symlinks are not followed and are not listed.
    pub fn entries(&self) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        let walker = WalkDir::new(&self.root)
            .min_depth(1)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| !is_hidden(entry.file_name()));

        for item in walker {
            let item = item.map_err(|error| VaultError::Io {
                path: error
                    .path()
                    .and_then(|p| p.strip_prefix(&self.root).ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                source: error.into(),
            })?;
            let file_type = item.file_type();
            if file_type.is_symlink() {
                continue;
            }
            let Some(relative) = item
                .path()
                .strip_prefix(&self.root)
                .ok()
                .and_then(|p| p.to_str())
            else {
                // Names that are not valid UTF-8 cannot be shown or linked.
                continue;
            };
            let Ok(path) = VaultPath::new(relative) else {
                continue;
            };

            let kind = if file_type.is_dir() {
                EntryKind::Folder
            } else {
                kind_for(&path)
            };
            let metadata = item.metadata().ok();
            entries.push(Entry {
                kind,
                size: match (&metadata, kind) {
                    (Some(meta), kind) if kind != EntryKind::Folder => meta.len(),
                    _ => 0,
                },
                modified: metadata.and_then(|meta| meta.modified().ok()),
                path,
            });
        }

        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(entries)
    }
}

fn kind_for(path: &VaultPath) -> EntryKind {
    match path.extension().map(str::to_ascii_lowercase).as_deref() {
        Some("md") => EntryKind::Note,
        Some("canvas") => EntryKind::Canvas,
        _ => EntryKind::Attachment,
    }
}

fn is_hidden(name: &std::ffi::OsStr) -> bool {
    name.to_str().is_none_or(|name| name.starts_with('.'))
}

fn temporary_name(file_name: &str) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let serial = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(".{file_name}.diamond-tmp-{}-{serial}", std::process::id())
}

fn io_error(path: &VaultPath, source: io::Error) -> VaultError {
    VaultError::Io {
        path: path.to_string(),
        source,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_with(files: &[(&str, &str)]) -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        for (path, contents) in files {
            let absolute = dir.path().join(path);
            fs::create_dir_all(absolute.parent().unwrap()).unwrap();
            fs::write(absolute, contents).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    #[test]
    fn open_rejects_missing_folder_and_plain_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            Vault::open(dir.path().join("nope")),
            Err(VaultError::NotAVault(_))
        ));
        let file = dir.path().join("note.md");
        fs::write(&file, "x").unwrap();
        assert!(matches!(Vault::open(&file), Err(VaultError::NotAVault(_))));
    }

    #[test]
    fn lists_entries_sorted_with_kinds_and_skips_hidden() {
        let (_dir, vault) = vault_with(&[
            ("Zeta.md", "z"),
            ("Projects/Plan.md", "plan"),
            ("Projects/board.canvas", "{}"),
            ("Assets/pic.PNG", "png"),
            (".obsidian/app.json", "{}"),
            (".git/HEAD", "ref"),
            ("Projects/.hidden.md", "h"),
        ]);
        let listed: Vec<(String, EntryKind)> = vault
            .entries()
            .unwrap()
            .into_iter()
            .map(|entry| (entry.path.to_string(), entry.kind))
            .collect();
        assert_eq!(
            listed,
            vec![
                ("Assets".to_owned(), EntryKind::Folder),
                ("Assets/pic.PNG".to_owned(), EntryKind::Attachment),
                ("Projects".to_owned(), EntryKind::Folder),
                ("Projects/Plan.md".to_owned(), EntryKind::Note),
                ("Projects/board.canvas".to_owned(), EntryKind::Canvas),
                ("Zeta.md".to_owned(), EntryKind::Note),
            ]
        );
    }

    #[test]
    fn write_then_read_round_trips_and_creates_folders() {
        let (_dir, vault) = vault_with(&[]);
        let note = path("Deep/Nested/Note.md");
        vault
            .write(&note, "# Title\n\nBody with ünïcödé.\n")
            .unwrap();
        assert_eq!(
            vault.read(&note).unwrap(),
            "# Title\n\nBody with ünïcödé.\n"
        );
        assert!(vault.exists(&note));
    }

    #[test]
    fn write_replaces_existing_file_and_leaves_no_temporary_files() {
        let (dir, vault) = vault_with(&[("Note.md", "old")]);
        vault.write(&path("Note.md"), "new").unwrap();
        assert_eq!(vault.read(&path("Note.md")).unwrap(), "new");
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["Note.md".to_owned()]);
    }

    #[test]
    fn read_of_missing_note_names_the_path() {
        let (_dir, vault) = vault_with(&[]);
        let error = vault.read(&path("Missing.md")).unwrap_err();
        assert!(matches!(error, VaultError::Io { ref path, .. } if path == "Missing.md"));
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_reach_outside_the_vault() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), "secret").unwrap();
        let (dir, vault) = vault_with(&[("Note.md", "n")]);
        std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.txt"),
            dir.path().join("secret-link.txt"),
        )
        .unwrap();

        for target in ["escape/secret.txt", "secret-link.txt", "escape/new.md"] {
            assert!(
                matches!(
                    vault.resolve(&path(target)),
                    Err(VaultError::OutsideVault(_))
                ),
                "{target} should be rejected"
            );
        }
        assert!(vault.write(&path("escape/new.md"), "x").is_err());
        assert!(!outside.path().join("new.md").exists());

        let listed: Vec<String> = vault
            .entries()
            .unwrap()
            .into_iter()
            .map(|entry| entry.path.to_string())
            .collect();
        assert_eq!(listed, vec!["Note.md".to_owned()]);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_inside_the_vault_resolve() {
        let (dir, vault) = vault_with(&[("Real/Note.md", "n")]);
        std::os::unix::fs::symlink(dir.path().join("Real"), dir.path().join("Alias")).unwrap();
        assert_eq!(vault.read(&path("Alias/Note.md")).unwrap(), "n");
    }
}
