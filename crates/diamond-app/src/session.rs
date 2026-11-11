//! One open vault and the note being edited.
//!
//! [`Session`] is everything the window knows that is not pixels: the vault,
//! its index and the open note's last saved text. It has no UI types in it, so
//! it is tested without a window.

use std::path::Path;

use diamond_index::{BuildReport, LinkTarget, VaultIndex};
use diamond_vault::{EntryKind, Vault, VaultError, VaultPath};

/// A file or folder in the sidebar tree.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeNode {
    /// Where the entry is in the vault.
    pub path: VaultPath,
    /// The name to show: the file name, without `.md` for notes.
    pub name: String,
    /// What the entry is.
    pub kind: EntryKind,
    /// Folder contents; empty for files.
    pub children: Vec<TreeNode>,
}

/// A heading in the open note's outline.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutlineItem {
    /// 1 through 6.
    pub level: u8,
    /// The heading text.
    pub text: String,
    /// Zero-based line in the note.
    pub line: usize,
}

/// What following a link at the cursor leads to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Follow {
    /// The cursor is not on a link to another file.
    NoLink,
    /// A note to open. `created` is set when the link named a note that did
    /// not exist and an empty one was made for it.
    Note {
        /// The note the link leads to.
        path: VaultPath,
        /// Whether the note was created just now.
        created: bool,
    },
    /// A file that is not a note, which the app cannot show yet.
    Attachment(VaultPath),
}

struct OpenNote {
    path: VaultPath,
    /// The text as it is on disk, to tell whether the editor has changes.
    saved: String,
}

/// An open vault.
pub struct Session {
    vault: Vault,
    index: VaultIndex,
    open: Option<OpenNote>,
}

impl Session {
    /// Opens the vault at `root` and indexes it.
    pub fn open(root: impl AsRef<Path>) -> Result<(Self, BuildReport), VaultError> {
        let vault = Vault::open(root)?;
        let (index, report) = VaultIndex::build(&vault)?;
        Ok((
            Self {
                vault,
                index,
                open: None,
            },
            report,
        ))
    }

    /// The vault's display name.
    pub fn vault_name(&self) -> &str {
        self.vault.name()
    }

    /// The sidebar tree: folders before files, each group sorted by name
    /// without regard to case.
    pub fn tree(&self) -> Result<Vec<TreeNode>, VaultError> {
        let mut roots: Vec<TreeNode> = Vec::new();
        // Entries arrive sorted by path, so a folder always precedes its
        // contents and can be found by walking down from the roots.
        for entry in self.vault.entries()? {
            let node = TreeNode {
                name: match entry.kind {
                    EntryKind::Note => entry.path.stem().to_owned(),
                    _ => entry.path.file_name().to_owned(),
                },
                kind: entry.kind,
                children: Vec::new(),
                path: entry.path,
            };
            let mut siblings = &mut roots;
            let depth = node.path.components().count() - 1;
            for component in node.path.components().take(depth) {
                let Some(position) = siblings.iter().position(|sibling| {
                    sibling.kind == EntryKind::Folder && sibling.path.file_name() == component
                }) else {
                    break;
                };
                siblings = &mut siblings[position].children;
            }
            siblings.push(node);
        }
        sort_tree(&mut roots);
        Ok(roots)
    }

    /// Reads a note and makes it the open note. Returns its text.
    pub fn open_note(&mut self, path: &VaultPath) -> Result<String, VaultError> {
        let text = self.vault.read(path)?;
        self.open = Some(OpenNote {
            path: path.clone(),
            saved: text.clone(),
        });
        Ok(text)
    }

    /// The open note's path.
    pub fn current(&self) -> Option<&VaultPath> {
        self.open.as_ref().map(|open| &open.path)
    }

    /// The open note's display title.
    pub fn current_title(&self) -> Option<&str> {
        let path = self.current()?;
        Some(
            self.index
                .note(path)
                .map_or(path.stem(), |note| note.title()),
        )
    }

    /// Whether `text` differs from what was last read or saved.
    pub fn is_dirty(&self, text: &str) -> bool {
        self.open.as_ref().is_some_and(|open| open.saved != text)
    }

    /// Writes the open note if `text` differs from the saved text and
    /// re-indexes it. Returns whether anything was written.
    pub fn save(&mut self, text: &str) -> Result<bool, VaultError> {
        let Some(open) = self.open.as_mut() else {
            return Ok(false);
        };
        if open.saved == text {
            return Ok(false);
        }
        self.vault.write(&open.path, text)?;
        open.saved = text.to_owned();
        self.index.upsert(open.path.clone(), text);
        Ok(true)
    }

    /// Finds the link under `offset` in `text`, the open note's current
    /// text, and reports where it leads.
    ///
    /// A link to a note that does not exist creates that note, empty, at the
    /// path the link names from the vault root, which is what makes
    /// "write the link first, fill the note in later" work.
    pub fn follow(&mut self, text: &str, offset: usize) -> Result<Follow, VaultError> {
        let Some(from) = self.current().cloned() else {
            return Ok(Follow::NoLink);
        };
        let meta = diamond_parse::parse(text);
        let Some(link) = meta
            .links
            .iter()
            .find(|link| link.range.start <= offset && offset <= link.range.end)
            .filter(|link| !link.target.is_empty())
        else {
            return Ok(Follow::NoLink);
        };

        match self.index.resolve(&from, &link.target) {
            LinkTarget::Note(path) => Ok(Follow::Note {
                path: path.clone(),
                created: false,
            }),
            LinkTarget::File(path) => Ok(Follow::Attachment(path.clone())),
            LinkTarget::Unresolved(target) => {
                let name = target.trim();
                let name = name
                    .strip_suffix(".md")
                    .or_else(|| name.strip_suffix(".MD"))
                    .unwrap_or(name);
                let path = VaultPath::new(&format!("{name}.md"))?;
                let created = !self.vault.exists(&path);
                if created {
                    self.vault.write(&path, "")?;
                    self.index.upsert(path.clone(), "");
                }
                Ok(Follow::Note { path, created })
            }
        }
    }

    /// Notes that link to the open note, as `(path, title)`.
    pub fn backlinks(&self) -> Vec<(VaultPath, String)> {
        let Some(path) = self.current() else {
            return Vec::new();
        };
        self.index
            .backlinks(path)
            .into_iter()
            .map(|source| {
                let title = self
                    .index
                    .note(source)
                    .map_or(source.stem(), |note| note.title());
                (source.clone(), title.to_owned())
            })
            .collect()
    }

    /// The open note's headings, as of its last save.
    pub fn outline(&self) -> Vec<OutlineItem> {
        self.current()
            .and_then(|path| self.index.note(path))
            .map(|note| {
                note.meta
                    .headings
                    .iter()
                    .map(|heading| OutlineItem {
                        level: heading.level,
                        text: heading.text.clone(),
                        line: heading.line,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The open note's tags, as of its last save.
    pub fn tags(&self) -> Vec<String> {
        self.current()
            .and_then(|path| self.index.note(path))
            .map(|note| {
                note.meta
                    .all_tags()
                    .into_iter()
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    }

    /// How many of the open note's links lead nowhere, as of its last save.
    pub fn unresolved_link_count(&self) -> usize {
        self.current().map_or(0, |path| {
            self.index
                .outgoing(path)
                .iter()
                .filter(|target| matches!(target, LinkTarget::Unresolved(_)))
                .count()
        })
    }
}

fn sort_tree(nodes: &mut [TreeNode]) {
    nodes.sort_by_cached_key(|node| (node.kind != EntryKind::Folder, node.name.to_lowercase()));
    for node in nodes {
        sort_tree(&mut node.children);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(files: &[(&str, &str)]) -> (tempfile::TempDir, Session) {
        let dir = tempfile::tempdir().unwrap();
        for (path, contents) in files {
            let absolute = dir.path().join(path);
            std::fs::create_dir_all(absolute.parent().unwrap()).unwrap();
            std::fs::write(absolute, contents).unwrap();
        }
        let (session, _) = Session::open(dir.path()).unwrap();
        (dir, session)
    }

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    fn shape(nodes: &[TreeNode]) -> Vec<String> {
        fn walk(nodes: &[TreeNode], depth: usize, out: &mut Vec<String>) {
            for node in nodes {
                out.push(format!("{}{}", "  ".repeat(depth), node.name));
                walk(&node.children, depth + 1, out);
            }
        }
        let mut out = Vec::new();
        walk(nodes, 0, &mut out);
        out
    }

    #[test]
    fn tree_nests_folders_first_and_sorts_without_case() {
        let (_dir, session) = session(&[
            ("zeta.md", ""),
            ("Alpha.md", ""),
            ("beta/Inner.md", ""),
            ("beta/deep/Leaf.md", ""),
            ("beta/apple.png", ""),
            ("Archive/Old.md", ""),
        ]);
        assert_eq!(
            shape(&session.tree().unwrap()),
            vec![
                "Archive",
                "  Old",
                "beta",
                "  deep",
                "    Leaf",
                "  apple.png",
                "  Inner",
                "Alpha",
                "zeta",
            ]
        );
    }

    #[test]
    fn open_edit_save_updates_disk_and_index() {
        let (dir, mut session) = session(&[("Home.md", "# Home\n"), ("Plan.md", "# Plan\n")]);
        assert!(session.current().is_none());
        assert!(!session.save("ignored").unwrap());

        let text = session.open_note(&path("Home.md")).unwrap();
        assert_eq!(text, "# Home\n");
        assert_eq!(session.current_title(), Some("Home"));
        assert!(!session.is_dirty(&text));
        assert!(!session.save(&text).unwrap());

        let edited = "---\ntitle: Start Here\n---\n# Home\n\nSee [[Plan]] and [[Nowhere]] #inbox\n";
        assert!(session.is_dirty(edited));
        assert!(session.save(edited).unwrap());
        assert!(!session.is_dirty(edited));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Home.md")).unwrap(),
            edited
        );
        assert_eq!(session.current_title(), Some("Start Here"));
        assert_eq!(session.tags(), vec!["inbox"]);
        assert_eq!(session.unresolved_link_count(), 1);
        assert_eq!(
            session.outline(),
            vec![OutlineItem {
                level: 1,
                text: "Home".into(),
                line: 3
            }]
        );

        session.open_note(&path("Plan.md")).unwrap();
        assert_eq!(
            session.backlinks(),
            vec![(path("Home.md"), "Start Here".to_owned())]
        );
    }

    #[test]
    fn follow_opens_existing_notes_and_creates_missing_ones() {
        let text = "To [[Plan]], [[Ideas/New One|new]], ![[pic.png]], [[#Top]] and plain text.";
        let (dir, mut session) =
            session(&[("Home.md", text), ("Work/Plan.md", ""), ("pic.png", "")]);
        let at = |needle: &str| text.find(needle).unwrap() + 3;

        // Nothing is open yet, so there is nothing to follow from.
        assert_eq!(session.follow(text, at("[[Plan")).unwrap(), Follow::NoLink);
        session.open_note(&path("Home.md")).unwrap();

        assert_eq!(
            session.follow(text, at("[[Plan")).unwrap(),
            Follow::Note {
                path: path("Work/Plan.md"),
                created: false
            }
        );
        assert_eq!(session.follow(text, at("plain")).unwrap(), Follow::NoLink);
        assert_eq!(session.follow(text, at("[[#Top")).unwrap(), Follow::NoLink);
        assert_eq!(
            session.follow(text, at("![[pic")).unwrap(),
            Follow::Attachment(path("pic.png"))
        );

        let new_note = path("Ideas/New One.md");
        assert!(!dir.path().join("Ideas/New One.md").exists());
        assert_eq!(
            session.follow(text, at("[[Ideas")).unwrap(),
            Follow::Note {
                path: new_note.clone(),
                created: true
            }
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Ideas/New One.md")).unwrap(),
            ""
        );
        // The second time it is an ordinary existing note.
        assert_eq!(
            session.follow(text, at("[[Ideas")).unwrap(),
            Follow::Note {
                path: new_note,
                created: false
            }
        );
    }

    #[test]
    fn follow_rejects_a_link_that_would_leave_the_vault() {
        let text = "[[../../outside]]";
        let (dir, mut session) = session(&[("Home.md", text)]);
        session.open_note(&path("Home.md")).unwrap();
        assert!(session.follow(text, 4).is_err());
        assert!(!dir.path().parent().unwrap().join("outside.md").exists());
    }

    #[test]
    fn opening_a_missing_note_keeps_the_current_one() {
        let (_dir, mut session) = session(&[("Home.md", "x")]);
        session.open_note(&path("Home.md")).unwrap();
        assert!(session.open_note(&path("Gone.md")).is_err());
        assert_eq!(session.current(), Some(&path("Home.md")));
    }
}
