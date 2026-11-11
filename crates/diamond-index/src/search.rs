//! Full-text search across a vault.
//!
//! A query is a list of terms separated by spaces. A note matches when every
//! term matches, ignoring case:
//!
//! - `word` matches in the note's text or its name
//! - `"two words"` matches that exact phrase
//! - `tag:project` matches notes carrying that tag or one nested under it
//! - `path:Archive` matches notes whose path contains the text
//! - a leading `-` excludes: `-draft`, `-tag:done`
//!
//! Every search scans the text of all notes in parallel. The text is already
//! in memory in the index, so no file is read. There is no word index yet;
//! that comes when vaults outgrow a plain scan.

use diamond_vault::VaultPath;
use rayon::prelude::*;

use crate::VaultIndex;

/// How many matching lines are kept per note.
const LINES_PER_NOTE: usize = 3;
/// Longest excerpt kept for a matching line, in characters.
const EXCERPT_CHARS: usize = 160;

/// One line of a note that matched the query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LineMatch {
    /// Zero-based line number in the note.
    pub line: usize,
    /// The line's text, trimmed and shortened.
    pub excerpt: String,
}

/// A note that matched a search.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchHit {
    /// The note.
    pub path: VaultPath,
    /// The note's display title.
    pub title: String,
    /// How many times the text terms occur in the note.
    pub occurrences: usize,
    /// The first few matching lines. Empty when the note matched only on its
    /// name, tag or path.
    pub lines: Vec<LineMatch>,
}

#[derive(Debug, PartialEq, Eq)]
enum Test {
    Text(String),
    Tag(String),
    Path(String),
}

#[derive(Debug, PartialEq, Eq)]
struct Term {
    test: Test,
    exclude: bool,
}

/// Splits a query into terms. Text inside double quotes stays together.
fn parse(query: &str) -> Vec<Term> {
    let mut terms = Vec::new();
    let mut rest = query.trim_start();
    while !rest.is_empty() {
        let exclude = rest.starts_with('-') && rest.len() > 1;
        if exclude {
            rest = &rest[1..];
        }
        let (kind, after_kind) = if let Some(after) = strip_prefix_ignore_case(rest, "tag:") {
            (1, after)
        } else if let Some(after) = strip_prefix_ignore_case(rest, "path:") {
            (2, after)
        } else {
            (0, rest)
        };

        let (value, remaining) = match after_kind.strip_prefix('"') {
            Some(quoted) => match quoted.find('"') {
                Some(end) => (&quoted[..end], &quoted[end + 1..]),
                None => (quoted, ""),
            },
            None => {
                let end = after_kind
                    .find(char::is_whitespace)
                    .unwrap_or(after_kind.len());
                (&after_kind[..end], &after_kind[end..])
            }
        };
        rest = remaining.trim_start();

        let value = value.trim().to_lowercase();
        if value.is_empty() {
            continue;
        }
        let test = match kind {
            1 => Test::Tag(value.trim_start_matches('#').to_owned()),
            2 => Test::Path(value),
            _ => Test::Text(value),
        };
        terms.push(Term { test, exclude });
    }
    terms
}

fn strip_prefix_ignore_case<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    let head = text.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix)
        .then(|| &text[prefix.len()..])
}

/// Searches every note in the index. Returns at most `limit` hits, best
/// first: notes whose name matches, then by how often the terms occur.
pub fn search(index: &VaultIndex, query: &str, limit: usize) -> Vec<SearchHit> {
    let terms = parse(query);
    if terms.iter().all(|term| term.exclude) {
        // Nothing to look for: an empty or exclude-only query matches nothing.
        return Vec::new();
    }
    let needs_text = terms.iter().any(|term| matches!(term.test, Test::Text(_)));

    let mut hits: Vec<(bool, SearchHit)> = index
        .notes()
        .par_iter()
        .filter_map(|note| {
            let path_lower = note.path.as_str().to_lowercase();
            let name_lower = note.path.stem().to_lowercase();
            let tags: Vec<String> = note
                .meta
                .all_tags()
                .iter()
                .map(|tag| tag.to_lowercase())
                .collect();

            // Decide the tests that need no file read first.
            for term in &terms {
                let matched = match &term.test {
                    Test::Tag(tag) => tags
                        .iter()
                        .any(|have| have == tag || have.starts_with(&format!("{tag}/"))),
                    Test::Path(part) => path_lower.contains(part),
                    Test::Text(_) => continue,
                };
                if matched == term.exclude {
                    return None;
                }
            }

            let mut occurrences = 0;
            let mut lines = Vec::new();
            let mut name_matches_all = needs_text;
            if needs_text {
                let text = note.text.as_str();
                let mut lowered = None;
                let mut wanted: Vec<&str> = Vec::new();
                for term in &terms {
                    let Test::Text(word) = &term.test else {
                        continue;
                    };
                    let in_name = name_lower.contains(word.as_str());
                    let in_text = count_ignoring_case(text, word, &mut lowered);
                    if term.exclude {
                        if in_name || in_text > 0 {
                            return None;
                        }
                        continue;
                    }
                    if !in_name && in_text == 0 {
                        return None;
                    }
                    name_matches_all &= in_name;
                    occurrences += in_text;
                    wanted.push(word);
                }
                for (number, line) in text.lines().enumerate() {
                    if lines.len() == LINES_PER_NOTE {
                        break;
                    }
                    let line_lower = line.to_lowercase();
                    if wanted.iter().any(|word| line_lower.contains(word)) {
                        lines.push(LineMatch {
                            line: number,
                            excerpt: excerpt(line),
                        });
                    }
                }
            }

            Some((
                name_matches_all,
                SearchHit {
                    path: note.path.clone(),
                    title: note.title().to_owned(),
                    occurrences,
                    lines,
                },
            ))
        })
        .collect();

    hits.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then(b.1.occurrences.cmp(&a.1.occurrences))
            .then_with(|| a.1.path.cmp(&b.1.path))
    });
    hits.truncate(limit);
    hits.into_iter().map(|(_, hit)| hit).collect()
}

/// Counts occurrences of `word`, which is already lowercase, in `text`
/// without regard to case.
///
/// Most queries are plain ASCII, and for those the text is scanned as it is,
/// with no lowercased copy made. That copy is what a search across a large
/// vault would otherwise spend most of its time on. Other queries fall back
/// to a lowercased copy, made once per note and kept in `lowered`.
fn count_ignoring_case(text: &str, word: &str, lowered: &mut Option<String>) -> usize {
    let needle = word.as_bytes();
    let Some((&first, rest)) = needle.split_first() else {
        return 0;
    };
    if !word.is_ascii() {
        let lowered = lowered.get_or_insert_with(|| text.to_lowercase());
        return lowered.matches(word).count();
    }

    let haystack = text.as_bytes();
    let mut count = 0;
    let mut from = 0;
    while let Some(found) = memchr::memchr2(first, first.to_ascii_uppercase(), &haystack[from..]) {
        let start = from + found;
        let end = start + needle.len();
        if end <= haystack.len() && haystack[start + 1..end].eq_ignore_ascii_case(rest) {
            count += 1;
            from = end;
        } else {
            from = start + 1;
        }
    }
    count
}

fn excerpt(line: &str) -> String {
    let trimmed = line.trim();
    match trimmed.char_indices().nth(EXCERPT_CHARS) {
        Some((end, _)) => format!("{}…", &trimmed[..end]),
        None => trimmed.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> VaultIndex {
        VaultIndex::from_sources(
            files
                .iter()
                .map(|(path, contents)| (VaultPath::new(path).unwrap(), *contents)),
        )
    }

    fn paths(index: &VaultIndex, query: &str) -> Vec<String> {
        search(index, query, 50)
            .into_iter()
            .map(|hit| hit.path.to_string())
            .collect()
    }

    #[test]
    fn parses_terms_phrases_filters_and_exclusions() {
        assert_eq!(
            parse(r#"Budget "next quarter" tag:#Work PATH:archive -draft -tag:done  "#),
            vec![
                Term {
                    test: Test::Text("budget".into()),
                    exclude: false
                },
                Term {
                    test: Test::Text("next quarter".into()),
                    exclude: false
                },
                Term {
                    test: Test::Tag("work".into()),
                    exclude: false
                },
                Term {
                    test: Test::Path("archive".into()),
                    exclude: false
                },
                Term {
                    test: Test::Text("draft".into()),
                    exclude: true
                },
                Term {
                    test: Test::Tag("done".into()),
                    exclude: true
                },
            ]
        );
        assert_eq!(
            parse(r#""unclosed phrase"#),
            vec![Term {
                test: Test::Text("unclosed phrase".into()),
                exclude: false
            }]
        );
        assert!(parse("   ").is_empty());
        assert_eq!(
            parse("-"),
            vec![Term {
                test: Test::Text("-".into()),
                exclude: false
            }]
        );
    }

    #[test]
    fn every_term_must_match_and_case_is_ignored() {
        let index = vault(&[
            (
                "A.md",
                "The Budget for next quarter is tight.\nBudget again.\n",
            ),
            ("B.md", "budget only\n"),
            ("C.md", "quarter only\n"),
        ]);
        assert_eq!(paths(&index, "BUDGET quarter"), vec!["A.md"]);
        assert_eq!(paths(&index, "budget"), vec!["A.md", "B.md"]);
        assert_eq!(paths(&index, r#""next quarter""#), vec!["A.md"]);
        assert_eq!(paths(&index, r#""quarter next""#), Vec::<String>::new());
        assert!(paths(&index, "").is_empty());
        assert!(paths(&index, "-budget").is_empty());
    }

    #[test]
    fn reports_matching_lines_and_counts() {
        let index = vault(&[(
            "Note.md",
            "# Title\n\nfirst apple here\nnothing\n  second Apple line  \nthird apple\nfourth apple\n",
        )]);
        let hits = search(&index, "apple", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].occurrences, 4);
        assert_eq!(
            hits[0].lines,
            vec![
                LineMatch {
                    line: 2,
                    excerpt: "first apple here".into()
                },
                LineMatch {
                    line: 4,
                    excerpt: "second Apple line".into()
                },
                LineMatch {
                    line: 5,
                    excerpt: "third apple".into()
                },
            ]
        );
    }

    #[test]
    fn name_matches_rank_first_then_occurrences() {
        let index = vault(&[
            ("Many.md", "plan plan plan\n"),
            ("Plan.md", "nothing relevant\n"),
            ("One.md", "a plan\n"),
        ]);
        assert_eq!(paths(&index, "plan"), vec!["Plan.md", "Many.md", "One.md"]);
        let hits = search(&index, "plan", 10);
        assert!(hits[0].lines.is_empty());
        assert_eq!(search(&index, "plan", 2).len(), 2);
    }

    #[test]
    fn tag_and_path_filters_and_exclusions() {
        let index = vault(&[
            ("Work/A.md", "#project/active report\n"),
            ("Work/B.md", "#project report draft\n"),
            ("Home/C.md", "#personal report\n"),
            ("Archive/D.md", "---\ntags: [project]\n---\nold\n"),
        ]);
        assert_eq!(
            paths(&index, "tag:project"),
            vec!["Archive/D.md", "Work/A.md", "Work/B.md"]
        );
        assert_eq!(paths(&index, "tag:project/active"), vec!["Work/A.md"]);
        assert_eq!(
            paths(&index, "tag:project path:work"),
            vec!["Work/A.md", "Work/B.md"]
        );
        assert_eq!(
            paths(&index, "report -draft"),
            vec!["Home/C.md", "Work/A.md"]
        );
        assert_eq!(paths(&index, "report -tag:project"), vec!["Home/C.md"]);
        assert_eq!(paths(&index, "report -path:work"), vec!["Home/C.md"]);
    }

    #[test]
    fn counting_matches_the_lowercase_copy_it_replaces() {
        let cases = [
            ("Apple apple APPLE pineapple", "apple"),
            ("aaaa", "aa"),
            ("no match here", "zebra"),
            ("ends with ne", "needle"),
            ("Ünïcödé text ünïcödé", "ünïcödé"),
            ("mixed Zürich zürich ZÜRICH", "zürich"),
            ("", "x"),
            ("x", ""),
        ];
        for (text, word) in cases {
            let expected = if word.is_empty() {
                0
            } else {
                text.to_lowercase().matches(word).count()
            };
            assert_eq!(
                count_ignoring_case(text, word, &mut None),
                expected,
                "{text:?} / {word:?}"
            );
        }
    }

    #[test]
    fn long_lines_and_other_scripts_are_cut_on_character_boundaries() {
        let long = format!("{} needle {}", "é".repeat(200), "x".repeat(50));
        let index = vault(&[("N.md", &long), ("J.md", "東京で会議 NEEDLE\n")]);
        let hits = search(&index, "needle", 10);
        assert_eq!(hits.len(), 2);
        let cut = hits.iter().find(|hit| hit.path.as_str() == "N.md").unwrap();
        assert_eq!(cut.lines[0].excerpt.chars().count(), EXCERPT_CHARS + 1);
        assert!(cut.lines[0].excerpt.ends_with('…'));
        assert_eq!(paths(&index, "会議"), vec!["J.md"]);
    }
}
