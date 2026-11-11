//! Vault-relative paths.
//!
//! A [`VaultPath`] is the only way the rest of the app names a file. It is
//! always relative, slash-separated and free of `.` and `..` components, so it
//! cannot point outside the vault by construction. Symlinks are checked
//! separately when a path is resolved against a vault on disk.

use std::fmt;

use crate::VaultError;

/// A normalized path relative to a vault root, such as `Projects/Plan.md`.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct VaultPath(String);

impl VaultPath {
    /// Validates and normalizes a vault-relative path.
    ///
    /// `a/./b` and `a//b` become `a/b`; `a/x/../b` becomes `a/b`. A path that
    /// is empty, absolute, contains a backslash or NUL, or climbs above the
    /// vault root is rejected.
    pub fn new(raw: &str) -> Result<Self, VaultError> {
        if raw.is_empty() {
            return Err(VaultError::InvalidPath("path is empty".into()));
        }
        if raw.contains('\0') {
            return Err(VaultError::InvalidPath("path contains a NUL byte".into()));
        }
        if raw.contains('\\') {
            return Err(VaultError::InvalidPath(
                "backslashes are not allowed in vault paths".into(),
            ));
        }
        if raw.starts_with('/') || has_drive_prefix(raw) {
            return Err(VaultError::InvalidPath(
                "absolute paths are not allowed".into(),
            ));
        }

        let mut parts: Vec<&str> = Vec::new();
        for part in raw.split('/') {
            match part {
                "" | "." => {}
                ".." => {
                    if parts.pop().is_none() {
                        return Err(VaultError::InvalidPath("path escapes the vault".into()));
                    }
                }
                other => parts.push(other),
            }
        }
        if parts.is_empty() {
            return Err(VaultError::InvalidPath("path is empty".into()));
        }
        Ok(Self(parts.join("/")))
    }

    /// The path as a slash-separated string.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The final component, such as `Plan.md`.
    pub fn file_name(&self) -> &str {
        self.0.rsplit('/').next().unwrap_or(&self.0)
    }

    /// The final component without its extension, such as `Plan`.
    pub fn stem(&self) -> &str {
        let name = self.file_name();
        match name.rfind('.') {
            Some(0) | None => name,
            Some(dot) => &name[..dot],
        }
    }

    /// The extension without the dot, lowercased comparisons are up to the
    /// caller. Dotfiles such as `.gitignore` have no extension.
    pub fn extension(&self) -> Option<&str> {
        let name = self.file_name();
        match name.rfind('.') {
            Some(0) | None => None,
            Some(dot) => Some(&name[dot + 1..]),
        }
    }

    /// The containing folder, or `None` for a path at the vault root.
    pub fn parent(&self) -> Option<&str> {
        self.0.rfind('/').map(|slash| &self.0[..slash])
    }

    /// The path components in order.
    pub fn components(&self) -> impl Iterator<Item = &str> {
        self.0.split('/')
    }

    /// Appends one or more components to this path.
    pub fn join(&self, child: &str) -> Result<Self, VaultError> {
        Self::new(&format!("{}/{}", self.0, child))
    }
}

impl fmt::Display for VaultPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl AsRef<str> for VaultPath {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// `C:` style prefixes. We do not target Windows, but a vault synced from
/// one should not be able to smuggle a drive path in.
fn has_drive_prefix(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(raw: &str) -> String {
        VaultPath::new(raw).unwrap().as_str().to_owned()
    }

    #[test]
    fn normalizes_redundant_components() {
        assert_eq!(ok("a/b.md"), "a/b.md");
        assert_eq!(ok("a//b.md"), "a/b.md");
        assert_eq!(ok("./a/./b.md"), "a/b.md");
        assert_eq!(ok("a/x/../b.md"), "a/b.md");
        assert_eq!(ok("a/b/"), "a/b");
    }

    #[test]
    fn rejects_paths_that_leave_the_vault() {
        for raw in [
            "..",
            "../a",
            "a/../..",
            "a/../../b",
            "/etc/passwd",
            "C:/x",
            "a\\b",
        ] {
            assert!(VaultPath::new(raw).is_err(), "{raw:?} should be rejected");
        }
    }

    #[test]
    fn rejects_empty_and_nul() {
        for raw in ["", ".", "./", "a\0b"] {
            assert!(VaultPath::new(raw).is_err(), "{raw:?} should be rejected");
        }
    }

    #[test]
    fn splits_name_stem_extension_and_parent() {
        let path = VaultPath::new("Projects/2026/Plan.v2.md").unwrap();
        assert_eq!(path.file_name(), "Plan.v2.md");
        assert_eq!(path.stem(), "Plan.v2");
        assert_eq!(path.extension(), Some("md"));
        assert_eq!(path.parent(), Some("Projects/2026"));

        let root = VaultPath::new("README").unwrap();
        assert_eq!(root.stem(), "README");
        assert_eq!(root.extension(), None);
        assert_eq!(root.parent(), None);

        let dotfile = VaultPath::new(".gitignore").unwrap();
        assert_eq!(dotfile.stem(), ".gitignore");
        assert_eq!(dotfile.extension(), None);
    }

    #[test]
    fn join_cannot_escape() {
        let base = VaultPath::new("a/b").unwrap();
        assert_eq!(base.join("c.md").unwrap().as_str(), "a/b/c.md");
        assert_eq!(base.join("../c.md").unwrap().as_str(), "a/c.md");
        assert!(base.join("../../../c.md").is_err());
    }
}
