//! Queries: tables computed from notes and their properties.
//!
//! A query is a few lines of text. The first lines say which notes, in the
//! same words as search; the rest say what to show:
//!
//! ```text
//! tag:project -tag:done path:Work
//! show: title, status, due
//! sort: due desc
//! limit: 20
//! ```
//!
//! - Lines without a keyword are the search: words, `"quoted phrases"`,
//!   `tag:`, `path:`, and `-` in front of any of them to leave notes out.
//!   No search at all means every note.
//! - `show:` lists the columns. `title`, `name`, `path`, `folder` and
//!   `tags` are about the note itself; any other name is a property. Without
//!   it the table has one column, the title.
//! - `sort:` names one column, shown or not, with `desc` after it for
//!   largest first. Numbers sort as numbers; notes without a value come
//!   last. Without it rows are in order of title.
//! - `limit:` keeps the first so many rows.

use std::cmp::Ordering;

use diamond_vault::VaultPath;

use crate::{Note, VaultIndex};

/// A parsed query.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Query {
    /// Which notes, in search syntax. Empty means all.
    pub search: String,
    /// The columns, as written.
    pub show: Vec<String>,
    /// The column to sort by and whether largest comes first.
    pub sort: Option<(String, bool)>,
    /// The most rows to return, if limited.
    pub limit: Option<usize>,
}

/// One row of a query's result.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    /// The note the row is about.
    pub path: VaultPath,
    /// One value per column.
    pub cells: Vec<String>,
}

/// A query's result.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Table {
    /// The column names, as written in `show:`.
    pub columns: Vec<String>,
    /// The rows, in order.
    pub rows: Vec<Row>,
}

/// Reads a query. Nothing is an error: a line that makes no sense as a
/// keyword line is part of the search.
pub fn parse(source: &str) -> Query {
    let mut query = Query::default();
    let mut search: Vec<&str> = Vec::new();
    for line in source
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let keyword = line
            .split_once(':')
            .map(|(word, rest)| (word.trim(), rest.trim()));
        match keyword {
            Some(("show", columns)) => {
                query.show = columns
                    .split(',')
                    .map(str::trim)
                    .filter(|column| !column.is_empty())
                    .map(str::to_owned)
                    .collect();
            }
            Some(("sort", column)) => {
                let (column, descending) = match column.rsplit_once(char::is_whitespace) {
                    Some((column, "desc")) => (column.trim(), true),
                    Some((column, "asc")) => (column.trim(), false),
                    _ => (column, false),
                };
                if !column.is_empty() {
                    query.sort = Some((column.to_owned(), descending));
                }
            }
            Some(("limit", count)) => query.limit = count.parse().ok(),
            _ => search.push(line),
        }
    }
    query.search = search.join(" ");
    query
}

/// A note's value in a column.
fn cell(note: &Note, column: &str) -> String {
    match column.to_lowercase().as_str() {
        "title" => note.title().to_owned(),
        "name" => note.path.stem().to_owned(),
        "path" => note.path.to_string(),
        "folder" => note.path.parent().unwrap_or_default().to_owned(),
        "tags" => note.meta.all_tags().join(", "),
        property => note
            .meta
            .frontmatter
            .as_ref()
            .and_then(|frontmatter| frontmatter.get(property))
            .map(ToString::to_string)
            .unwrap_or_default(),
    }
}

/// Orders two values of a column: numbers as numbers, text without regard
/// to case, and empty values after everything else whichever way round.
fn compare(a: &str, b: &str, descending: bool) -> Ordering {
    match (a.is_empty(), b.is_empty()) {
        (true, true) => return Ordering::Equal,
        (true, false) => return Ordering::Greater,
        (false, true) => return Ordering::Less,
        (false, false) => {}
    }
    let ordering = match (a.parse::<f64>(), b.parse::<f64>()) {
        (Ok(a), Ok(b)) => a.partial_cmp(&b).unwrap_or(Ordering::Equal),
        _ => a.to_lowercase().cmp(&b.to_lowercase()),
    };
    if descending {
        ordering.reverse()
    } else {
        ordering
    }
}

/// Runs a query against the index.
pub fn run(index: &VaultIndex, query: &Query) -> Table {
    let columns = if query.show.is_empty() {
        vec!["title".to_owned()]
    } else {
        query.show.clone()
    };
    let (sort_column, descending) = match &query.sort {
        Some((column, descending)) => (column.as_str(), *descending),
        None => ("title", false),
    };

    let mut notes = crate::search::select(index, &query.search);
    // Path order is what `select` gives, and the sort is stable, so equal
    // values stay in path order.
    notes.sort_by(|a, b| compare(&cell(a, sort_column), &cell(b, sort_column), descending));
    if let Some(limit) = query.limit {
        notes.truncate(limit);
    }
    Table {
        rows: notes
            .into_iter()
            .map(|note| Row {
                path: note.path.clone(),
                cells: columns.iter().map(|column| cell(note, column)).collect(),
            })
            .collect(),
        columns,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> VaultIndex {
        let notes = [
            (
                "Work/Plan.md",
                "---\ntitle: The Plan\nstatus: open\npriority: 2\ntags: [project]\n---\nbudget\n",
            ),
            (
                "Work/Launch.md",
                "---\nstatus: done\npriority: 10\ntags: [project, done]\n---\n",
            ),
            ("Work/Notes.md", "---\npriority: 1\n---\n#project/side\n"),
            ("Home.md", "plain note about the budget\n"),
        ];
        VaultIndex::from_sources(
            notes
                .iter()
                .map(|(path, source)| (VaultPath::new(path).unwrap(), *source)),
        )
    }

    fn rows(source: &str) -> Vec<Vec<String>> {
        run(&index(), &parse(source))
            .rows
            .into_iter()
            .map(|row| row.cells)
            .collect()
    }

    #[test]
    fn a_query_is_read_line_by_line() {
        let query = parse(
            "tag:project -tag:done\n  path:Work  \nshow: title, status ,due\nsort: due desc\nlimit: 5\n",
        );
        assert_eq!(query.search, "tag:project -tag:done path:Work");
        assert_eq!(query.show, vec!["title", "status", "due"]);
        assert_eq!(query.sort, Some(("due".to_owned(), true)));
        assert_eq!(query.limit, Some(5));

        assert_eq!(parse(""), Query::default());
        assert_eq!(
            parse("sort: title asc").sort,
            Some(("title".to_owned(), false))
        );
        assert_eq!(
            parse("sort: my column").sort,
            Some(("my column".to_owned(), false))
        );
        // A limit that is not a number is no limit.
        assert_eq!(parse("limit: lots").limit, None);
        // `tag:` and `path:` lines are search, not keywords.
        assert_eq!(parse("tag:a\npath:b").search, "tag:a path:b");
    }

    #[test]
    fn an_empty_query_lists_every_note_by_title() {
        assert_eq!(
            rows(""),
            vec![
                vec!["Home"],
                vec!["Launch"],
                vec!["Notes"],
                vec!["The Plan"]
            ]
        );
    }

    #[test]
    fn notes_are_chosen_with_the_search_syntax() {
        assert_eq!(
            rows("tag:project"),
            vec![vec!["Launch"], vec!["Notes"], vec!["The Plan"]]
        );
        assert_eq!(
            rows("tag:project -tag:done\npath:work"),
            vec![vec!["Notes"], vec!["The Plan"]]
        );
        assert_eq!(rows("budget"), vec![vec!["Home"], vec!["The Plan"]]);
        assert_eq!(rows("-path:Work"), vec![vec!["Home"]]);
        assert!(rows("tag:nothing").is_empty());
    }

    #[test]
    fn columns_come_from_the_note_and_its_properties() {
        assert_eq!(
            rows("path:Plan\nshow: title, name, path, folder, tags, status, Priority, missing"),
            vec![vec![
                "The Plan",
                "Plan",
                "Work/Plan.md",
                "Work",
                "project",
                "open",
                "2",
                ""
            ]]
        );
        let table = run(&index(), &parse("show: status"));
        assert_eq!(table.columns, vec!["status"]);
        assert_eq!(table.rows[0].path, VaultPath::new("Home.md").unwrap());
    }

    #[test]
    fn rows_sort_by_number_or_text_with_empty_values_last() {
        let names = |source: &str| -> Vec<String> {
            rows(source)
                .into_iter()
                .map(|mut row| row.remove(0))
                .collect()
        };
        // 1, 2, 10: as numbers, not as text. Home has no priority.
        assert_eq!(
            names("show: name\nsort: priority"),
            vec!["Notes", "Plan", "Launch", "Home"]
        );
        assert_eq!(
            names("show: name\nsort: priority desc"),
            vec!["Launch", "Plan", "Notes", "Home"]
        );
        assert_eq!(
            names("show: name\nsort: status"),
            vec!["Launch", "Plan", "Home", "Notes"]
        );
        assert_eq!(
            names("show: name\nsort: priority desc\nlimit: 2"),
            vec!["Launch", "Plan"]
        );
    }
}
