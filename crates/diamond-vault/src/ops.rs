//! Creating, renaming and removing files.

use std::fs;
use std::io::Write;
use std::os::unix::fs::MetadataExt;

use crate::{APP_FOLDER, Result, Vault, VaultError, VaultPath, io_error};

/// The folder inside [`APP_FOLDER`] that deleted files are moved to.
const TRASH: &str = "trash";

impl Vault {
    /// Creates a new text file. Fails if anything already exists at `path`,
    /// so a note is never silently replaced.
    pub fn create(&self, path: &VaultPath, contents: &str) -> Result<()> {
        let absolute = self.resolve(path)?;
        if let Some(folder) = absolute.parent() {
            fs::create_dir_all(folder).map_err(|source| io_error(path, source))?;
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&absolute)
            .map_err(|source| match source.kind() {
                std::io::ErrorKind::AlreadyExists => VaultError::AlreadyExists(path.to_string()),
                _ => io_error(path, source),
            })?;
        file.write_all(contents.as_bytes())
            .and_then(|()| file.sync_all())
            .map_err(|source| io_error(path, source))
    }

    /// A path in `folder` (the vault root when `None`) that nothing occupies:
    /// `Untitled.md`, then `Untitled 1.md`, `Untitled 2.md` and so on.
    pub fn unused_path(
        &self,
        folder: Option<&str>,
        stem: &str,
        extension: &str,
    ) -> Result<VaultPath> {
        let prefix = folder
            .map(|folder| format!("{folder}/"))
            .unwrap_or_default();
        let mut serial = 0u32;
        loop {
            let name = match serial {
                0 => format!("{prefix}{stem}.{extension}"),
                n => format!("{prefix}{stem} {n}.{extension}"),
            };
            let candidate = VaultPath::new(&name)?;
            if !self.exists(&candidate) {
                return Ok(candidate);
            }
            serial += 1;
        }
    }

    /// Renames or moves a file or folder, creating destination folders as
    /// needed. Fails if a different file already exists at `to`.
    ///
    /// Changing only the capitalization of a name works on case-insensitive
    /// filesystems, where the old and new names are the same file.
    pub fn rename(&self, from: &VaultPath, to: &VaultPath) -> Result<()> {
        let source = self.resolve(from)?;
        let destination = self.resolve(to)?;
        let source_meta = fs::symlink_metadata(&source).map_err(|error| io_error(from, error))?;
        if let Ok(existing) = fs::symlink_metadata(&destination) {
            let same_file =
                existing.ino() == source_meta.ino() && existing.dev() == source_meta.dev();
            if !same_file {
                return Err(VaultError::AlreadyExists(to.to_string()));
            }
        }
        if let Some(folder) = destination.parent() {
            fs::create_dir_all(folder).map_err(|error| io_error(to, error))?;
        }
        fs::rename(&source, &destination).map_err(|error| io_error(from, error))
    }

    /// Moves a file or folder into the vault's trash, `.diamond/trash`, where
    /// it can be recovered by hand. A name already in the trash gets a number
    /// added.
    pub fn trash(&self, path: &VaultPath) -> Result<()> {
        let source = self.resolve(path)?;
        fs::symlink_metadata(&source).map_err(|error| io_error(path, error))?;
        let trash = self.root.join(APP_FOLDER).join(TRASH);
        fs::create_dir_all(&trash).map_err(|error| io_error(path, error))?;

        let (stem, extension) = match path.extension() {
            Some(extension) => (path.stem(), format!(".{extension}")),
            None => (path.file_name(), String::new()),
        };
        let mut serial = 0u32;
        let destination = loop {
            let name = match serial {
                0 => format!("{stem}{extension}"),
                n => format!("{stem} {n}{extension}"),
            };
            let candidate = trash.join(name);
            if fs::symlink_metadata(&candidate).is_err() {
                break candidate;
            }
            serial += 1;
        };
        fs::rename(&source, &destination).map_err(|error| io_error(path, error))
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
    fn create_never_replaces_an_existing_file() {
        let (_dir, vault) = vault_with(&[("Note.md", "keep")]);
        vault.create(&path("New/Fresh.md"), "hello").unwrap();
        assert_eq!(vault.read(&path("New/Fresh.md")).unwrap(), "hello");
        assert!(matches!(
            vault.create(&path("Note.md"), "clobber"),
            Err(VaultError::AlreadyExists(_))
        ));
        assert_eq!(vault.read(&path("Note.md")).unwrap(), "keep");
    }

    #[test]
    fn unused_path_counts_up() {
        let (_dir, vault) = vault_with(&[
            ("Untitled.md", ""),
            ("Untitled 1.md", ""),
            ("Sub/Untitled.md", ""),
        ]);
        assert_eq!(
            vault.unused_path(None, "Untitled", "md").unwrap().as_str(),
            "Untitled 2.md"
        );
        assert_eq!(
            vault
                .unused_path(Some("Sub"), "Untitled", "md")
                .unwrap()
                .as_str(),
            "Sub/Untitled 1.md"
        );
        assert_eq!(
            vault
                .unused_path(Some("Empty"), "Untitled", "md")
                .unwrap()
                .as_str(),
            "Empty/Untitled.md"
        );
    }

    #[test]
    fn rename_moves_files_and_folders_without_overwriting() {
        let (dir, vault) = vault_with(&[("A.md", "a"), ("B.md", "b"), ("Folder/Inner.md", "i")]);
        vault.rename(&path("A.md"), &path("Deep/Moved.md")).unwrap();
        assert_eq!(vault.read(&path("Deep/Moved.md")).unwrap(), "a");
        assert!(!dir.path().join("A.md").exists());

        assert!(matches!(
            vault.rename(&path("Deep/Moved.md"), &path("B.md")),
            Err(VaultError::AlreadyExists(_))
        ));
        assert_eq!(vault.read(&path("B.md")).unwrap(), "b");

        vault.rename(&path("Folder"), &path("Renamed")).unwrap();
        assert_eq!(vault.read(&path("Renamed/Inner.md")).unwrap(), "i");
        assert!(vault.rename(&path("Missing.md"), &path("X.md")).is_err());
    }

    #[test]
    fn rename_can_change_only_the_capitalization() {
        let (dir, vault) = vault_with(&[("note.md", "n")]);
        vault.rename(&path("note.md"), &path("Note.md")).unwrap();
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["Note.md".to_owned()]);
    }

    #[test]
    fn trash_moves_into_the_vault_trash_and_numbers_duplicates() {
        let (dir, vault) = vault_with(&[
            ("Note.md", "one"),
            ("Sub/Note.md", "two"),
            ("Folder/In.md", "x"),
        ]);
        vault.trash(&path("Note.md")).unwrap();
        vault.trash(&path("Sub/Note.md")).unwrap();
        vault.trash(&path("Folder")).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join(".diamond/trash/Note.md")).unwrap(),
            "one"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join(".diamond/trash/Note 1.md")).unwrap(),
            "two"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join(".diamond/trash/Folder/In.md")).unwrap(),
            "x"
        );
        // Trashed files leave the listing; the emptied folder stays.
        let listed: Vec<String> = vault
            .entries()
            .unwrap()
            .into_iter()
            .map(|e| e.path.to_string())
            .collect();
        assert_eq!(listed, vec!["Sub".to_owned()]);
        assert!(vault.trash(&path("Gone.md")).is_err());
    }
}
