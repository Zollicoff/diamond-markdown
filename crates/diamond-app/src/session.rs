//! One open vault and the notes open from it.
//!
//! [`Session`] is everything the window knows that is not pixels: the vault,
//! its index and its settings. A [`Document`] is one open note: where it is
//! and its text as last read or saved. Neither has UI types in it, so both
//! are tested without a window.

use std::path::Path;

use diamond_index::{BuildReport, LinkTarget, VaultIndex};
use diamond_vault::{EntryKind, Vault, VaultError, VaultPath, VaultWatcher};

use crate::notes::{self, Moment};
use crate::settings::VaultSettings;

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

/// What a change on disk means for a note that is open.
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

/// One task list item, as [`Session::tasks`] reports it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskItem {
    /// The note the task is in.
    pub path: VaultPath,
    /// That note's display title.
    pub note: String,
    /// Zero-based line of the task in the note.
    pub line: usize,
    /// Whether its box is ticked.
    pub done: bool,
    /// The task's text, without the bullet and the box.
    pub text: String,
}

/// What [`Session::rename`] did.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Renamed {
    /// The entry's path before.
    pub from: VaultPath,
    /// Where the entry is now.
    pub to: VaultPath,
    /// Every note whose links were rewritten, by its path after the rename,
    /// with its new text. An open note among them must show the new text,
    /// or its next save would undo the rewrite: see
    /// [`Document::follow_rename`].
    pub edits: Vec<(VaultPath, String)>,
    /// Why some note's links could not be rewritten, if that happened. The
    /// rename itself still took place.
    pub failed: Option<String>,
}

/// Where `path` is after `from` was renamed to `to`: the entry itself, or
/// something inside it when the entry is a folder. `None` when the rename
/// did not move it.
pub fn moved_path(from: &VaultPath, to: &VaultPath, path: &VaultPath) -> Option<VaultPath> {
    if path == from {
        return Some(to.clone());
    }
    let rest = path
        .as_str()
        .strip_prefix(from.as_str())?
        .strip_prefix('/')?;
    to.join(rest).ok()
}

/// Whether `path` is `entry` or, when `entry` is a folder, inside it.
pub fn is_at_or_under(entry: &VaultPath, path: &VaultPath) -> bool {
    path == entry
        || path
            .as_str()
            .strip_prefix(entry.as_str())
            .is_some_and(|rest| rest.starts_with('/'))
}

/// A note that is open: where it is and its text as last read or saved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    path: VaultPath,
    /// The text as it is on disk, to tell whether an editor has changes.
    saved: String,
}

impl Document {
    /// Where the note is in the vault.
    pub fn path(&self) -> &VaultPath {
        &self.path
    }

    /// The note's text as last read or saved.
    pub fn saved(&self) -> &str {
        &self.saved
    }

    /// Whether `text` differs from what was last read or saved.
    pub fn is_dirty(&self, text: &str) -> bool {
        self.saved != text
    }

    /// Records that the editor now shows `text` as read from disk.
    pub fn accept_disk_text(&mut self, text: &str) {
        text.clone_into(&mut self.saved);
    }

    /// Keeps up with a rename: takes the note's new path if it moved, and
    /// returns its new text if its links were rewritten.
    pub fn follow_rename(&mut self, renamed: &Renamed) -> Option<&str> {
        if let Some(path) = moved_path(&renamed.from, &renamed.to, &self.path) {
            self.path = path;
        }
        let (_, text) = renamed.edits.iter().find(|(path, _)| *path == self.path)?;
        text.clone_into(&mut self.saved);
        Some(&self.saved)
    }
}

/// An open vault.
pub struct Session {
    vault: Vault,
    index: VaultIndex,
    settings: VaultSettings,
    /// What is wrong with the vault's settings file, when it cannot be used.
    settings_problem: Option<String>,
}

impl Session {
    /// Opens the vault at `root` and indexes it.
    pub fn open(root: impl AsRef<Path>) -> Result<(Self, BuildReport), VaultError> {
        let vault = Vault::open(root)?;
        let (index, report) = VaultIndex::build(&vault)?;
        let loaded = VaultSettings::load(&vault);
        Ok((
            Self {
                vault,
                index,
                settings: loaded.settings,
                settings_problem: loaded.problem,
            },
            report,
        ))
    }

    /// The vault's settings.
    pub fn settings(&self) -> &VaultSettings {
        &self.settings
    }

    /// What is wrong with the vault's settings file, if it exists but cannot
    /// be used. The settings are all defaults while this is set.
    pub fn settings_problem(&self) -> Option<&str> {
        self.settings_problem.as_deref()
    }

    /// Where a plugin keeps what it stores: a TOML file named after it in
    /// the vault's `.diamond` folder.
    fn plugin_file(id: &str) -> Option<VaultPath> {
        VaultPath::new(&format!("{}/{id}.toml", diamond_vault::APP_FOLDER)).ok()
    }

    /// The text of a plugin's file, if it has written one.
    pub fn read_plugin_file(&self, id: &str) -> Option<String> {
        let path = Self::plugin_file(id)?;
        self.vault.read(&path).ok()
    }

    /// Replaces a plugin's file.
    pub fn write_plugin_file(&self, id: &str, text: &str) -> Result<(), String> {
        let path = Self::plugin_file(id).ok_or_else(|| format!("{id} cannot name a file"))?;
        self.vault
            .write(&path, text)
            .map_err(|error| error.to_string())
    }

    /// Reads the vault's settings file again, after it was edited.
    pub fn reload_settings(&mut self) {
        let loaded = VaultSettings::load(&self.vault);
        self.settings = loaded.settings;
        self.settings_problem = loaded.problem;
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

    /// Reads a note for editing.
    pub fn open_note(&self, path: &VaultPath) -> Result<Document, VaultError> {
        Ok(Document {
            saved: self.vault.read(path)?,
            path: path.clone(),
        })
    }

    /// A note's display title: its `title` property, or its name.
    pub fn title<'a>(&'a self, path: &'a VaultPath) -> &'a str {
        self.index
            .note(path)
            .map_or(path.stem(), |note| note.title())
    }

    /// Writes a note if `text` differs from its saved text and re-indexes
    /// it. Returns whether anything was written.
    pub fn save(&mut self, document: &mut Document, text: &str) -> Result<bool, VaultError> {
        if document.saved == text {
            return Ok(false);
        }
        self.vault.write(&document.path, text)?;
        text.clone_into(&mut document.saved);
        self.index.upsert(document.path.clone(), text);
        Ok(true)
    }

    /// Finds the link under `offset` in `text`, the current text of the
    /// note at `from`, and reports where it leads. See
    /// [`Session::follow_target`].
    pub fn follow(
        &mut self,
        from: &VaultPath,
        text: &str,
        offset: usize,
    ) -> Result<Follow, VaultError> {
        let meta = diamond_parse::parse(text);
        match meta
            .links
            .iter()
            .find(|link| link.range.start <= offset && offset <= link.range.end)
        {
            Some(link) => self.follow_target(from, &link.target),
            None => Ok(Follow::NoLink),
        }
    }

    /// Reports where a link target written in the note at `from` leads.
    /// Anything after a `#` (a heading or block) is ignored for now.
    ///
    /// A link to a note that does not exist creates that note, empty, at the
    /// path the link names from the vault root, which is what makes
    /// "write the link first, fill the note in later" work.
    pub fn follow_target(&mut self, from: &VaultPath, target: &str) -> Result<Follow, VaultError> {
        let target = target.split('#').next().unwrap_or(target).trim();
        if target.is_empty() {
            return Ok(Follow::NoLink);
        }

        match self.index.resolve(from, target) {
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

    /// Rewrites the text of the note at `from` into plain Markdown for the
    /// reading view.
    ///
    /// The properties block is dropped. Wikilinks become ordinary links with
    /// a `diamond://note/` address the window recognizes, image embeds become
    /// Markdown images pointing at the file, and other embeds become links.
    /// Everything else, including code that merely looks like a link, is
    /// passed through untouched.
    pub fn reading_markdown(&self, from: &VaultPath, text: &str) -> String {
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
            let image = match self.index.resolve(from, &link.target) {
                LinkTarget::File(file) if is_image(file) => self.vault.resolve(file).ok(),
                _ => None,
            };
            match image {
                // Angle brackets let the path contain spaces.
                Some(absolute) => output.push_str(&format!("![{label}](<{}>)", absolute.display())),
                None => output.push_str(&format!("[↪ {label}]({address})")),
            }
        }
        output.push_str(&text[position..]);
        self.render_queries(&output)
    }

    /// Replaces each fenced `query` block with the table it computes; see
    /// [`diamond_index::query`] for what a query says.
    fn render_queries(&self, markdown: &str) -> String {
        if !markdown.contains("```query") {
            return markdown.to_owned();
        }
        let mut output = String::with_capacity(markdown.len());
        let mut block: Option<String> = None;
        for line in markdown.split_inclusive('\n') {
            match &mut block {
                None if line.trim() == "```query" => block = Some(String::new()),
                None => output.push_str(line),
                Some(source) if line.trim() == "```" => {
                    output.push_str(&self.query_table(source));
                    block = None;
                }
                Some(source) => source.push_str(line),
            }
        }
        // A block that is never closed is shown as it was written.
        if let Some(source) = block {
            output.push_str("```query\n");
            output.push_str(&source);
        }
        output
    }

    /// A query's result as a Markdown table whose first column links to
    /// each note.
    fn query_table(&self, source: &str) -> String {
        let query = diamond_index::query::parse(source);
        let table = diamond_index::query::run(&self.index, &query);
        if table.rows.is_empty() {
            return "*No notes match this query.*\n".to_owned();
        }
        let escape = |cell: &str| cell.replace('|', "\\|").replace('\n', " ");
        let mut output = String::new();
        for column in &table.columns {
            output.push_str(&format!("| {} ", escape(column)));
        }
        output.push_str("|\n");
        output.push_str(&"| --- ".repeat(table.columns.len()));
        output.push_str("|\n");
        for row in &table.rows {
            for (column, cell) in row.cells.iter().enumerate() {
                if column > 0 {
                    output.push_str(&format!("| {} ", escape(cell)));
                    continue;
                }
                // The first cell is the way to the note, so it is never
                // left empty.
                let label = if cell.is_empty() {
                    self.title(&row.path)
                } else {
                    cell
                };
                let label = escape(label).replace('[', "\\[").replace(']', "\\]");
                let target = row.path.as_str();
                let target = target.strip_suffix(".md").unwrap_or(target);
                output.push_str(&format!(
                    "| [{label}]({NOTE_SCHEME}{}) ",
                    diamond_parse::percent_encode(target)
                ));
            }
            output.push_str("|\n");
        }
        output
    }

    /// Watches the vault folder; see [`Vault::watch`].
    pub fn watch<F>(&self, on_change: F) -> Result<VaultWatcher, VaultError>
    where
        F: Fn(Vec<VaultPath>) + Send + 'static,
    {
        self.vault.watch(on_change)
    }

    /// Brings the index up to date with files a watcher reported as
    /// changed. Returns whether files or folders appeared or disappeared,
    /// which makes the sidebar stale.
    ///
    /// Open notes are not touched: ask [`Session::disk_change`] about each.
    pub fn apply_changes(&mut self, paths: &[VaultPath]) -> Result<bool, VaultError> {
        Ok(self.index.refresh(&self.vault, paths)?.structure_changed)
    }

    /// Compares an open note with its file. The note's saved text is left
    /// alone: the caller decides whether to take the version on disk
    /// ([`Document::accept_disk_text`]) or keep what is in the editor.
    pub fn disk_change(&self, document: &Document) -> OpenChange {
        if !self.vault.exists(&document.path) {
            return OpenChange::Removed;
        }
        match self.vault.read(&document.path) {
            Ok(text) if text != document.saved => OpenChange::Changed(text),
            _ => OpenChange::Unchanged,
        }
    }

    /// Writes `text` to a new note beside `document`, named after it with
    /// "(conflict)" added, and returns the new note's path. Used when the
    /// editor and the disk disagree and the editor's text must not be lost.
    pub fn save_conflict_copy(
        &mut self,
        document: &Document,
        text: &str,
    ) -> Result<VaultPath, VaultError> {
        let stem = format!("{} (conflict)", document.path.stem());
        let copy = self
            .vault
            .unused_path(document.path.parent(), &stem, "md")?;
        self.vault.create(&copy, text)?;
        self.index.upsert(copy.clone(), text);
        Ok(copy)
    }

    /// Creates an empty `Untitled` note in `folder`, or at the vault root,
    /// and returns its path. The caller opens it.
    pub fn new_note(&mut self, folder: Option<&str>) -> Result<VaultPath, VaultError> {
        let path = self.vault.unused_path(folder, "Untitled", "md")?;
        self.vault.create(&path, "")?;
        self.index.upsert(path.clone(), "");
        Ok(path)
    }

    /// Moves a file or folder to the vault's trash. Notes open from it must
    /// be closed by the caller; see [`is_at_or_under`].
    pub fn delete(&mut self, path: &VaultPath) -> Result<(), VaultError> {
        self.vault.trash(path)?;
        self.index
            .refresh(&self.vault, std::slice::from_ref(path))?;
        Ok(())
    }

    /// The name to show and edit for an entry: a note's name without `.md`,
    /// any other file's or folder's name in full.
    pub fn display_name<'a>(&self, path: &'a VaultPath) -> &'a str {
        if self.is_note(path) {
            path.stem()
        } else {
            path.file_name()
        }
    }

    /// The path `from` would have once renamed to `name`, as typed.
    ///
    /// A plain name renames the entry where it is. A name with a `/` in it
    /// is a path from the vault root, which moves the entry there. A note
    /// keeps its `.md` whether or not it is typed; other files and folders
    /// are named exactly as typed.
    pub fn renamed_path(&self, from: &VaultPath, name: &str) -> Result<VaultPath, VaultError> {
        let name = name.trim().trim_matches('/');
        if name.is_empty() {
            return Err(VaultError::InvalidPath("a name is needed".into()));
        }
        let mut target = match (name.contains('/'), from.parent()) {
            (false, Some(folder)) => format!("{folder}/{name}"),
            _ => name.to_owned(),
        };
        if self.is_note(from) && !target.to_lowercase().ends_with(".md") {
            target.push_str(".md");
        }
        let path = VaultPath::new(&target)?;
        if path.components().any(|part| part.starts_with('.')) {
            return Err(VaultError::InvalidPath(
                "a name cannot start with a dot".into(),
            ));
        }
        Ok(path)
    }

    /// Renames or moves a file or folder, and rewrites the links in other
    /// notes that would otherwise stop leading to it.
    ///
    /// Links are rewritten in each note's text as last saved, so every open
    /// note must be saved before this is called, and afterwards each must
    /// [`Document::follow_rename`].
    ///
    /// An error means nothing was renamed. Once the rename has happened the
    /// result is `Ok`, with [`Renamed::failed`] set if a link could not be
    /// rewritten.
    pub fn rename(&mut self, from: &VaultPath, to: &VaultPath) -> Result<Renamed, VaultError> {
        let mut renamed = Renamed {
            from: from.clone(),
            to: to.clone(),
            edits: Vec::new(),
            failed: None,
        };
        if from == to {
            return Ok(renamed);
        }
        let moves: Vec<(VaultPath, VaultPath)> = self
            .index
            .notes()
            .iter()
            .filter_map(|note| Some((note.path.clone(), moved_path(from, to, &note.path)?)))
            .collect();
        let edits = self.index.rename_edits(&moves);

        self.vault.rename(from, to)?;

        // From here the rename has happened. A note that cannot be rewritten
        // is reported, but the rest are still done and the index is brought
        // up to date either way.
        let mut touched = vec![from.clone(), to.clone()];
        for edit in edits {
            let target = moved_path(from, to, &edit.path).unwrap_or(edit.path);
            match self.vault.write(&target, &edit.text) {
                Ok(()) => {
                    touched.push(target.clone());
                    renamed.edits.push((target, edit.text));
                }
                Err(error) => {
                    renamed.failed.get_or_insert_with(|| error.to_string());
                }
            }
        }

        // On a filesystem that ignores case, the old spelling of a name
        // still "exists" after a rename that only changes capitals, so the
        // index cannot be patched path by path.
        if from.as_str().to_lowercase() == to.as_str().to_lowercase() {
            self.index = VaultIndex::build(&self.vault)?.0;
        } else {
            self.index.refresh(&self.vault, &touched)?;
        }
        Ok(renamed)
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

    /// Finds the daily note for `moment`, creating it from the daily-note
    /// template if it does not exist yet. Returns its path and whether it
    /// was created.
    pub fn daily_note(&mut self, moment: Moment) -> Result<(VaultPath, bool), VaultError> {
        let path = notes::daily_note_path(&self.settings, moment)?;
        if self.vault.exists(&path) {
            return Ok((path, false));
        }
        // A template that is named but missing is not an error: the note
        // starts empty.
        let text = notes::daily_template_path(&self.settings)
            .and_then(|template| self.vault.read(&template).ok())
            .map(|template| notes::fill_template(&template, path.stem(), moment))
            .unwrap_or_default();
        self.vault.create(&path, &text)?;
        self.index.upsert(path.clone(), &text);
        Ok((path, true))
    }

    /// The notes in the templates folder, as `(path, name)`, sorted by path.
    pub fn templates(&self) -> Vec<(VaultPath, String)> {
        let folder = notes::templates_prefix(&self.settings).to_lowercase();
        self.index
            .notes()
            .iter()
            .filter(|note| note.path.as_str().to_lowercase().starts_with(&folder))
            .map(|note| (note.path.clone(), note.path.stem().to_owned()))
            .collect()
    }

    /// A template's text with its placeholders filled in for the note at
    /// `into`.
    pub fn template_text(
        &self,
        template: &VaultPath,
        into: &VaultPath,
        moment: Moment,
    ) -> Result<String, VaultError> {
        let text = self.vault.read(template)?;
        Ok(notes::fill_template(&text, self.title(into), moment))
    }

    /// A note's properties as of its last save, in the order they are
    /// written, each value on one line.
    pub fn properties(&self, path: &VaultPath) -> Vec<(String, String)> {
        self.index
            .note(path)
            .and_then(|note| note.meta.frontmatter.as_ref())
            .map(|frontmatter| {
                frontmatter
                    .properties
                    .iter()
                    .map(|(key, value)| (key.clone(), value.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Every task in the vault, as of each note's last save, in order of
    /// note path and then line.
    pub fn tasks(&self) -> Vec<TaskItem> {
        let mut tasks = Vec::new();
        for note in self.index.notes() {
            if note.meta.tasks.is_empty() {
                continue;
            }
            let lines: Vec<&str> = note.text.lines().collect();
            for task in &note.meta.tasks {
                let Some(line) = lines.get(task.line) else {
                    continue;
                };
                // What follows the box is the task's text.
                let text = line
                    .split_once(']')
                    .map_or(*line, |(_, text)| text)
                    .trim()
                    .to_owned();
                tasks.push(TaskItem {
                    path: note.path.clone(),
                    note: note.title().to_owned(),
                    line: task.line,
                    done: task.checked,
                    text,
                });
            }
        }
        tasks
    }

    /// Rewrites the file of a note that is not open. `change` gets its text
    /// and returns the new text, or `None` to leave it alone. Returns
    /// whether the note was changed.
    pub fn rewrite_note(
        &mut self,
        path: &VaultPath,
        change: impl FnOnce(&str) -> Option<String>,
    ) -> Result<bool, VaultError> {
        let text = self.vault.read(path)?;
        let Some(rewritten) = change(&text) else {
            return Ok(false);
        };
        self.vault.write(path, &rewritten)?;
        self.index.upsert(path.clone(), &rewritten);
        Ok(true)
    }

    /// A note's text as of its last save.
    pub fn note_text(&self, path: &VaultPath) -> Option<&str> {
        self.index.note(path).map(|note| note.text.as_str())
    }

    /// Whether `path` is a note in the index.
    pub fn is_note(&self, path: &VaultPath) -> bool {
        self.index.note(path).is_some()
    }

    /// Notes that link to the note at `path`, as `(path, title)`.
    pub fn backlinks(&self, path: &VaultPath) -> Vec<(VaultPath, String)> {
        self.index
            .backlinks(path)
            .into_iter()
            .map(|source| (source.clone(), self.title(source).to_owned()))
            .collect()
    }

    /// How many links in the note at `path` lead nowhere, as of its last
    /// save.
    pub fn unresolved_link_count(&self, path: &VaultPath) -> usize {
        self.index
            .outgoing(path)
            .iter()
            .filter(|target| matches!(target, LinkTarget::Unresolved(_)))
            .count()
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

    const MOMENT: Moment = Moment {
        year: 2026,
        month: 11,
        day: 11,
        hour: 6,
        minute: 30,
    };

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
        let mut home = session.open_note(&path("Home.md")).unwrap();
        assert_eq!(home.saved(), "# Home\n");
        assert_eq!(home.path(), &path("Home.md"));
        assert_eq!(session.title(home.path()), "Home");
        assert!(!home.is_dirty("# Home\n"));
        assert!(!session.save(&mut home, "# Home\n").unwrap());

        let edited = "---\ntitle: Start Here\n---\n# Home\n\nSee [[Plan]] and [[Nowhere]] #inbox\n";
        assert!(home.is_dirty(edited));
        assert!(session.save(&mut home, edited).unwrap());
        assert!(!home.is_dirty(edited));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Home.md")).unwrap(),
            edited
        );
        assert_eq!(session.title(home.path()), "Start Here");
        assert_eq!(session.unresolved_link_count(home.path()), 1);
        assert_eq!(
            session.search("tag:inbox", 10),
            vec![(path("Home.md"), "Start Here".to_owned(), None)]
        );
        assert_eq!(
            session.backlinks(&path("Plan.md")),
            vec![(path("Home.md"), "Start Here".to_owned())]
        );
        // A note that is not in the index yet is titled by its name.
        assert_eq!(session.title(&path("Deep/Not Yet.md")), "Not Yet");
    }

    #[test]
    fn two_documents_are_saved_independently() {
        let (dir, mut session) = session(&[("A.md", "a\n"), ("B.md", "b\n")]);
        let mut a = session.open_note(&path("A.md")).unwrap();
        let mut b = session.open_note(&path("B.md")).unwrap();
        assert!(session.save(&mut b, "b [[A]]\n").unwrap());
        assert!(!a.is_dirty("a\n"));
        assert!(session.save(&mut a, "a2\n").unwrap());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("A.md")).unwrap(),
            "a2\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("B.md")).unwrap(),
            "b [[A]]\n"
        );
        assert_eq!(
            session.backlinks(a.path()),
            vec![(path("B.md"), "B".to_owned())]
        );
    }

    #[test]
    fn follow_opens_existing_notes_and_creates_missing_ones() {
        let text = "To [[Plan]], [[Ideas/New One|new]], ![[pic.png]], [[#Top]] and plain text.";
        let (dir, mut session) =
            session(&[("Home.md", text), ("Work/Plan.md", ""), ("pic.png", "")]);
        let home = path("Home.md");
        let at = |needle: &str| text.find(needle).unwrap() + 3;

        assert_eq!(
            session.follow(&home, text, at("[[Plan")).unwrap(),
            Follow::Note {
                path: path("Work/Plan.md"),
                created: false
            }
        );
        assert_eq!(
            session.follow(&home, text, at("plain")).unwrap(),
            Follow::NoLink
        );
        assert_eq!(
            session.follow(&home, text, at("[[#Top")).unwrap(),
            Follow::NoLink
        );
        assert_eq!(
            session.follow(&home, text, at("![[pic")).unwrap(),
            Follow::Attachment(path("pic.png"))
        );

        let new_note = path("Ideas/New One.md");
        assert!(!dir.path().join("Ideas/New One.md").exists());
        assert_eq!(
            session.follow(&home, text, at("[[Ideas")).unwrap(),
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
            session.follow(&home, text, at("[[Ideas")).unwrap(),
            Follow::Note {
                path: new_note,
                created: false
            }
        );
    }

    #[test]
    fn reading_markdown_turns_wikilinks_into_ordinary_links() {
        let text = "---\ntitle: T\n---\n# Head\n\nSee [[Plan]], [[Work/Plan#Budget|the budget]] and [[A (b) c]].\n\n![[pic one.png]]\n\n![[Plan]]\n\n`[[code]]` and [web](https://example.com).\n";
        let (dir, session) = session(&[
            ("Home.md", text),
            ("Work/Plan.md", ""),
            ("img/pic one.png", ""),
        ]);
        let home = path("Home.md");
        let image = dir.path().canonicalize().unwrap().join("img/pic one.png");
        assert_eq!(
            session.reading_markdown(&home, text),
            format!(
                "\n# Head\n\nSee [Plan](diamond://note/Plan), [the budget](diamond://note/Work/Plan%23Budget) and [A (b) c](diamond://note/A%20%28b%29%20c).\n\n![pic one.png](<{}>)\n\n[↪ Plan](diamond://note/Plan)\n\n`[[code]]` and [web](https://example.com).\n",
                image.display()
            )
        );
        // Text without links or properties passes through unchanged.
        assert_eq!(
            session.reading_markdown(&home, "plain *text*\n"),
            "plain *text*\n"
        );
    }

    #[test]
    fn a_query_block_becomes_a_table_in_the_reading_view() {
        let text = "Projects:\n\n```query\ntag:project\nshow: title, status\nsort: status\n```\n\nAnd in code:\n\n```\nnot a query\n```\n";
        let (_dir, mut session) = session(&[
            ("Home.md", text),
            (
                "Work/Big Plan.md",
                "---\nstatus: open\ntags: [project]\n---\n",
            ),
            (
                "Launch.md",
                "---\ntitle: Launch | Day\nstatus: done\n---\n#project\n",
            ),
        ]);
        let home = path("Home.md");
        assert_eq!(
            session.reading_markdown(&home, text),
            "Projects:\n\n\
             | title | status |\n\
             | --- | --- |\n\
             | [Launch \\| Day](diamond://note/Launch) | done |\n\
             | [Big Plan](diamond://note/Work/Big%20Plan) | open |\n\
             \nAnd in code:\n\n```\nnot a query\n```\n"
        );
        assert_eq!(
            session.reading_markdown(&home, "```query\ntag:nothing\n```\n"),
            "*No notes match this query.*\n"
        );
        // Never closed: left as written.
        assert_eq!(
            session.reading_markdown(&home, "```query\ntag:project\n"),
            "```query\ntag:project\n"
        );
        // The links in the table lead to the notes.
        assert_eq!(
            session.follow_target(&home, "Work/Big Plan").unwrap(),
            Follow::Note {
                path: path("Work/Big Plan.md"),
                created: false
            }
        );
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
    fn daily_note_is_created_once_from_its_template() {
        let (dir, mut session) = session(&[
            ("Templates/Daily.md", "# {{title}}\n\nStarted {{time}}\n"),
            ("Templates/Meeting.md", "## {{title}} on {{date}}\n"),
            ("Home.md", "---\ntitle: Base\n---\n"),
        ]);
        assert_eq!(session.settings_problem(), None);
        let (daily, created) = session.daily_note(MOMENT).unwrap();
        assert_eq!((daily.as_str(), created), ("Daily/2026-11-11.md", true));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Daily/2026-11-11.md")).unwrap(),
            "# 2026-11-11\n\nStarted 06:30\n"
        );
        assert!(session.is_note(&daily));
        // The second time it is found, not recreated or overwritten.
        std::fs::write(dir.path().join("Daily/2026-11-11.md"), "edited").unwrap();
        assert_eq!(session.daily_note(MOMENT).unwrap(), (daily, false));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Daily/2026-11-11.md")).unwrap(),
            "edited"
        );

        assert_eq!(
            session.templates(),
            vec![
                (path("Templates/Daily.md"), "Daily".to_owned()),
                (path("Templates/Meeting.md"), "Meeting".to_owned()),
            ]
        );
        // The title filled in is the receiving note's display title.
        assert_eq!(
            session
                .template_text(&path("Templates/Meeting.md"), &path("Home.md"), MOMENT)
                .unwrap(),
            "## Base on 2026-11-11\n"
        );
    }

    #[test]
    fn daily_notes_and_templates_follow_the_vault_settings() {
        let (dir, mut session) = session(&[
            (
                ".diamond/settings.toml",
                "[daily]\nfolder = \"Journal\"\ntemplate = \"Day\"\n\n[templates]\nfolder = \"Meta/Templates\"\n",
            ),
            ("Meta/Templates/Day.md", "{{date}}\n"),
            ("Templates/Daily.md", "not used\n"),
        ]);
        assert_eq!(session.settings().daily.folder, "Journal");
        let (daily, created) = session.daily_note(MOMENT).unwrap();
        assert_eq!((daily.as_str(), created), ("Journal/2026-11-11.md", true));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Journal/2026-11-11.md")).unwrap(),
            "2026-11-11\n"
        );
        assert_eq!(
            session.templates(),
            vec![(path("Meta/Templates/Day.md"), "Day".to_owned())]
        );

        // Editing the file and reloading takes effect; a broken file is
        // reported and the defaults apply until it is fixed.
        std::fs::write(dir.path().join(".diamond/settings.toml"), "[daily").unwrap();
        session.reload_settings();
        assert!(session.settings_problem().is_some());
        assert_eq!(session.settings().daily.folder, "Daily");
    }

    #[test]
    fn a_daily_note_without_a_template_starts_empty() {
        let (dir, mut session) = session(&[("Home.md", "")]);
        let (daily, created) = session.daily_note(MOMENT).unwrap();
        assert!(created);
        assert_eq!(
            std::fs::read_to_string(dir.path().join(daily.as_str())).unwrap(),
            ""
        );
    }

    #[test]
    fn follow_target_ignores_the_heading_part() {
        let (_dir, mut session) = session(&[("Home.md", ""), ("Plan.md", "")]);
        let home = path("Home.md");
        assert_eq!(
            session.follow_target(&home, "Plan#Budget").unwrap(),
            Follow::Note {
                path: path("Plan.md"),
                created: false
            }
        );
        assert_eq!(
            session.follow_target(&home, "#Top").unwrap(),
            Follow::NoLink
        );
    }

    #[test]
    fn follow_rejects_a_link_that_would_leave_the_vault() {
        let text = "[[../../outside]]";
        let (dir, mut session) = session(&[("Home.md", text)]);
        assert!(session.follow(&path("Home.md"), text, 4).is_err());
        assert!(!dir.path().parent().unwrap().join("outside.md").exists());
    }

    #[test]
    fn disk_change_reports_outside_edits_and_removals() {
        let (dir, mut session) = session(&[("Home.md", "one"), ("Other.md", "")]);
        let home = path("Home.md");
        let mut document = session.open_note(&home).unwrap();
        assert_eq!(session.disk_change(&document), OpenChange::Unchanged);

        // Our own save comes back from the watcher as "unchanged".
        session.save(&mut document, "two").unwrap();
        assert!(!session.apply_changes(std::slice::from_ref(&home)).unwrap());
        assert_eq!(session.disk_change(&document), OpenChange::Unchanged);

        // Another program edits the file.
        std::fs::write(dir.path().join("Home.md"), "three [[Other]]").unwrap();
        assert!(!session.apply_changes(std::slice::from_ref(&home)).unwrap());
        assert_eq!(
            session.disk_change(&document),
            OpenChange::Changed("three [[Other]]".into())
        );
        // The index already has the new text, whatever the editor decides.
        assert_eq!(session.backlinks(&path("Other.md")).len(), 1);
        assert!(document.is_dirty("three [[Other]]"));
        document.accept_disk_text("three [[Other]]");
        assert!(!document.is_dirty("three [[Other]]"));
        assert_eq!(session.disk_change(&document), OpenChange::Unchanged);

        // Another program adds a file, then deletes the open note.
        std::fs::write(dir.path().join("Added.md"), "").unwrap();
        assert!(session.apply_changes(&[path("Added.md")]).unwrap());
        std::fs::remove_file(dir.path().join("Home.md")).unwrap();
        assert!(session.apply_changes(std::slice::from_ref(&home)).unwrap());
        assert_eq!(session.disk_change(&document), OpenChange::Removed);
        // Saving the document puts the note back.
        assert!(session.save(&mut document, "back").unwrap());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Home.md")).unwrap(),
            "back"
        );
    }

    #[test]
    fn a_conflict_copy_goes_beside_the_note() {
        let (dir, mut session) = session(&[("Work/Plan.md", "p"), ("Work/Plan (conflict).md", "")]);
        let document = session.open_note(&path("Work/Plan.md")).unwrap();
        let copy = session.save_conflict_copy(&document, "mine").unwrap();
        assert_eq!(copy, path("Work/Plan (conflict) 1.md"));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Work/Plan (conflict) 1.md")).unwrap(),
            "mine"
        );
        assert!(session.is_note(&copy));
    }

    #[test]
    fn new_note_picks_an_unused_name() {
        let (dir, mut session) = session(&[("Untitled.md", "taken")]);
        let created = session.new_note(None).unwrap();
        assert_eq!(created, path("Untitled 1.md"));
        assert!(session.is_note(&created));
        assert_eq!(
            session.new_note(Some("Deep/Folder")).unwrap(),
            path("Deep/Folder/Untitled.md")
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Untitled.md")).unwrap(),
            "taken"
        );
    }

    #[test]
    fn delete_trashes_files_and_folders() {
        let (dir, mut session) = session(&[
            ("Keep.md", "[[Gone]]"),
            ("Folder/Gone.md", "x"),
            ("Folder/Also.md", ""),
        ]);
        session.delete(&path("Folder/Also.md")).unwrap();
        assert!(!session.is_note(&path("Folder/Also.md")));
        session.delete(&path("Folder")).unwrap();
        assert!(!session.is_note(&path("Folder/Gone.md")));
        assert_eq!(session.unresolved_link_count(&path("Keep.md")), 1);
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".diamond/trash/Folder/Gone.md")).unwrap(),
            "x"
        );
        assert!(session.delete(&path("Folder")).is_err());
    }

    #[test]
    fn paths_are_followed_through_renames_of_files_and_folders() {
        let moved = |from: &str, to: &str, at: &str| {
            moved_path(&path(from), &path(to), &path(at)).map(|moved| moved.to_string())
        };
        assert_eq!(moved("A.md", "B.md", "A.md").as_deref(), Some("B.md"));
        assert_eq!(moved("A.md", "B.md", "C.md"), None);
        assert_eq!(
            moved("Old", "New/Place", "Old/Deep/C.md").as_deref(),
            Some("New/Place/Deep/C.md")
        );
        // A name that merely starts the same is something else.
        assert_eq!(moved("Old", "New", "Older/C.md"), None);
        assert_eq!(moved("Old", "New", "Old.md"), None);

        assert!(is_at_or_under(&path("Old"), &path("Old")));
        assert!(is_at_or_under(&path("Old"), &path("Old/Deep/C.md")));
        assert!(!is_at_or_under(&path("Old"), &path("Older/C.md")));
        assert!(!is_at_or_under(&path("Old/C.md"), &path("Old")));
    }

    #[test]
    fn renamed_path_keeps_the_folder_and_the_note_extension() {
        let (_dir, session) =
            session(&[("Top.md", ""), ("Work/Plan.md", ""), ("Work/pic.png", "")]);
        let renamed = |from: &str, name: &str| {
            session
                .renamed_path(&path(from), name)
                .map(|to| to.to_string())
        };
        assert_eq!(renamed("Top.md", " Summit ").unwrap(), "Summit.md");
        assert_eq!(renamed("Work/Plan.md", "Budget").unwrap(), "Work/Budget.md");
        assert_eq!(renamed("Work/Plan.md", "v1.2").unwrap(), "Work/v1.2.md");
        assert_eq!(
            renamed("Work/Plan.md", "Budget.md").unwrap(),
            "Work/Budget.md"
        );
        // A name with a slash is a path from the vault root: a move.
        assert_eq!(
            renamed("Work/Plan.md", "Archive/2026/Plan").unwrap(),
            "Archive/2026/Plan.md"
        );
        // Other files and folders are named exactly as typed.
        assert_eq!(
            renamed("Work/pic.png", "photo.jpg").unwrap(),
            "Work/photo.jpg"
        );
        assert_eq!(renamed("Work", "Projects").unwrap(), "Projects");
        assert_eq!(session.display_name(&path("Work/Plan.md")), "Plan");
        assert_eq!(session.display_name(&path("Work/pic.png")), "pic.png");

        assert!(renamed("Top.md", "  ").is_err());
        assert!(renamed("Top.md", ".hidden").is_err());
        assert!(renamed("Top.md", "../../outside").is_err());
        assert!(renamed("Top.md", "a\\b").is_err());
    }

    #[test]
    fn rename_rewrites_links_and_open_documents_follow() {
        let (dir, mut session) = session(&[
            ("Home.md", "See [[Plan]] and [[Work/Plan|the plan]].\n"),
            (
                "Work/Plan.md",
                "Back to [[Home]] and on to [[Work/Notes]].\n",
            ),
            ("Work/Notes.md", "n\n"),
        ]);
        let read = |name: &str| std::fs::read_to_string(dir.path().join(name)).unwrap();
        let mut home = session.open_note(&path("Home.md")).unwrap();
        let mut plan = session.open_note(&path("Work/Plan.md")).unwrap();

        // A note: links that name it are rewritten. The open note that
        // links to it gets its new text; the renamed one gets its new path.
        let renamed = session
            .rename(&path("Work/Plan.md"), &path("Work/Budget.md"))
            .unwrap();
        assert_eq!(renamed.to, path("Work/Budget.md"));
        assert_eq!(renamed.edits.len(), 1);
        let home_text = "See [[Budget]] and [[Work/Budget|the plan]].\n";
        assert_eq!(home.follow_rename(&renamed), Some(home_text));
        assert_eq!(read("Home.md"), home_text);
        assert!(!home.is_dirty(home_text));
        assert_eq!(plan.follow_rename(&renamed), None);
        assert_eq!(plan.path(), &path("Work/Budget.md"));
        assert!(!dir.path().join("Work/Plan.md").exists());
        assert!(session.is_note(&path("Work/Budget.md")));
        assert!(!session.is_note(&path("Work/Plan.md")));
        assert_eq!(session.unresolved_link_count(home.path()), 0);

        // The moved document saves to its new place.
        let plan_text = format!("{}more\n", plan.saved());
        assert!(session.save(&mut plan, &plan_text).unwrap());
        assert_eq!(read("Work/Budget.md"), plan_text);

        // A folder: every note in it moves, and links that spelled out the
        // folder follow. A document that both moved and was rewritten gets
        // its new path and its new text.
        let renamed = session.rename(&path("Work"), &path("Projects")).unwrap();
        let plan_text = plan.follow_rename(&renamed).map(str::to_owned);
        assert_eq!(plan.path(), &path("Projects/Budget.md"));
        assert_eq!(
            plan_text.as_deref(),
            Some("Back to [[Home]] and on to [[Projects/Notes]].\nmore\n")
        );
        assert_eq!(read("Projects/Budget.md"), plan_text.unwrap());
        assert_eq!(
            home.follow_rename(&renamed),
            Some("See [[Budget]] and [[Projects/Budget|the plan]].\n")
        );
        assert!(session.is_note(&path("Projects/Notes.md")));
        assert!(!dir.path().join("Work").exists());
    }

    #[test]
    fn rename_refuses_to_replace_another_file() {
        let (dir, mut session) = session(&[("A.md", "a [[B]]"), ("B.md", "b")]);
        assert!(matches!(
            session.rename(&path("A.md"), &path("B.md")),
            Err(VaultError::AlreadyExists(_))
        ));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("B.md")).unwrap(),
            "b"
        );
        assert!(session.is_note(&path("A.md")));
        // Renaming to the same name is nothing at all.
        assert!(
            session
                .rename(&path("A.md"), &path("A.md"))
                .unwrap()
                .edits
                .is_empty()
        );
    }

    #[test]
    fn rename_can_change_only_the_capitals() {
        let (dir, mut session) = session(&[("note.md", "n"), ("Other.md", "[[note]]")]);
        let mut document = session.open_note(&path("note.md")).unwrap();
        let renamed = session.rename(&path("note.md"), &path("Note.md")).unwrap();
        document.follow_rename(&renamed);
        assert_eq!(document.path(), &path("Note.md"));
        assert!(session.is_note(&path("Note.md")));
        assert!(!session.is_note(&path("note.md")));
        let names: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.to_lowercase() == "note.md")
            .collect();
        assert_eq!(names, vec!["Note.md".to_owned()]);
    }

    #[test]
    fn tasks_are_listed_across_the_vault_and_can_be_ticked() {
        let (dir, mut session) = session(&[
            (
                "Work/Plan.md",
                "---\ntitle: The Plan\n---\n- [ ] Call Sam due:2026-11-20\n- [x] Done already\n- not a task\n",
            ),
            ("Home.md", "Intro\n\n1. [ ] Numbered\n"),
            ("Empty.md", "nothing\n"),
        ]);
        let listed: Vec<(String, usize, bool, String)> = session
            .tasks()
            .into_iter()
            .map(|task| (task.note, task.line, task.done, task.text))
            .collect();
        assert_eq!(
            listed,
            vec![
                ("Home".to_owned(), 2, false, "Numbered".to_owned()),
                (
                    "The Plan".to_owned(),
                    3,
                    false,
                    "Call Sam due:2026-11-20".to_owned()
                ),
                ("The Plan".to_owned(), 4, true, "Done already".to_owned()),
            ]
        );

        let toggle = |session: &mut Session, name: &str, line: usize| {
            session.rewrite_note(&path(name), |text| notes::toggle_task(text, line))
        };
        assert!(toggle(&mut session, "Work/Plan.md", 3).unwrap());
        assert!(
            std::fs::read_to_string(dir.path().join("Work/Plan.md"))
                .unwrap()
                .contains("- [x] Call Sam due:2026-11-20\n")
        );
        assert!(session.tasks()[1].done);
        // A line that is not a task changes nothing.
        assert!(!toggle(&mut session, "Work/Plan.md", 5).unwrap());
        assert!(toggle(&mut session, "Missing.md", 0).is_err());
        assert_eq!(session.note_text(&path("Empty.md")), Some("nothing\n"));
        assert_eq!(session.note_text(&path("Missing.md")), None);
    }

    #[test]
    fn opening_a_missing_note_is_an_error() {
        let (_dir, session) = session(&[("Home.md", "x")]);
        assert!(session.open_note(&path("Gone.md")).is_err());
        assert!(session.open_note(&path("Home.md")).is_ok());
    }
}
