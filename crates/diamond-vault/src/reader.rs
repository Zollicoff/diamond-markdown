//! Reading many files quickly.

use std::collections::HashSet;
use std::fs;
use std::sync::RwLock;

use crate::{Result, Vault, VaultPath, io_error};

/// Reads files from a vault with the folder safety check done once per
/// folder instead of once per file.
///
/// [`Vault::read`] resolves the whole path on every call to make sure no
/// symlink leads out of the vault. That is right for a single read and too
/// slow for ten thousand: indexing and search spend most of their time in
/// it. A reader remembers which folders it has already verified and, for a
/// file in one of them, only checks that the file itself is not a symlink.
/// Anything unusual falls back to the full check.
///
/// A reader is meant to live for one pass over the vault, such as one index
/// build or one search. It does not notice a folder being replaced by a
/// symlink while it is in use.
pub struct VaultReader<'a> {
    vault: &'a Vault,
    verified_folders: RwLock<HashSet<String>>,
}

impl Vault {
    /// Starts a pass of many reads. See [`VaultReader`].
    pub fn reader(&self) -> VaultReader<'_> {
        VaultReader {
            vault: self,
            verified_folders: RwLock::new(HashSet::new()),
        }
    }
}

impl VaultReader<'_> {
    /// Reads a text file, with the same result as [`Vault::read`].
    pub fn read(&self, path: &VaultPath) -> Result<String> {
        let folder = path.parent().unwrap_or("");
        let absolute = self.vault.root.join(path.as_str());

        let known = self
            .verified_folders
            .read()
            .is_ok_and(|verified| verified.contains(folder));
        if !known {
            // The full check, which also covers this file.
            let absolute = self.vault.resolve(path)?;
            let folder_is_real = absolute
                .parent()
                .and_then(|parent| parent.canonicalize().ok())
                .is_some_and(|real| real.starts_with(&self.vault.root));
            if folder_is_real && let Ok(mut verified) = self.verified_folders.write() {
                verified.insert(folder.to_owned());
            }
            return fs::read_to_string(&absolute).map_err(|source| io_error(path, source));
        }

        let is_symlink = fs::symlink_metadata(&absolute)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false);
        if is_symlink {
            return self.vault.read(path);
        }
        fs::read_to_string(&absolute).map_err(|source| io_error(path, source))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::VaultError;

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    #[test]
    fn reads_like_the_vault_does() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("a/b")).unwrap();
        fs::write(dir.path().join("Root.md"), "root").unwrap();
        fs::write(dir.path().join("a/b/One.md"), "one").unwrap();
        fs::write(dir.path().join("a/b/Two.md"), "two").unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let reader = vault.reader();

        for (name, contents) in [
            ("Root.md", "root"),
            ("a/b/One.md", "one"),
            ("a/b/Two.md", "two"),
        ] {
            assert_eq!(reader.read(&path(name)).unwrap(), contents);
            // A second read takes the quick route.
            assert_eq!(reader.read(&path(name)).unwrap(), contents);
        }
        assert!(matches!(
            reader.read(&path("a/b/Missing.md")),
            Err(VaultError::Io { .. })
        ));
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_out_of_the_vault_are_refused_on_both_routes() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "secret").unwrap();
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("Folder")).unwrap();
        fs::write(dir.path().join("Folder/Real.md"), "real").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("Escape")).unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let reader = vault.reader();

        // A symlinked folder: refused, and never remembered as verified.
        for _ in 0..2 {
            assert!(matches!(
                reader.read(&path("Escape/secret.md")),
                Err(VaultError::OutsideVault(_))
            ));
        }

        // A symlinked file added to a folder that was already verified.
        assert_eq!(reader.read(&path("Folder/Real.md")).unwrap(), "real");
        std::os::unix::fs::symlink(
            outside.path().join("secret.md"),
            dir.path().join("Folder/Link.md"),
        )
        .unwrap();
        assert!(matches!(
            reader.read(&path("Folder/Link.md")),
            Err(VaultError::OutsideVault(_))
        ));
    }
}
