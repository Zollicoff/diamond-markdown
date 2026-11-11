//! The vault index.
//!
//! [`VaultIndex`] holds the parsed metadata of every note and the graph
//! between them: which note each link points at, which notes link back, and
//! which notes carry each tag. It is rebuilt from the files on disk and holds
//! nothing that the files do not.
//!
//! # How a link finds its note
//!
//! Matching ignores case and a trailing `.md`.
//!
//! 1. A target is matched against note paths from the right, so `Plan`
//!    matches `Plan.md` anywhere and `2026/Plan` matches
//!    `Projects/2026/Plan.md`.
//! 2. If no note matches, the target is tried as an alias from note
//!    properties.
//! 3. If no alias matches, it is tried as a non-note file (`diagram.png`).
//!
//! A target that includes a folder and names a note's full path from the
//! vault root always means that note. Otherwise, when several notes match,
//! the one in the linking note's own folder wins, then the one with the
//! shortest path, then alphabetical order.

use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};

use diamond_parse::NoteMeta;
use diamond_vault::{EntryKind, Vault, VaultError, VaultPath};
use rayon::prelude::*;

/// Identifies a note within one [`VaultIndex`]. Ids change when the index is
/// rebuilt or notes are added and removed; do not store them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct NoteId(u32);

impl NoteId {
    fn index(self) -> usize {
        self.0 as usize
    }
}

/// One indexed note.
#[derive(Clone, Debug)]
pub struct Note {
    /// Where the note is in the vault.
    pub path: VaultPath,
    /// What the parser extracted from it.
    pub meta: NoteMeta,
}

impl Note {
    /// The note's display title: its `title` property, or its file name
    /// without the extension.
    pub fn title(&self) -> &str {
        self.meta
            .frontmatter
            .as_ref()
            .and_then(|frontmatter| frontmatter.title.as_deref())
            .unwrap_or_else(|| self.path.stem())
    }
}

/// Where a link leads.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LinkTarget<'a> {
    /// Another note, or the same note for `[[#Heading]]`.
    Note(&'a VaultPath),
    /// A file that is not a note, such as an image.
    File(&'a VaultPath),
    /// Nothing in the vault matches; the text is the target as written.
    Unresolved(&'a str),
}

/// Timings and counts from [`VaultIndex::build`].
#[derive(Clone, Debug, Default)]
pub struct BuildReport {
    /// Notes indexed.
    pub notes: usize,
    /// Non-note files seen.
    pub files: usize,
    /// Links and embeds found across all notes.
    pub links: usize,
    /// Notes that could not be read, with the reason. They are left out of
    /// the index; the rest of the vault still loads.
    pub skipped: Vec<(VaultPath, String)>,
    /// Time spent listing the vault folder.
    pub walk: Duration,
    /// Time spent reading and parsing notes.
    pub parse: Duration,
    /// Time spent resolving links.
    pub graph: Duration,
}

impl BuildReport {
    /// Total build time.
    pub fn total(&self) -> Duration {
        self.walk + self.parse + self.graph
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Resolved {
    Note(NoteId),
    File(u32),
    Unresolved,
}

/// The index of one vault.
#[derive(Debug, Default)]
pub struct VaultIndex {
    /// Sorted by path.
    notes: Vec<Note>,
    /// Non-note files, sorted by path.
    files: Vec<VaultPath>,

    /// Lowercased path without `.md`, per note.
    keys: Vec<String>,
    by_path: HashMap<String, NoteId>,
    by_stem: HashMap<String, Vec<NoteId>>,
    by_alias: HashMap<String, Vec<NoteId>>,
    files_by_name: HashMap<String, Vec<u32>>,

    /// Per note, one entry per link in `meta.links`.
    outgoing: Vec<Vec<Resolved>>,
    /// Per note, the notes that link to it, sorted and without duplicates.
    backlinks: Vec<Vec<NoteId>>,
    /// Lowercased tag to its first-seen spelling and the notes carrying it.
    tags: BTreeMap<String, (String, Vec<NoteId>)>,
}

impl VaultIndex {
    /// Reads and indexes every note in the vault.
    ///
    /// Notes are read and parsed in parallel. A note that cannot be read is
    /// reported in [`BuildReport::skipped`] and does not fail the build.
    pub fn build(vault: &Vault) -> Result<(Self, BuildReport), VaultError> {
        let mut report = BuildReport::default();

        let started = Instant::now();
        let entries = vault.entries()?;
        report.walk = started.elapsed();

        let started = Instant::now();
        let mut note_paths = Vec::new();
        let mut files = Vec::new();
        for entry in entries {
            match entry.kind {
                EntryKind::Note => note_paths.push(entry.path),
                EntryKind::Canvas | EntryKind::Attachment => files.push(entry.path),
                EntryKind::Folder => {}
            }
        }
        let parsed: Vec<Result<Note, (VaultPath, String)>> = note_paths
            .into_par_iter()
            .map(|path| match vault.read(&path) {
                Ok(source) => Ok(Note {
                    meta: diamond_parse::parse(&source),
                    path,
                }),
                Err(error) => Err((path, error.to_string())),
            })
            .collect();
        let mut notes = Vec::with_capacity(parsed.len());
        for result in parsed {
            match result {
                Ok(note) => notes.push(note),
                Err(skipped) => report.skipped.push(skipped),
            }
        }
        report.parse = started.elapsed();

        let started = Instant::now();
        let index = Self::from_parts(notes, files);
        report.graph = started.elapsed();

        report.notes = index.notes.len();
        report.files = index.files.len();
        report.links = index.notes.iter().map(|note| note.meta.links.len()).sum();
        Ok((index, report))
    }

    /// Builds an index from note sources already in memory.
    pub fn from_sources<I, S>(sources: I) -> Self
    where
        I: IntoIterator<Item = (VaultPath, S)>,
        S: AsRef<str>,
    {
        let notes = sources
            .into_iter()
            .map(|(path, source)| Note {
                meta: diamond_parse::parse(source.as_ref()),
                path,
            })
            .collect();
        Self::from_parts(notes, Vec::new())
    }

    fn from_parts(mut notes: Vec<Note>, mut files: Vec<VaultPath>) -> Self {
        notes.sort_by(|a, b| a.path.cmp(&b.path));
        notes.dedup_by(|later, earlier| later.path == earlier.path);
        files.sort();
        files.dedup();
        let mut index = Self {
            notes,
            files,
            ..Self::default()
        };
        index.rebuild_graph();
        index
    }

    /// Number of notes in the index.
    pub fn len(&self) -> usize {
        self.notes.len()
    }

    /// Whether the index holds no notes.
    pub fn is_empty(&self) -> bool {
        self.notes.is_empty()
    }

    /// Every note, sorted by path.
    pub fn notes(&self) -> &[Note] {
        &self.notes
    }

    /// The note at `path`, if it is indexed.
    pub fn note(&self, path: &VaultPath) -> Option<&Note> {
        self.id_of(path).map(|id| &self.notes[id.index()])
    }

    /// Adds a note or replaces its contents, then re-resolves links.
    ///
    /// Resolution is redone for the whole vault because a new or renamed
    /// note can change where other notes' links lead. It is a pass of hash
    /// lookups over metadata already in memory; no file is re-read.
    pub fn upsert(&mut self, path: VaultPath, source: &str) {
        let note = Note {
            meta: diamond_parse::parse(source),
            path,
        };
        match self
            .notes
            .binary_search_by(|probe| probe.path.cmp(&note.path))
        {
            Ok(existing) => self.notes[existing] = note,
            Err(insert_at) => self.notes.insert(insert_at, note),
        }
        self.rebuild_graph();
    }

    /// Removes a note. Links to it become unresolved. Returns whether the
    /// note was in the index.
    pub fn remove(&mut self, path: &VaultPath) -> bool {
        let Ok(position) = self.notes.binary_search_by(|probe| probe.path.cmp(path)) else {
            return false;
        };
        self.notes.remove(position);
        self.rebuild_graph();
        true
    }

    /// Where the link `target`, written in the note `from`, leads.
    pub fn resolve<'a>(&'a self, from: &VaultPath, target: &'a str) -> LinkTarget<'a> {
        match self.resolve_target(from, target) {
            Resolved::Note(id) => LinkTarget::Note(&self.notes[id.index()].path),
            Resolved::File(file) => LinkTarget::File(&self.files[file as usize]),
            Resolved::Unresolved => LinkTarget::Unresolved(target),
        }
    }

    /// Where each link in the note leads, in the order of `meta.links`.
    pub fn outgoing(&self, path: &VaultPath) -> Vec<LinkTarget<'_>> {
        let Some(id) = self.id_of(path) else {
            return Vec::new();
        };
        let note = &self.notes[id.index()];
        self.outgoing[id.index()]
            .iter()
            .zip(&note.meta.links)
            .map(|(resolved, link)| match resolved {
                Resolved::Note(target) => LinkTarget::Note(&self.notes[target.index()].path),
                Resolved::File(file) => LinkTarget::File(&self.files[*file as usize]),
                Resolved::Unresolved => LinkTarget::Unresolved(&link.target),
            })
            .collect()
    }

    /// The notes that link to or embed the note at `path`, sorted by path.
    /// A note's links to itself are not counted.
    pub fn backlinks(&self, path: &VaultPath) -> Vec<&VaultPath> {
        let Some(id) = self.id_of(path) else {
            return Vec::new();
        };
        self.backlinks[id.index()]
            .iter()
            .map(|source| &self.notes[source.index()].path)
            .collect()
    }

    /// Link targets that match nothing, each with the notes that use it,
    /// sorted by target. Targets are lowercased.
    pub fn unresolved(&self) -> BTreeMap<String, Vec<&VaultPath>> {
        let mut unresolved: BTreeMap<String, Vec<&VaultPath>> = BTreeMap::new();
        for (note, targets) in self.notes.iter().zip(&self.outgoing) {
            for (resolved, link) in targets.iter().zip(&note.meta.links) {
                if *resolved == Resolved::Unresolved {
                    let sources = unresolved
                        .entry(normalize_target(&link.target))
                        .or_default();
                    if sources.last() != Some(&&note.path) {
                        sources.push(&note.path);
                    }
                }
            }
        }
        unresolved
    }

    /// Every tag with the number of notes carrying exactly that tag, sorted
    /// by tag without regard to case.
    pub fn tags(&self) -> impl Iterator<Item = (&str, usize)> {
        self.tags
            .values()
            .map(|(name, notes)| (name.as_str(), notes.len()))
    }

    /// The notes carrying `tag` or a tag nested under it, sorted by path.
    /// `project` matches `#project` and `#project/active`. A leading `#` and
    /// case are ignored.
    pub fn notes_with_tag(&self, tag: &str) -> Vec<&VaultPath> {
        let wanted = tag.trim_start_matches('#').to_lowercase();
        let nested_prefix = format!("{wanted}/");
        let mut ids: Vec<NoteId> = self
            .tags
            .range(wanted.clone()..)
            .take_while(|(key, _)| key.starts_with(&wanted))
            .filter(|(key, _)| **key == wanted || key.starts_with(&nested_prefix))
            .flat_map(|(_, (_, notes))| notes.iter().copied())
            .collect();
        ids.sort();
        ids.dedup();
        ids.into_iter()
            .map(|id| &self.notes[id.index()].path)
            .collect()
    }

    fn id_of(&self, path: &VaultPath) -> Option<NoteId> {
        self.notes
            .binary_search_by(|probe| probe.path.cmp(path))
            .ok()
            .map(|position| NoteId(position as u32))
    }

    fn rebuild_graph(&mut self) {
        let count = self.notes.len();
        self.keys = self
            .notes
            .iter()
            .map(|note| note_key(note.path.as_str()))
            .collect();

        self.by_path.clear();
        self.by_stem.clear();
        self.by_alias.clear();
        self.tags.clear();
        for (position, note) in self.notes.iter().enumerate() {
            let id = NoteId(position as u32);
            self.by_path.insert(self.keys[position].clone(), id);
            self.by_stem
                .entry(note.path.stem().to_lowercase())
                .or_default()
                .push(id);
            if let Some(frontmatter) = &note.meta.frontmatter {
                for alias in &frontmatter.aliases {
                    let ids = self.by_alias.entry(alias.to_lowercase()).or_default();
                    if ids.last() != Some(&id) {
                        ids.push(id);
                    }
                }
            }
            for tag in note.meta.all_tags() {
                let (_, ids) = self
                    .tags
                    .entry(tag.to_lowercase())
                    .or_insert_with(|| (tag.to_owned(), Vec::new()));
                ids.push(id);
            }
        }

        self.files_by_name.clear();
        for (position, file) in self.files.iter().enumerate() {
            self.files_by_name
                .entry(file.file_name().to_lowercase())
                .or_default()
                .push(position as u32);
        }

        let outgoing: Vec<Vec<Resolved>> = self
            .notes
            .par_iter()
            .map(|note| {
                note.meta
                    .links
                    .iter()
                    .map(|link| self.resolve_target(&note.path, &link.target))
                    .collect()
            })
            .collect();

        let mut backlinks: Vec<Vec<NoteId>> = vec![Vec::new(); count];
        for (position, targets) in outgoing.iter().enumerate() {
            let source = NoteId(position as u32);
            for resolved in targets {
                if let Resolved::Note(target) = resolved
                    && *target != source
                {
                    backlinks[target.index()].push(source);
                }
            }
        }
        for sources in &mut backlinks {
            sources.sort();
            sources.dedup();
        }

        self.outgoing = outgoing;
        self.backlinks = backlinks;
    }

    fn resolve_target(&self, from: &VaultPath, target: &str) -> Resolved {
        let wanted = normalize_target(target);
        if wanted.is_empty() {
            // `[[#Heading]]` points into the note it is written in.
            return match self.id_of(from) {
                Some(id) => Resolved::Note(id),
                None => Resolved::Unresolved,
            };
        }

        // A target with a folder in it that names a full path means exactly
        // that note, even when a nearer note also ends with the same path.
        if wanted.contains('/')
            && let Some(id) = self.by_path.get(&wanted)
        {
            return Resolved::Note(*id);
        }

        let stem = wanted.rsplit('/').next().unwrap_or(&wanted);
        if let Some(candidates) = self.by_stem.get(stem) {
            let suffix = format!("/{wanted}");
            let matching = candidates.iter().copied().filter(|id| {
                let key = &self.keys[id.index()];
                *key == wanted || key.ends_with(&suffix)
            });
            if let Some(best) = self.closest(from, matching) {
                return Resolved::Note(best);
            }
        }

        if let Some(candidates) = self.by_alias.get(&wanted)
            && let Some(best) = self.closest(from, candidates.iter().copied())
        {
            return Resolved::Note(best);
        }

        self.resolve_file(&wanted)
    }

    fn resolve_file(&self, wanted: &str) -> Resolved {
        let name = wanted.rsplit('/').next().unwrap_or(wanted);
        let Some(candidates) = self.files_by_name.get(name) else {
            return Resolved::Unresolved;
        };
        let suffix = format!("/{wanted}");
        candidates
            .iter()
            .copied()
            .filter(|file| {
                let path = self.files[*file as usize].as_str().to_lowercase();
                path == wanted || path.ends_with(&suffix)
            })
            .min_by_key(|file| {
                let path = &self.files[*file as usize];
                (path.components().count(), path.as_str().to_lowercase())
            })
            .map_or(Resolved::Unresolved, Resolved::File)
    }

    /// Picks the candidate nearest the linking note: same folder first, then
    /// the shortest path, then alphabetical.
    fn closest(
        &self,
        from: &VaultPath,
        candidates: impl Iterator<Item = NoteId>,
    ) -> Option<NoteId> {
        let from_folder = from.parent().map(str::to_lowercase);
        candidates.min_by_key(|id| {
            let path = &self.notes[id.index()].path;
            let same_folder = path.parent().map(str::to_lowercase) == from_folder;
            (
                !same_folder,
                path.components().count(),
                &self.keys[id.index()],
            )
        })
    }
}

/// The lookup form of a note path: lowercased, without the `.md` extension.
fn note_key(path: &str) -> String {
    let lowered = path.to_lowercase();
    match lowered.strip_suffix(".md") {
        Some(stripped) => stripped.to_owned(),
        None => lowered,
    }
}

/// The lookup form of a link target as written in a note.
fn normalize_target(target: &str) -> String {
    let trimmed = target.trim().trim_start_matches('/');
    let key = note_key(trimmed);
    // `./Note` and `../Note` are relative forms; matching from the right
    // makes the leading dots redundant.
    key.trim_start_matches("./")
        .trim_start_matches("../")
        .to_owned()
}

#[cfg(test)]
mod tests;
