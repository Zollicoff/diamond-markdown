//! The list of vaults the app has opened, most recent first.
//!
//! It is a plain text file, one folder per line, so it can be read and fixed
//! by hand. It lives in the platform's settings folder, or in the folder
//! named by `DIAMOND_CONFIG_DIR` when that is set.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// How many vaults are remembered.
const LIMIT: usize = 10;
const FILE_NAME: &str = "recent-vaults";

/// The folder the app keeps its own settings in, if one can be worked out.
pub fn config_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("DIAMOND_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    let home = PathBuf::from(std::env::var_os("HOME")?);
    if cfg!(target_os = "macos") {
        return Some(home.join("Library/Application Support/Diamond Markdown"));
    }
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".config"));
    Some(base.join("diamond-markdown"))
}

/// Reads the remembered vaults from `dir`, most recent first. A missing or
/// unreadable file is an empty list.
pub fn load(dir: &Path) -> Vec<PathBuf> {
    fs::read_to_string(dir.join(FILE_NAME))
        .map(|text| {
            text.lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Puts `vault` at the front of the list in `dir` and writes it back.
///
/// Failing to remember a vault must never stop the app from opening it, so
/// errors are returned for the caller to report, not acted on here.
pub fn remember(dir: &Path, vault: &Path) -> std::io::Result<()> {
    let mut vaults = load(dir);
    vaults.retain(|known| known != vault);
    vaults.insert(0, vault.to_path_buf());
    vaults.truncate(LIMIT);

    fs::create_dir_all(dir)?;
    // Written beside the list and renamed over it, so a crash mid-write
    // leaves the old list.
    let temporary = dir.join(format!(".{FILE_NAME}.tmp"));
    let mut file = fs::File::create(&temporary)?;
    for known in &vaults {
        // A path that is not valid UTF-8 cannot be stored in a text file.
        if let Some(text) = known.to_str() {
            writeln!(file, "{text}")?;
        }
    }
    file.sync_all()?;
    fs::rename(temporary, dir.join(FILE_NAME))
}

/// The most recently opened vault that still exists as a folder.
pub fn latest_existing(dir: &Path) -> Option<PathBuf> {
    load(dir).into_iter().find(|vault| vault.is_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembers_most_recent_first_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("nested/config");
        assert!(load(&config).is_empty());

        for name in ["a", "b", "a", "c"] {
            remember(&config, Path::new(name)).unwrap();
        }
        assert_eq!(
            load(&config),
            vec![PathBuf::from("c"), PathBuf::from("a"), PathBuf::from("b")]
        );
        let names: Vec<_> = fs::read_dir(&config)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from(FILE_NAME)]);
    }

    #[test]
    fn keeps_only_the_newest_entries() {
        let dir = tempfile::tempdir().unwrap();
        for number in 0..LIMIT + 5 {
            remember(dir.path(), Path::new(&format!("vault-{number}"))).unwrap();
        }
        let vaults = load(dir.path());
        assert_eq!(vaults.len(), LIMIT);
        assert_eq!(vaults[0], PathBuf::from(format!("vault-{}", LIMIT + 4)));
    }

    #[test]
    fn latest_existing_skips_vaults_that_are_gone() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("config");
        let kept = dir.path().join("kept");
        fs::create_dir(&kept).unwrap();
        assert_eq!(latest_existing(&config), None);

        remember(&config, &kept).unwrap();
        remember(&config, &dir.path().join("deleted")).unwrap();
        assert_eq!(latest_existing(&config), Some(kept));
    }

    #[test]
    fn tolerates_blank_lines_and_spaces_in_paths() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join(FILE_NAME),
            "\n  /Users/me/My Notes  \n\n/tmp/x\n",
        )
        .unwrap();
        assert_eq!(
            load(dir.path()),
            vec![PathBuf::from("/Users/me/My Notes"), PathBuf::from("/tmp/x")]
        );
    }
}
