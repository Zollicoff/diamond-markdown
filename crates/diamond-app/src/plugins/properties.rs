//! Properties: the YAML block at the top of a note, shown in the context
//! panel and changed one property at a time.
//!
//! Clicking a property asks for its new value; an empty value removes it.
//! What is typed is written as it is, so `true`, `3`, `[a, b]` and plain
//! text all mean what they mean in YAML.

use std::ops::Range;
use std::rc::Rc;

use diamond_vault::VaultPath;

use crate::plugin::{Plugin, Row, RowAction, Section};
use crate::session::Session;

/// The properties block of a note: the range of the lines between its two
/// `---` lines, or `None` if the note does not start with one.
fn block(text: &str) -> Option<Range<usize>> {
    let first = text.split_inclusive('\n').next()?;
    if first.trim_end() != "---" {
        return None;
    }
    let mut at = first.len();
    for line in text[at..].split_inclusive('\n') {
        if line.trim_end() == "---" {
            return Some(first.len()..at);
        }
        at += line.len();
    }
    None
}

/// The edit that sets a property, adds it, or removes it when `value` is
/// empty: the range to replace and the new text. `None` when there is
/// nothing to do, or the key cannot be a property name.
pub fn set(text: &str, key: &str, value: &str) -> Option<(Range<usize>, String)> {
    let (key, value) = (key.trim(), value.trim());
    if key.is_empty() || key.contains([':', '\n', '#']) || value.contains('\n') {
        return None;
    }
    let line = format!("{key}: {value}\n");
    let Some(block) = block(text) else {
        if value.is_empty() {
            return None;
        }
        // The note has no properties yet: give it a block.
        return Some((0..0, format!("---\n{line}---\n")));
    };

    // Find the property's lines: its own, and any indented or list lines
    // that continue its value.
    let mut at = block.start;
    let mut found: Option<Range<usize>> = None;
    for content in text[block.clone()].split_inclusive('\n') {
        let start = at;
        at += content.len();
        let continues = content.starts_with([' ', '\t', '-']) || content.trim().is_empty();
        match &mut found {
            Some(range) if continues && range.end == start => range.end = at,
            Some(_) => {}
            None => {
                let named = content
                    .split_once(':')
                    .is_some_and(|(name, _)| name.trim().eq_ignore_ascii_case(key));
                if named && !continues {
                    found = Some(start..at);
                }
            }
        }
    }
    match (found, value.is_empty()) {
        (Some(range), true) => Some((range, String::new())),
        (Some(range), false) => Some((range, line)),
        (None, true) => None,
        (None, false) => Some((block.end..block.end, line)),
    }
}

/// The properties plugin.
#[derive(Default)]
pub struct Properties;

impl Plugin for Properties {
    fn id(&self) -> &'static str {
        "properties"
    }

    fn sections(&self, session: &Session, current: Option<&VaultPath>) -> Vec<Section> {
        let Some(current) = current else {
            return Vec::new();
        };
        let ask = |key: Option<String>, value: String| {
            RowAction::Run(Rc::new(move |workspace, window, cx| {
                let key = key.clone();
                let (title, hint, initial) = match &key {
                    Some(key) => (
                        format!("Set {key}"),
                        "Enter to set. Leave it empty to remove the property.",
                        value.clone(),
                    ),
                    None => (
                        "Add a property".to_owned(),
                        "Written as name: value. Enter to add.",
                        String::new(),
                    ),
                };
                workspace.prompt(
                    title,
                    hint,
                    &initial,
                    window,
                    cx,
                    move |workspace, typed, window, cx| {
                        let (key, value) = match &key {
                            Some(key) => (key.clone(), typed),
                            None => match typed.split_once(':') {
                                Some((key, value)) => (key.to_owned(), value.to_owned()),
                                None => {
                                    workspace.report("Write it as name: value", cx);
                                    return;
                                }
                            },
                        };
                        workspace.edit_note(window, cx, |text, _| set(text, &key, &value));
                    },
                );
            }))
        };
        let mut rows: Vec<Row> = session
            .properties(current)
            .into_iter()
            .map(|(key, value)| Row {
                label: format!("{key}: {value}"),
                action: ask(Some(key), value),
            })
            .collect();
        rows.push(Row {
            label: "+ Add a property".to_owned(),
            action: ask(None, String::new()),
        });
        vec![Section {
            title: "Properties",
            rows,
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(text: &str, key: &str, value: &str) -> Option<String> {
        let (range, new) = set(text, key, value)?;
        Some(format!(
            "{}{new}{}",
            &text[..range.start],
            &text[range.end..]
        ))
    }

    const NOTE: &str =
        "---\ntitle: Plan\ntags:\n  - a\n  - b\nstatus: open\n---\n# Body\ntitle: not a property\n";

    #[test]
    fn a_property_is_changed_in_place() {
        assert_eq!(
            apply(NOTE, "status", "done").unwrap(),
            NOTE.replace("status: open", "status: done")
        );
        // Names are matched without regard to case, and the name as typed
        // replaces the old spelling.
        assert_eq!(
            apply(NOTE, "Title", "The Plan").unwrap(),
            NOTE.replacen("title: Plan", "Title: The Plan", 1)
        );
        // A value over several lines is replaced whole.
        assert_eq!(
            apply(NOTE, "tags", "[x, y]").unwrap(),
            NOTE.replace("tags:\n  - a\n  - b\n", "tags: [x, y]\n")
        );
    }

    #[test]
    fn a_property_is_added_at_the_end_of_the_block_or_in_a_new_block() {
        assert_eq!(
            apply(NOTE, "due", "2026-11-20").unwrap(),
            NOTE.replace("status: open\n", "status: open\ndue: 2026-11-20\n")
        );
        assert_eq!(
            apply("# Just a body\n", "status", "open").unwrap(),
            "---\nstatus: open\n---\n# Just a body\n"
        );
        assert_eq!(apply("", "a", "1").unwrap(), "---\na: 1\n---\n");
        // A rule later in the note is not a properties block.
        assert_eq!(
            apply("text\n---\nmore\n", "a", "1").unwrap(),
            "---\na: 1\n---\ntext\n---\nmore\n"
        );
    }

    #[test]
    fn an_empty_value_removes_the_property() {
        assert_eq!(
            apply(NOTE, "tags", "").unwrap(),
            NOTE.replace("tags:\n  - a\n  - b\n", "")
        );
        assert_eq!(
            apply(NOTE, "status", "  ").unwrap(),
            NOTE.replace("status: open\n", "")
        );
        // Nothing to remove, and nothing to add.
        assert_eq!(apply(NOTE, "missing", ""), None);
        assert_eq!(apply("no block\n", "missing", ""), None);
    }

    #[test]
    fn names_and_values_that_would_break_the_block_are_refused() {
        for (key, value) in [("", "x"), ("a:b", "x"), ("a", "one\ntwo"), ("# a", "x")] {
            assert_eq!(apply(NOTE, key, value), None, "{key:?}: {value:?}");
        }
    }
}
