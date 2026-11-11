//! Bookmarks: notes kept one click away, listed in the context panel.
//!
//! They are stored in `.diamond/bookmarks.toml` in the vault, in the order
//! they were added, and follow notes that are renamed or moved.

use diamond_vault::VaultPath;
use serde::{Deserialize, Serialize};

use crate::plugin::{Command, Plugin, Row, RowAction, Section};
use crate::session::{Session, is_at_or_under, moved_path};

/// The plugin's file, as written to disk.
#[derive(Default, Deserialize, Serialize)]
struct Stored {
    #[serde(default)]
    notes: Vec<String>,
}

/// The bookmarked notes, oldest first.
#[derive(Default)]
pub struct Bookmarks {
    notes: Vec<VaultPath>,
}

impl Bookmarks {
    /// Whether a note is bookmarked.
    pub fn contains(&self, path: &VaultPath) -> bool {
        self.notes.contains(path)
    }

    /// Bookmarks a note, or removes its bookmark. Returns whether it is
    /// bookmarked now.
    pub fn toggle(&mut self, path: &VaultPath) -> bool {
        match self.notes.iter().position(|note| note == path) {
            Some(position) => {
                self.notes.remove(position);
                false
            }
            None => {
                self.notes.push(path.clone());
                true
            }
        }
    }
}

impl Plugin for Bookmarks {
    fn id(&self) -> &'static str {
        "bookmarks"
    }

    fn load(&mut self, session: &Session) {
        let stored: Stored = session
            .read_plugin_file(self.id())
            .and_then(|text| toml::from_str(&text).ok())
            .unwrap_or_default();
        self.notes = stored
            .notes
            .iter()
            .filter_map(|note| VaultPath::new(note).ok())
            .collect();
    }

    fn store(&self, session: &Session) -> Result<(), String> {
        let stored = Stored {
            notes: self.notes.iter().map(ToString::to_string).collect(),
        };
        let text = toml::to_string(&stored).map_err(|error| error.to_string())?;
        session.write_plugin_file(self.id(), &text)
    }

    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "Bookmark this note, or remove its bookmark",
                &["star", "favourite", "favorite", "pin"],
                |workspace, _, cx| {
                    let Some(path) = workspace.current().cloned() else {
                        workspace.report("Open a note to bookmark it", cx);
                        return;
                    };
                    let added = workspace
                        .update_plugin::<Bookmarks, _>(cx, |bookmarks| bookmarks.toggle(&path));
                    workspace.note(
                        match added {
                            Some(true) => format!("Bookmarked {path}"),
                            _ => format!("Removed the bookmark on {path}"),
                        },
                        cx,
                    );
                },
            )
            .shortcut(crate::actions::primary!("d")),
        ]
    }

    fn sections(&self, session: &Session, _current: Option<&VaultPath>) -> Vec<Section> {
        vec![Section {
            title: "Bookmarks",
            rows: self
                .notes
                .iter()
                .map(|path| Row {
                    label: session.title(path).to_owned(),
                    action: RowAction::Open(path.clone()),
                })
                .collect(),
        }]
    }

    fn renamed(&mut self, from: &VaultPath, to: &VaultPath) -> bool {
        let mut changed = false;
        for note in &mut self.notes {
            if let Some(moved) = moved_path(from, to, note) {
                *note = moved;
                changed = true;
            }
        }
        changed
    }

    fn removed(&mut self, path: &VaultPath) -> bool {
        let before = self.notes.len();
        self.notes.retain(|note| !is_at_or_under(path, note));
        self.notes.len() != before
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    fn session(files: &[(&str, &str)]) -> (tempfile::TempDir, Session) {
        let dir = tempfile::tempdir().unwrap();
        for (name, contents) in files {
            let absolute = dir.path().join(name);
            std::fs::create_dir_all(absolute.parent().unwrap()).unwrap();
            std::fs::write(absolute, contents).unwrap();
        }
        let (session, _) = Session::open(dir.path()).unwrap();
        (dir, session)
    }

    #[test]
    fn bookmarks_toggle_and_survive_a_reload() {
        let (dir, session) = session(&[("A.md", "---\ntitle: Alpha\n---\n"), ("Work/B.md", "")]);
        let mut bookmarks = Bookmarks::default();
        bookmarks.load(&session);
        assert!(bookmarks.notes.is_empty());

        assert!(bookmarks.toggle(&path("Work/B.md")));
        assert!(bookmarks.toggle(&path("A.md")));
        assert!(bookmarks.contains(&path("A.md")));
        bookmarks.store(&session).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".diamond/bookmarks.toml")).unwrap(),
            "notes = [\"Work/B.md\", \"A.md\"]\n"
        );

        let mut reloaded = Bookmarks::default();
        reloaded.load(&session);
        let sections = reloaded.sections(&session, None);
        let labels: Vec<&str> = sections[0]
            .rows
            .iter()
            .map(|row| row.label.as_str())
            .collect();
        // Listed by title, in the order they were added.
        assert_eq!(labels, vec!["B", "Alpha"]);

        assert!(!reloaded.toggle(&path("A.md")));
        assert!(!reloaded.contains(&path("A.md")));
    }

    #[test]
    fn bookmarks_follow_renames_and_forget_deleted_notes() {
        let mut bookmarks = Bookmarks::default();
        bookmarks.toggle(&path("Work/B.md"));
        bookmarks.toggle(&path("A.md"));
        bookmarks.toggle(&path("Workshop.md"));

        assert!(bookmarks.renamed(&path("Work"), &path("Job")));
        assert!(bookmarks.contains(&path("Job/B.md")));
        assert!(bookmarks.contains(&path("Workshop.md")));
        assert!(!bookmarks.renamed(&path("Elsewhere.md"), &path("X.md")));

        assert!(bookmarks.removed(&path("Job")));
        assert!(!bookmarks.contains(&path("Job/B.md")));
        assert!(!bookmarks.removed(&path("Job")));
        assert_eq!(bookmarks.notes, vec![path("A.md"), path("Workshop.md")]);
    }

    #[test]
    fn a_broken_bookmarks_file_is_an_empty_list() {
        let (_dir, session) = session(&[(".diamond/bookmarks.toml", "notes = [1, ")]);
        let mut bookmarks = Bookmarks::default();
        bookmarks.load(&session);
        assert!(bookmarks.notes.is_empty());
    }
}
