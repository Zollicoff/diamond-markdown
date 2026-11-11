//! One open vault and the note being edited.
//!
//! [`Session`] is everything the window knows that is not pixels: the vault,
//! its index and the open note's last saved text. It has no UI types in it, so
//! it is tested without a window.

use std::path::Path;

use diamond_index::{BuildReport, LinkTarget, VaultIndex};
use diamond_vault::{EntryKind, Vault, VaultError, VaultPath, VaultWatcher};

/// The address prefix the reading view gives links to notes. The rest of the
/// address is the percent-encoded link target as written in the note.
pub const NOTE_SCHEME: &str = "diamond://note/";

fn is_image(path: &VaultPath) -> bool {
    path.extension().is_some_and(|extension| {
        ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]
            .iter()
            .any(|known| extension.eq_ignore_ascii_case(known))
    })
}

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

/// What a change on disk means for the note that is open.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OpenChange {
    /// The open note's file is as it was last read or saved.
    Unchanged,
    /// The file now holds this text, which differs from what was last read
    /// or saved.
    Changed(String),
    /// The file is gone: deleted, moved or renamed outside the app.
    Removed,
}

/// The result of [`Session::apply_changes`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Applied {
    /// Files or folders appeared or disappeared, so the sidebar is stale.
    pub structure_changed: bool,
    /// What happened to the open note.
    pub open: OpenChange,
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

    /// The vault's folder on disk.
    pub fn vault_root(&self) -> &Path {
        self.vault.root()
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
    /// text, and reports where it leads. See [`Session::follow_target`].
    pub fn follow(&mut self, text: &str, offset: usize) -> Result<Follow, VaultError> {
        let meta = diamond_parse::parse(text);
        match meta
            .links
            .iter()
            .find(|link| link.range.start <= offset && offset <= link.range.end)
        {
            Some(link) => self.follow_target(&link.target),
            None => Ok(Follow::NoLink),
        }
    }

    /// Reports where a link target written in the open note leads. Anything
    /// after a `#` (a heading or block) is ignored for now.
    ///
    /// A link to a note that does not exist creates that note, empty, at the
    /// path the link names from the vault root, which is what makes
    /// "write the link first, fill the note in later" work.
    pub fn follow_target(&mut self, target: &str) -> Result<Follow, VaultError> {
        let target = target.split('#').next().unwrap_or(target).trim();
        let Some(from) = self.current().cloned() else {
            return Ok(Follow::NoLink);
        };
        if target.is_empty() {
            return Ok(Follow::NoLink);
        }

        match self.index.resolve(&from, target) {
            LinkTarget::Note(path) => Ok(Follow::Note {
                path: path.clone(),
                created: false,
            }),
            LinkTarget::File(path) => Ok(Follow::Attachment(path.clone())),
            LinkTarget::Unresolved(name) => {
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

    /// Rewrites a note's text into plain Markdown for the reading view.
    ///
    /// The properties block is dropped. Wikilinks become ordinary links with
    /// a `diamond://note/` address the window recognizes, image embeds become
    /// Markdown images pointing at the file, and other embeds become links.
    /// Everything else, including code that merely looks like a link, is
    /// passed through untouched.
    pub fn reading_markdown(&self, text: &str) -> String {
        let meta = diamond_parse::parse(text);
        let mut output = String::with_capacity(text.len() + 64);
        let mut position = meta
            .frontmatter
            .as_ref()
            .map_or(0, |frontmatter| frontmatter.range.end.min(text.len()));

        for link in &meta.links {
            if link.syntax != diamond_parse::LinkSyntax::Wiki || link.range.start < position {
                continue;
            }
            output.push_str(&text[position..link.range.start]);
            position = link.range.end;

            let mut written = link.target.clone();
            match &link.subpath {
                Some(diamond_parse::Subpath::Heading(heading)) => {
                    written.push('#');
                    written.push_str(heading);
                }
                Some(diamond_parse::Subpath::Block(block)) => {
                    written.push_str("#^");
                    written.push_str(block);
                }
                None => {}
            }
            let label = link.display.as_deref().unwrap_or(&written);
            let label = label.replace('[', "\\[").replace(']', "\\]");
            let address = format!("{NOTE_SCHEME}{}", diamond_parse::percent_encode(&written));

            if !link.embed {
                output.push_str(&format!("[{label}]({address})"));
                continue;
            }
            let image =
                self.current()
                    .and_then(|from| match self.index.resolve(from, &link.target) {
                        LinkTarget::File(file) if is_image(file) => self.vault.resolve(file).ok(),
                        _ => None,
                    });
            match image {
                // Angle brackets let the path contain spaces.
                Some(absolute) => output.push_str(&format!("![{label}](<{}>)", absolute.display())),
                None => output.push_str(&format!("[↪ {label}]({address})")),
            }
        }
        output.push_str(&text[position..]);
        output
    }

    /// Watches the vault folder; see [`Vault::watch`].
    pub fn watch<F>(&self, on_change: F) -> Result<VaultWatcher, VaultError>
    where
        F: Fn(Vec<VaultPath>) + Send + 'static,
    {
        self.vault.watch(on_change)
    }

    /// Brings the index up to date with files a watcher reported as changed
    /// and reports what that means for the sidebar and the open note.
    ///
    /// The open note's saved text is left alone: the caller decides whether
    /// to take the version on disk ([`Session::accept_disk_text`]) or keep
    /// what is in the editor.
    pub fn apply_changes(&mut self, paths: &[VaultPath]) -> Result<Applied, VaultError> {
        let refresh = self.index.refresh(&self.vault, paths)?;
        let open = match &self.open {
            None => OpenChange::Unchanged,
            Some(open) if !self.vault.exists(&open.path) => OpenChange::Removed,
            Some(open) => match self.vault.read(&open.path) {
                Ok(text) if text != open.saved => OpenChange::Changed(text),
                _ => OpenChange::Unchanged,
            },
        };
        Ok(Applied {
            structure_changed: refresh.structure_changed,
            open,
        })
    }

    /// Records that the editor now shows `text` as read from disk.
    pub fn accept_disk_text(&mut self, text: &str) {
        if let Some(open) = self.open.as_mut() {
            text.clone_into(&mut open.saved);
        }
    }

    /// Closes the open note without writing anything.
    pub fn close(&mut self) {
        self.open = None;
    }

    /// Writes `text` to a new note beside the open one, named after it with
    /// "(conflict)" added, and returns the new note's path. Used when the
    /// editor and the disk disagree and the editor's text must not be lost.
    pub fn save_conflict_copy(&mut self, text: &str) -> Result<VaultPath, VaultError> {
        let Some(open) = self.open.as_ref() else {
            return Err(VaultError::InvalidPath("no note is open".into()));
        };
        let stem = format!("{} (conflict)", open.path.stem());
        let copy = self.vault.unused_path(open.path.parent(), &stem, "md")?;
        self.vault.create(&copy, text)?;
        self.index.upsert(copy.clone(), text);
        Ok(copy)
    }

    /// Creates an empty `Untitled` note at the vault root and returns its
    /// path. The caller opens it.
    pub fn new_note(&mut self) -> Result<VaultPath, VaultError> {
        let path = self.vault.unused_path(None, "Untitled", "md")?;
        self.vault.create(&path, "")?;
        self.index.upsert(path.clone(), "");
        Ok(path)
    }

    /// Moves a file or folder to the vault's trash. Returns whether the open
    /// note went with it, in which case no note is open any more.
    pub fn delete(&mut self, path: &VaultPath) -> Result<bool, VaultError> {
        self.vault.trash(path)?;
        self.index
            .refresh(&self.vault, std::slice::from_ref(path))?;
        let under = format!("{}/", path.as_str());
        let closes_open = self
            .open
            .as_ref()
            .is_some_and(|open| open.path == *path || open.path.as_str().starts_with(&under));
        if closes_open {
            self.open = None;
        }
        Ok(closes_open)
    }

    /// The notes that best match `query`, best first, as `(path, label)`.
    ///
    /// The label is the note's title, with the folder added for notes below
    /// the vault root and the alias shown when an alias is what matched.
    pub fn quick_switch(&self, query: &str, limit: usize) -> Vec<(VaultPath, String)> {
        self.index
            .quick_switch(query, limit)
            .into_iter()
            .map(|suggestion| {
                let mut label = match suggestion.alias {
                    Some(alias) => format!("{alias} → {}", suggestion.title),
                    None => suggestion.title.to_owned(),
                };
                if let Some(folder) = suggestion.path.parent() {
                    label.push_str("  ·  ");
                    label.push_str(folder);
                }
                (suggestion.path.clone(), label)
            })
            .collect()
    }

    /// Searches the text of every note; see [`diamond_index::search`] for
    /// the query syntax. Returns one row per matching line, as
    /// `(path, label, line)`, with at most `limit` notes. A note that
    /// matched only by name has one row and no line.
    pub fn search(&self, query: &str, limit: usize) -> Vec<(VaultPath, String, Option<usize>)> {
        let mut rows = Vec::new();
        for hit in diamond_index::search::search(&self.index, query, limit) {
            if hit.lines.is_empty() {
                rows.push((hit.path, hit.title, None));
                continue;
            }
            for matched in hit.lines {
                let label = format!("{}  ·  {}", hit.title, matched.excerpt);
                rows.push((hit.path.clone(), label, Some(matched.line)));
            }
        }
        rows
    }

    /// Whether `path` is a note in the index.
    pub fn is_note(&self, path: &VaultPath) -> bool {
        self.index.note(path).is_some()
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
    fn reading_markdown_turns_wikilinks_into_ordinary_links() {
        let text = "---\ntitle: T\n---\n# Head\n\nSee [[Plan]], [[Work/Plan#Budget|the budget]] and [[A (b) c]].\n\n![[pic one.png]]\n\n![[Plan]]\n\n`[[code]]` and [web](https://example.com).\n";
        let (dir, mut session) = session(&[
            ("Home.md", text),
            ("Work/Plan.md", ""),
            ("img/pic one.png", ""),
        ]);
        session.open_note(&path("Home.md")).unwrap();
        let image = dir.path().canonicalize().unwrap().join("img/pic one.png");
        assert_eq!(
            session.reading_markdown(text),
            format!(
                "\n# Head\n\nSee [Plan](diamond://note/Plan), [the budget](diamond://note/Work/Plan%23Budget) and [A (b) c](diamond://note/A%20%28b%29%20c).\n\n![pic one.png](<{}>)\n\n[↪ Plan](diamond://note/Plan)\n\n`[[code]]` and [web](https://example.com).\n",
                image.display()
            )
        );
        // Text without links or properties passes through unchanged.
        assert_eq!(session.reading_markdown("plain *text*\n"), "plain *text*\n");
    }

    #[test]
    fn search_lists_one_row_per_matching_line() {
        let (_dir, session) = session(&[
            ("Budget.md", "nothing\n"),
            (
                "Notes/Plan.md",
                "---\ntitle: The Plan\n---\nfirst budget line\n\nsecond Budget line\n",
            ),
        ]);
        assert_eq!(
            session.search("budget", 10),
            vec![
                (path("Budget.md"), "Budget".to_owned(), None),
                (
                    path("Notes/Plan.md"),
                    "The Plan  ·  first budget line".to_owned(),
                    Some(3)
                ),
                (
                    path("Notes/Plan.md"),
                    "The Plan  ·  second Budget line".to_owned(),
                    Some(5)
                ),
            ]
        );
        assert!(session.search("", 10).is_empty());
    }

    #[test]
    fn follow_target_ignores_the_heading_part() {
        let (_dir, mut session) = session(&[("Home.md", ""), ("Plan.md", "")]);
        session.open_note(&path("Home.md")).unwrap();
        assert_eq!(
            session.follow_target("Plan#Budget").unwrap(),
            Follow::Note {
                path: path("Plan.md"),
                created: false
            }
        );
        assert_eq!(session.follow_target("#Top").unwrap(), Follow::NoLink);
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
    fn apply_changes_reports_outside_edits_and_removals() {
        let (dir, mut session) = session(&[("Home.md", "one"), ("Other.md", "")]);
        let home = path("Home.md");
        assert_eq!(
            session
                .apply_changes(std::slice::from_ref(&home))
                .unwrap()
                .open,
            OpenChange::Unchanged
        );
        session.open_note(&home).unwrap();

        // Our own save comes back from the watcher as "unchanged".
        session.save("two").unwrap();
        let applied = session.apply_changes(std::slice::from_ref(&home)).unwrap();
        assert_eq!(
            applied,
            Applied {
                structure_changed: false,
                open: OpenChange::Unchanged
            }
        );

        // Another program edits the file.
        std::fs::write(dir.path().join("Home.md"), "three [[Other]]").unwrap();
        let applied = session.apply_changes(std::slice::from_ref(&home)).unwrap();
        assert_eq!(applied.open, OpenChange::Changed("three [[Other]]".into()));
        assert!(session.is_dirty("three [[Other]]"));
        session.accept_disk_text("three [[Other]]");
        assert!(!session.is_dirty("three [[Other]]"));
        assert_eq!(
            session
                .apply_changes(std::slice::from_ref(&home))
                .unwrap()
                .open,
            OpenChange::Unchanged
        );

        // Another program adds a file, then deletes the open note.
        std::fs::write(dir.path().join("Added.md"), "").unwrap();
        assert!(
            session
                .apply_changes(&[path("Added.md")])
                .unwrap()
                .structure_changed
        );
        std::fs::remove_file(dir.path().join("Home.md")).unwrap();
        let applied = session.apply_changes(std::slice::from_ref(&home)).unwrap();
        assert_eq!(
            applied,
            Applied {
                structure_changed: true,
                open: OpenChange::Removed
            }
        );
        // The note stays open so its text can still be saved back.
        assert_eq!(session.current(), Some(&home));
    }

    #[test]
    fn new_note_picks_an_unused_name() {
        let (dir, mut session) = session(&[("Untitled.md", "taken")]);
        let created = session.new_note().unwrap();
        assert_eq!(created, path("Untitled 1.md"));
        assert!(session.is_note(&created));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Untitled.md")).unwrap(),
            "taken"
        );
    }

    #[test]
    fn delete_trashes_and_closes_the_open_note_when_it_goes() {
        let (dir, mut session) = session(&[
            ("Keep.md", "[[Gone]]"),
            ("Folder/Gone.md", "x"),
            ("Folder/Also.md", ""),
        ]);
        session.open_note(&path("Keep.md")).unwrap();
        assert!(!session.delete(&path("Folder/Also.md")).unwrap());
        assert_eq!(session.current(), Some(&path("Keep.md")));

        session.open_note(&path("Folder/Gone.md")).unwrap();
        assert!(session.delete(&path("Folder")).unwrap());
        assert!(session.current().is_none());
        assert!(!session.is_note(&path("Folder/Gone.md")));
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".trash/Folder/Gone.md")).unwrap(),
            "x"
        );
        assert!(session.delete(&path("Folder")).is_err());
    }

    #[test]
    fn opening_a_missing_note_keeps_the_current_one() {
        let (_dir, mut session) = session(&[("Home.md", "x")]);
        session.open_note(&path("Home.md")).unwrap();
        assert!(session.open_note(&path("Gone.md")).is_err());
        assert_eq!(session.current(), Some(&path("Home.md")));
    }
}
