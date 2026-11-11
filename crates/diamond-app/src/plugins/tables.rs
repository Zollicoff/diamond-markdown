//! Tables: commands that work on the Markdown table under the cursor.
//!
//! A table stays plain Markdown. The commands line its columns up, add a row
//! or a column, and insert a new one.

use std::ops::Range;

use crate::plugin::{Command, Plugin};

/// How a column's cells are lined up, as its delimiter cell says.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Align {
    /// `---`
    None,
    /// `:--`
    Left,
    /// `:-:`
    Center,
    /// `--:`
    Right,
}

/// Splits a table row into its cells, without the outer pipes. A pipe
/// written `\|` is part of a cell.
fn cells(row: &str) -> Vec<String> {
    let row = row.trim();
    let row = row.strip_prefix('|').unwrap_or(row);
    let mut cells = Vec::new();
    let mut cell = String::new();
    let mut escaped = false;
    for c in row.chars() {
        match c {
            '|' if !escaped => cells.push(std::mem::take(&mut cell).trim().to_owned()),
            _ => cell.push(c),
        }
        escaped = c == '\\' && !escaped;
    }
    // Text after the last pipe is a cell only if the row had no closing pipe.
    if !cell.trim().is_empty() {
        cells.push(cell.trim().to_owned());
    }
    cells
}

/// Reads a delimiter row (`| --- | :-: |`), or `None` if the row is not one.
fn alignments(row: &str) -> Option<Vec<Align>> {
    let cells = cells(row);
    if cells.is_empty() {
        return None;
    }
    cells
        .iter()
        .map(|cell| {
            let dashes = cell.trim_matches(':');
            if dashes.is_empty() || !dashes.chars().all(|c| c == '-') {
                return None;
            }
            Some(match (cell.starts_with(':'), cell.ends_with(':')) {
                (true, true) => Align::Center,
                (true, false) => Align::Left,
                (false, true) => Align::Right,
                (false, false) => Align::None,
            })
        })
        .collect()
}

/// The byte range of the table the cursor is in: a run of lines with a
/// pipe in them whose second line is a delimiter row.
fn table_at(text: &str, cursor: usize) -> Option<Range<usize>> {
    let mut lines = Vec::new();
    let mut start = 0;
    for line in text.split_inclusive('\n') {
        lines.push((start, line));
        start += line.len();
    }
    let at = lines
        .iter()
        .rposition(|(line_start, _)| *line_start <= cursor)?;
    let in_table = |index: usize| lines[index].1.contains('|');
    if !in_table(at) {
        return None;
    }
    let mut first = at;
    while first > 0 && in_table(first - 1) {
        first -= 1;
    }
    let mut last = at;
    while last + 1 < lines.len() && in_table(last + 1) {
        last += 1;
    }
    alignments(lines.get(first + 1)?.1)?;
    let end = lines[last].0 + lines[last].1.len();
    Some(lines[first].0..end)
}

/// A table taken apart: its header, how its columns line up, and its rows.
struct Table {
    header: Vec<String>,
    aligns: Vec<Align>,
    rows: Vec<Vec<String>>,
}

impl Table {
    fn parse(table: &str) -> Option<Self> {
        let mut lines = table.lines();
        let header = cells(lines.next()?);
        let aligns = alignments(lines.next()?)?;
        Some(Self {
            header,
            aligns,
            rows: lines.map(cells).collect(),
        })
    }

    /// Writes the table with every column padded to its widest cell.
    fn write(&self) -> String {
        let columns = self
            .rows
            .iter()
            .map(Vec::len)
            .chain([self.header.len(), self.aligns.len()])
            .max()
            .unwrap_or(0);
        let cell = |row: &[String], column: usize| row.get(column).cloned().unwrap_or_default();
        let widths: Vec<usize> = (0..columns)
            .map(|column| {
                self.rows
                    .iter()
                    .chain([&self.header])
                    .map(|row| cell(row, column).chars().count())
                    .max()
                    .unwrap_or(0)
                    .max(3)
            })
            .collect();
        let align = |column: usize| self.aligns.get(column).copied().unwrap_or(Align::None);

        let line = |row: &[String]| {
            let mut out = String::from("|");
            for (column, width) in widths.iter().enumerate() {
                let text = cell(row, column);
                let gap = width - text.chars().count();
                let (before, after) = match align(column) {
                    Align::Right => (gap, 0),
                    Align::Center => (gap / 2, gap - gap / 2),
                    Align::None | Align::Left => (0, gap),
                };
                out.push_str(&format!(
                    " {}{text}{} |",
                    " ".repeat(before),
                    " ".repeat(after)
                ));
            }
            out.push('\n');
            out
        };
        let mut out = line(&self.header);
        out.push('|');
        for (column, width) in widths.iter().enumerate() {
            let rule = match align(column) {
                Align::None => "-".repeat(*width),
                Align::Left => format!(":{}", "-".repeat(width - 1)),
                Align::Right => format!("{}:", "-".repeat(width - 1)),
                Align::Center => format!(":{}:", "-".repeat(width - 2)),
            };
            out.push_str(&format!(" {rule} |"));
        }
        out.push('\n');
        for row in &self.rows {
            out.push_str(&line(row));
        }
        out
    }
}

/// What a table command does to a table once it is taken apart.
type Change = fn(&mut Table);

/// The edit that applies `change` to the table under the cursor and lines
/// its columns up: the range to replace and the new text.
fn edit(text: &str, cursor: usize, change: Change) -> Option<(Range<usize>, String)> {
    let range = table_at(text, cursor)?;
    let mut table = Table::parse(&text[range.clone()])?;
    change(&mut table);
    let mut written = table.write();
    // A table that ended the note without a newline still does.
    if !text[range.clone()].ends_with('\n') {
        written.pop();
    }
    Some((range, written))
}

/// A new, empty table of two columns, set apart from the text around the
/// cursor by blank lines where needed.
fn insert(text: &str, cursor: usize) -> (Range<usize>, String) {
    let before = &text[..cursor.min(text.len())];
    let lead = if before.is_empty() || before.ends_with("\n\n") {
        ""
    } else if before.ends_with('\n') {
        "\n"
    } else {
        "\n\n"
    };
    let table = "|     |     |\n| --- | --- |\n|     |     |\n";
    (cursor..cursor, format!("{lead}{table}"))
}

/// The tables plugin.
#[derive(Default)]
pub struct Tables;

impl Plugin for Tables {
    fn id(&self) -> &'static str {
        "tables"
    }

    fn commands(&self) -> Vec<Command> {
        fn on_table(
            title: &'static str,
            keywords: &'static [&'static str],
            change: Change,
        ) -> Command {
            Command::new(title, keywords, move |workspace, window, cx| {
                let mut found = false;
                workspace.edit_note(window, cx, |text, cursor| {
                    let edit = edit(text, cursor, change);
                    found = edit.is_some();
                    edit
                });
                if !found && workspace.current().is_some() {
                    workspace.report("Put the cursor in a table first", cx);
                }
            })
        }
        vec![
            Command::new(
                "Insert table",
                &["grid", "columns"],
                |workspace, window, cx| {
                    workspace.edit_note(window, cx, |text, cursor| Some(insert(text, cursor)));
                },
            ),
            on_table(
                "Line up table columns",
                &["format", "align", "tidy"],
                |_| {},
            ),
            on_table("Add table row", &["line"], |table| {
                table.rows.push(Vec::new());
            }),
            on_table("Add table column", &["field"], |table| {
                let columns = table.header.len().max(table.aligns.len());
                table.header.resize(columns + 1, String::new());
                table.aligns.resize(columns + 1, Align::None);
            }),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MESSY: &str = "Intro\n\n| Item | Cost|Note\n|:--|--:|:-:|\n| Rent | 1000 |\n|Tea\\|Coffee|4|daily|\n\nAfter\n";

    fn apply(text: &str, cursor: usize, change: Change) -> String {
        let (range, new) = edit(text, cursor, change).expect("a table at the cursor");
        format!("{}{new}{}", &text[..range.start], &text[range.end..])
    }

    #[test]
    fn a_table_is_found_only_under_the_cursor() {
        let start = MESSY.find("| Item").unwrap();
        let end = MESSY.find("\nAfter").unwrap();
        for cursor in [start, start + 20, end - 1] {
            assert_eq!(table_at(MESSY, cursor), Some(start..end), "at {cursor}");
        }
        assert_eq!(table_at(MESSY, 2), None);
        assert_eq!(table_at(MESSY, MESSY.len() - 2), None);
        // Lines with pipes but no delimiter row are not a table.
        assert_eq!(table_at("a | b\nc | d\n", 0), None);
        assert_eq!(table_at("", 0), None);
    }

    #[test]
    fn lining_up_pads_every_column_and_keeps_alignment() {
        assert_eq!(
            apply(MESSY, MESSY.find("Rent").unwrap(), |_| {}),
            "Intro\n\n\
             | Item        | Cost | Note  |\n\
             | :---------- | ---: | :---: |\n\
             | Rent        | 1000 |       |\n\
             | Tea\\|Coffee |    4 | daily |\n\
             \nAfter\n"
        );
        // Lining up twice changes nothing more.
        let once = apply(MESSY, 10, |_| {});
        assert_eq!(apply(&once, 10, |_| {}), once);
    }

    #[test]
    fn rows_and_columns_are_added_at_the_end() {
        let table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
        assert_eq!(
            apply(table, 0, |table| table.rows.push(Vec::new())),
            "| A   | B   |\n| --- | --- |\n| 1   | 2   |\n|     |     |"
        );
        let commands = Tables.commands();
        assert_eq!(commands.len(), 4);
        let wider = apply(table, 0, |table| {
            table.header.push(String::new());
            table.aligns.push(Align::None);
        });
        assert_eq!(
            wider,
            "| A   | B   |     |\n| --- | --- | --- |\n| 1   | 2   |     |"
        );
    }

    #[test]
    fn a_new_table_is_set_apart_from_the_text_before_it() {
        let table = "|     |     |\n| --- | --- |\n|     |     |\n";
        assert_eq!(insert("", 0), (0..0, table.to_owned()));
        assert_eq!(insert("text", 4).1, format!("\n\n{table}"));
        assert_eq!(insert("text\n", 5).1, format!("\n{table}"));
        assert_eq!(insert("text\n\n", 6).1, table);
    }
}
