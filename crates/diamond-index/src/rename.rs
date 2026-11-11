//! Keeping links intact when notes are renamed or moved.
//!
//! [`VaultIndex::rename_edits`] works out, before anything changes on disk,
//! the new text of every note whose links would otherwise break or change
//! meaning. Only the target part of each affected link is rewritten; display
//! text, headings, block references and everything around the link stay as
//! the author wrote them.

use std::collections::HashMap;

use diamond_parse::LinkSyntax;
use diamond_vault::VaultPath;

use crate::{Resolved, VaultIndex, note_key};

/// The new text for one note, to be written after the rename.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteEdit {
    /// The note's path before the rename. If the note itself is being moved,
    /// write the text to its new path.
    pub path: VaultPath,
    /// The note's full text with its links updated.
    pub text: String,
}

impl VaultIndex {
    /// The edits that keep links pointing at the right notes when each
    /// `(from, to)` pair in `moves` is renamed or moved.
    ///
    /// A link written as a bare name (`[[Plan]]`) is left alone when the
    /// name does not change, since it still finds the note after a move. A
    /// link that spelled out a path gets the new path. Notes with nothing to
    /// change are not returned.
    pub fn rename_edits(&self, moves: &[(VaultPath, VaultPath)]) -> Vec<NoteEdit> {
        let destinations: HashMap<&VaultPath, &VaultPath> =
            moves.iter().map(|(from, to)| (from, to)).collect();

        // Names in use once the moves are done, to tell whether a bare name
        // will still be unambiguous.
        let mut stems_after: HashMap<String, usize> = HashMap::new();
        for note in &self.notes {
            let path = destinations.get(&note.path).copied().unwrap_or(&note.path);
            *stems_after.entry(path.stem().to_lowercase()).or_default() += 1;
        }

        let mut edits = Vec::new();
        for (position, note) in self.notes.iter().enumerate() {
            let mut text = String::new();
            let mut copied_to = 0;
            for (link, resolved) in note.meta.links.iter().zip(&self.outgoing[position]) {
                let Resolved::Note(target) = resolved else {
                    continue;
                };
                let old = &self.notes[target.index()].path;
                let Some(new) = destinations.get(old) else {
                    continue;
                };
                // `[[#Heading]]` points into its own note and moves with it.
                if link.target.is_empty() {
                    continue;
                }
                let written = &note.text[link.range.clone()];
                let Some(target_range) = target_span(written, link.syntax) else {
                    continue;
                };
                let old_target = &written[target_range.clone()];
                let new_target = match link.syntax {
                    LinkSyntax::Wiki => wiki_target(old_target, old, new, &stems_after),
                    LinkSyntax::Markdown => Some(diamond_parse::percent_encode(new.as_str())),
                };
                let Some(new_target) = new_target else {
                    continue;
                };

                let start = link.range.start + target_range.start;
                let end = link.range.start + target_range.end;
                text.push_str(&note.text[copied_to..start]);
                text.push_str(&new_target);
                copied_to = end;
            }
            if copied_to > 0 {
                text.push_str(&note.text[copied_to..]);
                edits.push(NoteEdit {
                    path: note.path.clone(),
                    text,
                });
            }
        }
        edits
    }
}

/// The part of a link's source text that names its target.
///
/// For `![[Plan#Budget|shown]]` that is `Plan`; for `[shown](Plan.md#Budget)`
/// it is `Plan.md`.
fn target_span(written: &str, syntax: LinkSyntax) -> Option<std::ops::Range<usize>> {
    match syntax {
        LinkSyntax::Wiki => {
            let start = written.find("[[")? + 2;
            let rest = &written[start..];
            let end = rest
                .find(['#', '|'])
                .or_else(|| rest.find("]]"))
                .unwrap_or(rest.len());
            // In a table the pipe is written `\|`; the backslash is not part
            // of the target.
            let end = if rest[..end].ends_with('\\') && rest[end..].starts_with('|') {
                end - 1
            } else {
                end
            };
            Some(start..start + end)
        }
        LinkSyntax::Markdown => {
            let start = written.rfind("](")? + 2;
            let rest = &written[start..];
            // An angle-bracketed destination can hold spaces and `)`.
            if let Some(inner) = rest.strip_prefix('<') {
                let end = inner.find(['#', '>'])?;
                return Some(start + 1..start + 1 + end);
            }
            let end = rest.find(['#', ' ', ')']).unwrap_or(rest.len());
            Some(start..start + end)
        }
    }
}

/// The new target text for a wikilink, or `None` when the link can stay as
/// it is.
fn wiki_target(
    old_target: &str,
    old: &VaultPath,
    new: &VaultPath,
    stems_after: &HashMap<String, usize>,
) -> Option<String> {
    let wrote_extension = old_target.trim().to_lowercase().ends_with(".md");
    let new_path = if wrote_extension {
        new.as_str().to_owned()
    } else {
        strip_md(new.as_str()).to_owned()
    };

    let wrote_path = old_target.contains('/');
    let unique_after = stems_after.get(&new.stem().to_lowercase()).copied() == Some(1);
    let replacement = if wrote_path || !unique_after {
        new_path
    } else if wrote_extension {
        new.file_name().to_owned()
    } else {
        new.stem().to_owned()
    };

    // A bare name that still names the note needs no edit.
    let same_name = old.stem().eq_ignore_ascii_case(new.stem());
    if !wrote_path && same_name && unique_after {
        return None;
    }
    (note_key(old_target.trim()) != note_key(&replacement) || wrote_path).then_some(replacement)
}

fn strip_md(path: &str) -> &str {
    path.strip_suffix(".md")
        .or_else(|| path.strip_suffix(".MD"))
        .unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    fn index(notes: &[(&str, &str)]) -> VaultIndex {
        VaultIndex::from_sources(notes.iter().map(|(p, source)| (path(p), *source)))
    }

    fn edits(index: &VaultIndex, moves: &[(&str, &str)]) -> Vec<(String, String)> {
        let moves: Vec<_> = moves
            .iter()
            .map(|(from, to)| (path(from), path(to)))
            .collect();
        index
            .rename_edits(&moves)
            .into_iter()
            .map(|edit| (edit.path.to_string(), edit.text))
            .collect()
    }

    #[test]
    fn renaming_rewrites_only_the_target_of_each_link() {
        let index = index(&[
            (
                "Home.md",
                "See [[Plan]], [[Plan|the plan]], [[Plan#Budget]], [[plan#^q3|Q3]] and ![[Plan]].\n\
                 Also [md](Plan.md#Budget) and [[Other]]. `[[Plan]]` in code stays.\n",
            ),
            ("Plan.md", "self [[Plan]] and [[#Top]]"),
            ("Other.md", "nothing"),
        ]);
        assert_eq!(
            edits(&index, &[("Plan.md", "Roadmap 2027.md")]),
            vec![
                (
                    "Home.md".to_owned(),
                    "See [[Roadmap 2027]], [[Roadmap 2027|the plan]], [[Roadmap 2027#Budget]], \
                     [[Roadmap 2027#^q3|Q3]] and ![[Roadmap 2027]].\n\
                     Also [md](Roadmap%202027.md#Budget) and [[Other]]. `[[Plan]]` in code stays.\n"
                        .to_owned()
                ),
                (
                    "Plan.md".to_owned(),
                    "self [[Roadmap 2027]] and [[#Top]]".to_owned()
                ),
            ]
        );
    }

    #[test]
    fn moving_keeps_bare_names_and_updates_written_paths() {
        let index = index(&[
            (
                "Home.md",
                "[[Plan]] [[Work/Plan]] [[Work/Plan.md|x]] [p](Work/Plan.md)",
            ),
            ("Work/Plan.md", ""),
        ]);
        assert_eq!(
            edits(&index, &[("Work/Plan.md", "Archive/2026/Plan.md")]),
            vec![(
                "Home.md".to_owned(),
                "[[Plan]] [[Archive/2026/Plan]] [[Archive/2026/Plan.md|x]] [p](Archive/2026/Plan.md)"
                    .to_owned()
            )]
        );
        // Nothing links by path: nothing to edit.
        let bare = index_with_bare_link();
        assert!(edits(&bare, &[("Work/Plan.md", "Archive/Plan.md")]).is_empty());
    }

    fn index_with_bare_link() -> VaultIndex {
        index(&[("Home.md", "[[Plan]]"), ("Work/Plan.md", "")])
    }

    #[test]
    fn a_name_that_becomes_ambiguous_is_spelled_out() {
        let index = index(&[
            ("Home.md", "[[Draft]]"),
            ("Draft.md", ""),
            ("Archive/Plan.md", ""),
        ]);
        // After the rename two notes are called Plan, so the bare name would
        // no longer say which one.
        assert_eq!(
            edits(&index, &[("Draft.md", "Plan.md")]),
            vec![("Home.md".to_owned(), "[[Plan]]".to_owned())]
        );
        let moved = edits(&index, &[("Draft.md", "Work/Plan.md")]);
        assert_eq!(
            moved,
            vec![("Home.md".to_owned(), "[[Work/Plan]]".to_owned())]
        );
    }

    #[test]
    fn table_pipes_and_angle_brackets_survive() {
        let index = index(&[
            (
                "Home.md",
                "| a |\n|---|\n| [[Plan\\|shown]] |\n\n[x](<My Plan.md>) [y](<My Plan.md#H>)",
            ),
            ("Plan.md", ""),
            ("My Plan.md", ""),
        ]);
        assert_eq!(
            edits(
                &index,
                &[("Plan.md", "Road.md"), ("My Plan.md", "Our Plan.md")]
            ),
            vec![(
                "Home.md".to_owned(),
                "| a |\n|---|\n| [[Road\\|shown]] |\n\n[x](<Our%20Plan.md>) [y](<Our%20Plan.md#H>)"
                    .to_owned()
            )]
        );
    }

    #[test]
    fn a_folder_move_updates_links_between_the_moved_notes_too() {
        let index = index(&[
            ("Home.md", "[[Old/A]] [[B]]"),
            ("Old/A.md", "[[Old/B]] [[B]]"),
            ("Old/B.md", "[[Old/A|a]]"),
        ]);
        assert_eq!(
            edits(
                &index,
                &[("Old/A.md", "New/A.md"), ("Old/B.md", "New/B.md")]
            ),
            vec![
                ("Home.md".to_owned(), "[[New/A]] [[B]]".to_owned()),
                ("Old/A.md".to_owned(), "[[New/B]] [[B]]".to_owned()),
                ("Old/B.md".to_owned(), "[[New/A|a]]".to_owned()),
            ]
        );
    }

    #[test]
    fn unrelated_renames_change_nothing() {
        let index = index(&[
            ("Home.md", "[[Plan]] [[Ghost]]"),
            ("Plan.md", ""),
            ("Solo.md", ""),
        ]);
        assert!(edits(&index, &[("Solo.md", "Renamed.md")]).is_empty());
        assert!(edits(&index, &[]).is_empty());
    }
}
