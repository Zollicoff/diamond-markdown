//! Watching the vault folder for changes made outside the app.

use notify::{RecursiveMode, Watcher as _};

use crate::{Result, Vault, VaultError, VaultPath};

/// Keeps a vault watched. Dropping it stops the watch.
pub struct VaultWatcher {
    _watcher: notify::RecommendedWatcher,
}

impl Vault {
    /// Calls `on_change` whenever files or folders in the vault are created,
    /// changed, renamed or removed, by this app or any other.
    ///
    /// The callback runs on a background thread and receives the affected
    /// paths. A path may no longer exist: that is how removals and the old
    /// name of a rename are reported. Events arrive in bursts and can repeat,
    /// so callers should collect them briefly before acting. Hidden files and
    /// folders are not reported, matching [`Vault::entries`].
    pub fn watch<F>(&self, on_change: F) -> Result<VaultWatcher>
    where
        F: Fn(Vec<VaultPath>) + Send + 'static,
    {
        let root = self.root.clone();
        let handler = move |event: notify::Result<notify::Event>| {
            let Ok(event) = event else {
                return;
            };
            if event.kind.is_access() {
                return;
            }
            let paths: Vec<VaultPath> = event
                .paths
                .iter()
                .filter_map(|absolute| absolute.strip_prefix(&root).ok()?.to_str())
                .filter(|relative| !relative.split('/').any(|part| part.starts_with('.')))
                .filter_map(|relative| VaultPath::new(relative).ok())
                .collect();
            if !paths.is_empty() {
                on_change(paths);
            }
        };

        let mut watcher = notify::recommended_watcher(handler).map_err(watch_error)?;
        watcher
            .watch(&self.root, RecursiveMode::Recursive)
            .map_err(watch_error)?;
        Ok(VaultWatcher { _watcher: watcher })
    }
}

fn watch_error(error: notify::Error) -> VaultError {
    VaultError::Watch(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    use super::*;

    /// Collects reported paths until `wanted` shows up or time runs out.
    fn wait_for(events: &mpsc::Receiver<Vec<VaultPath>>, wanted: &str) -> Vec<String> {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut seen = Vec::new();
        while Instant::now() < deadline {
            if let Ok(paths) = events.recv_timeout(Duration::from_millis(100)) {
                seen.extend(paths.into_iter().map(|path| path.to_string()));
                if seen.iter().any(|path| path == wanted) {
                    break;
                }
            }
        }
        seen
    }

    #[test]
    fn reports_changes_and_ignores_hidden_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("Sub")).unwrap();
        fs::write(dir.path().join("Old.md"), "old").unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let (sender, events) = mpsc::channel();
        let watcher = vault
            .watch(move |paths| {
                let _ = sender.send(paths);
            })
            .unwrap();
        // The watch needs a moment to take effect on some platforms.
        std::thread::sleep(Duration::from_millis(200));

        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git/HEAD"), "ref").unwrap();
        fs::write(dir.path().join("Sub/.hidden.md"), "h").unwrap();
        fs::write(dir.path().join("Sub/New.md"), "new").unwrap();
        let seen = wait_for(&events, "Sub/New.md");
        assert!(seen.contains(&"Sub/New.md".to_owned()), "{seen:?}");
        assert!(
            seen.iter()
                .all(|path| !path.contains("/.") && !path.starts_with('.')),
            "{seen:?}"
        );

        fs::remove_file(dir.path().join("Old.md")).unwrap();
        let seen = wait_for(&events, "Old.md");
        assert!(seen.contains(&"Old.md".to_owned()), "{seen:?}");

        drop(watcher);
    }
}
