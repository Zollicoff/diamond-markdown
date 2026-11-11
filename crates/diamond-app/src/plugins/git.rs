//! Git: versions of the vault, and sync through a remote.
//!
//! The vault is an ordinary git repository, worked on with the `git`
//! program that is installed, using the identity, credentials and remotes
//! it is already set up with. Saving a version commits everything that
//! changed; syncing saves a version, takes in what the remote has and sends
//! what it lacks.

use std::path::Path;
use std::process::Command as Process;

use crate::plugin::{Command, Plugin};

/// Runs git in the vault folder and returns what it printed. A failure
/// carries git's own explanation.
fn git(root: &Path, arguments: &[&str]) -> Result<String, String> {
    let output = Process::new("git")
        .arg("-C")
        .arg(root)
        .args(arguments)
        // Never stop to ask for a password in a terminal nobody can see.
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("git could not be run: {error}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned());
    }
    let explanation = String::from_utf8_lossy(&output.stderr);
    let explanation = explanation.trim();
    Err(if explanation.is_empty() {
        format!("git {} failed", arguments.join(" "))
    } else {
        explanation.lines().last().unwrap_or(explanation).to_owned()
    })
}

/// Whether the vault folder is itself the top of a git repository. A vault
/// that merely sits somewhere inside another repository does not count:
/// committing "everything" there would reach outside the vault.
pub fn is_repository(root: &Path) -> bool {
    git(root, &["rev-parse", "--show-toplevel"])
        .ok()
        .and_then(|top| Path::new(&top).canonicalize().ok())
        .is_some_and(|top| root.canonicalize().is_ok_and(|root| root == top))
}

/// Makes the vault a git repository, leaving the trash out of it.
pub fn start(root: &Path) -> Result<String, String> {
    if is_repository(root) {
        return Ok("This vault already keeps versions".to_owned());
    }
    git(root, &["init"])?;
    let ignore = root.join(".gitignore");
    if !ignore.exists() {
        std::fs::write(&ignore, ".diamond/trash/\n").map_err(|error| error.to_string())?;
    }
    Ok("This vault now keeps versions. Save one whenever you like.".to_owned())
}

/// Commits everything that changed. Returns what happened in a sentence.
pub fn save_version(root: &Path, message: &str) -> Result<String, String> {
    if !is_repository(root) {
        return Err(
            "This vault does not keep versions yet. Run \"Git: start keeping versions\" first."
                .to_owned(),
        );
    }
    git(root, &["add", "--all"])?;
    let changed = git(root, &["status", "--porcelain"])?;
    let count = changed.lines().count();
    if count == 0 {
        return Ok("Nothing has changed since the last version".to_owned());
    }
    git(root, &["commit", "--message", message])?;
    Ok(match count {
        1 => "Saved a version: 1 file changed".to_owned(),
        count => format!("Saved a version: {count} files changed"),
    })
}

/// Saves a version, then takes in the remote's changes and sends ours.
pub fn sync(root: &Path, message: &str) -> Result<String, String> {
    let saved = save_version(root, message)?;
    // Without a branch to follow there is nowhere to sync with.
    if git(root, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_err() {
        return Ok(format!("{saved}. No remote branch is set up to sync with."));
    }
    git(root, &["pull", "--rebase"])
        .map_err(|problem| format!("Could not take in the remote's changes: {problem}"))?;
    git(root, &["push"]).map_err(|problem| format!("Could not send changes: {problem}"))?;
    Ok(format!("{saved}. In step with the remote."))
}

/// The message for a version saved now: `Vault 2026-11-11 09:05`.
fn version_message() -> String {
    let now = crate::notes::Moment::now();
    format!("Vault {} {}", now.date(), now.time())
}

/// The git plugin.
#[derive(Default)]
pub struct Git;

impl Plugin for Git {
    fn id(&self) -> &'static str {
        "git"
    }

    fn commands(&self) -> Vec<Command> {
        /// A command that saves every open note, then runs `work` away from
        /// the window, and says how it went when it is done.
        fn command(
            title: &'static str,
            keywords: &'static [&'static str],
            doing: &'static str,
            work: fn(&Path, &str) -> Result<String, String>,
        ) -> Command {
            Command::new(title, keywords, move |workspace, window, cx| {
                if !workspace.save_all(window, cx) {
                    return;
                }
                let root = workspace.session().vault_root().to_path_buf();
                workspace.note(doing, cx);
                cx.spawn(async move |this, cx| {
                    let outcome = cx
                        .background_executor()
                        .spawn(async move { work(&root, &version_message()) })
                        .await;
                    _ = this.update(cx, |workspace, cx| match outcome {
                        Ok(done) => workspace.note(done, cx),
                        Err(problem) => workspace.report(problem, cx),
                    });
                })
                .detach();
            })
        }
        vec![
            command(
                "Git: save a version",
                &["commit", "snapshot", "history", "backup"],
                "Saving a version…",
                save_version,
            ),
            command(
                "Git: sync with the remote",
                &["push", "pull", "upload", "download"],
                "Syncing…",
                sync,
            ),
            command(
                "Git: start keeping versions",
                &["init", "repository", "track"],
                "Setting up…",
                |root, _| start(root),
            ),
        ]
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    /// A vault that keeps versions, with an identity of its own so the test
    /// does not depend on the machine's git settings.
    fn vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Home.md"), "home\n").unwrap();
        assert!(!is_repository(dir.path()));
        start(dir.path()).unwrap();
        for (key, value) in [
            ("user.name", "Test"),
            ("user.email", "test@example.com"),
            ("commit.gpgsign", "false"),
        ] {
            git(dir.path(), &["config", key, value]).unwrap();
        }
        dir
    }

    #[test]
    fn versions_are_saved_only_when_something_changed() {
        let dir = vault();
        let root = dir.path();
        assert!(is_repository(root));
        assert_eq!(
            fs::read_to_string(root.join(".gitignore")).unwrap(),
            ".diamond/trash/\n"
        );
        // Home.md and .gitignore.
        assert_eq!(
            save_version(root, "first").unwrap(),
            "Saved a version: 2 files changed"
        );
        assert_eq!(
            save_version(root, "again").unwrap(),
            "Nothing has changed since the last version"
        );

        fs::write(root.join("Home.md"), "edited\n").unwrap();
        fs::create_dir_all(root.join(".diamond/trash")).unwrap();
        fs::write(root.join(".diamond/trash/Old.md"), "x").unwrap();
        // The trash is not part of a version.
        assert_eq!(
            save_version(root, "second").unwrap(),
            "Saved a version: 1 file changed"
        );
        assert_eq!(git(root, &["log", "--format=%s"]).unwrap(), "second\nfirst");
        // Starting again changes nothing.
        assert_eq!(start(root).unwrap(), "This vault already keeps versions");
    }

    #[test]
    fn a_vault_without_versions_says_how_to_start() {
        let dir = tempfile::tempdir().unwrap();
        let problem = save_version(dir.path(), "x").unwrap_err();
        assert!(problem.contains("start keeping versions"), "{problem}");
        assert!(sync(dir.path(), "x").is_err());
    }

    #[test]
    fn a_folder_inside_another_repository_is_not_treated_as_one() {
        let dir = vault();
        let inner = dir.path().join("Inner");
        fs::create_dir(&inner).unwrap();
        assert!(!is_repository(&inner));
        assert!(save_version(&inner, "x").is_err());
    }

    #[test]
    fn sync_takes_in_and_sends_changes_through_a_remote() {
        let remote = tempfile::tempdir().unwrap();
        git(remote.path(), &["init", "--bare"]).unwrap();
        let dir = vault();
        let root = dir.path();
        save_version(root, "first").unwrap();

        // No remote branch yet: the version is saved and that is said.
        fs::write(root.join("A.md"), "a\n").unwrap();
        let outcome = sync(root, "second").unwrap();
        assert!(outcome.contains("No remote branch"), "{outcome}");

        let remote_path = remote.path().to_str().unwrap();
        git(root, &["remote", "add", "origin", remote_path]).unwrap();
        git(root, &["push", "--set-upstream", "origin", "HEAD"]).unwrap();

        // Another copy of the vault adds a note and sends it.
        let other = tempfile::tempdir().unwrap();
        git(other.path(), &["clone", remote_path, "."]).unwrap();
        for (key, value) in [("user.name", "Other"), ("user.email", "other@example.com")] {
            git(other.path(), &["config", key, value]).unwrap();
        }
        fs::write(other.path().join("FromOther.md"), "theirs\n").unwrap();
        assert!(sync(other.path(), "theirs").unwrap().contains("In step"));

        // Syncing here saves our change, takes theirs in and sends ours.
        fs::write(root.join("B.md"), "ours\n").unwrap();
        let outcome = sync(root, "ours").unwrap();
        assert_eq!(
            outcome,
            "Saved a version: 1 file changed. In step with the remote."
        );
        assert_eq!(
            fs::read_to_string(root.join("FromOther.md")).unwrap(),
            "theirs\n"
        );
        git(other.path(), &["pull", "--rebase"]).unwrap();
        assert_eq!(
            fs::read_to_string(other.path().join("B.md")).unwrap(),
            "ours\n"
        );
    }

    #[test]
    fn the_version_message_names_the_moment() {
        let message = version_message();
        assert!(message.starts_with("Vault 20"), "{message}");
        assert_eq!(message.len(), "Vault 2026-11-11 09:05".len());
    }
}
