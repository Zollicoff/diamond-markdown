//! Fuzzy matching for the quick switcher.
//!
//! A query matches a candidate when its characters appear in the candidate
//! in order, ignoring case: `qpl` matches `Quarterly Plan`. The score ranks
//! matches the way people expect: runs of adjacent characters and matches at
//! the start of a word beat scattered ones, and short names beat long ones.

/// Points for each matched character.
const MATCH: i32 = 16;
/// Extra when a matched character directly follows the previous match.
const ADJACENT: i32 = 12;
/// Extra when a matched character starts a word.
const WORD_START: i32 = 10;
/// Extra when the candidate starts with the query.
const PREFIX: i32 = 30;
/// Extra when the candidate is the query.
const EXACT: i32 = 40;

/// Scores `query` against `candidate`, or returns `None` when it does not
/// match. Higher is better. Words in the query separated by spaces may match
/// in any order, and every word must match.
pub fn score(query: &str, candidate: &str) -> Option<i32> {
    let candidate: Vec<char> = candidate.chars().collect();
    let lowered: Vec<char> = candidate.iter().flat_map(|c| c.to_lowercase()).collect();
    // Lowercasing can change the character count for a few scripts; fall
    // back to comparing the lowered text with itself in that case.
    let original = if lowered.len() == candidate.len() {
        &candidate
    } else {
        &lowered
    };

    let mut total = 0;
    let mut words = 0;
    for word in query.split_whitespace() {
        let word: Vec<char> = word.chars().flat_map(|c| c.to_lowercase()).collect();
        total += score_word(&word, &lowered, original)?;
        words += 1;
    }
    if words == 0 {
        return Some(0);
    }

    let whole: Vec<char> = query
        .trim()
        .chars()
        .flat_map(|c| c.to_lowercase())
        .collect();
    if lowered == whole {
        total += EXACT;
    } else if lowered.starts_with(&whole) {
        total += PREFIX;
    }
    // Among equal matches, prefer the shorter name.
    Some(total - (lowered.len() as i32) / 4)
}

/// The best score for one query word over every way its characters can be
/// placed in the candidate.
///
/// `best[j]` is the best score for the characters matched so far with the
/// latest one at candidate position `j`. A greedy left-to-right match is not
/// enough: for `mn` in `Meeting Notes` it would take the `n` in "Meeting"
/// and miss the word start in "Notes".
fn score_word(word: &[char], lowered: &[char], original: &[char]) -> Option<i32> {
    let (first, rest) = word.split_first()?;
    let landing = |index: usize| {
        MATCH
            + if starts_word(original, index) {
                WORD_START
            } else {
                0
            }
    };

    let mut best: Vec<Option<i32>> = lowered
        .iter()
        .enumerate()
        .map(|(index, c)| (c == first).then(|| landing(index)))
        .collect();
    for wanted in rest {
        let mut next = vec![None; lowered.len()];
        for (index, c) in lowered.iter().enumerate() {
            if c != wanted {
                continue;
            }
            let reached = (0..index)
                .filter_map(|previous| {
                    let step = if previous + 1 == index {
                        ADJACENT
                    } else {
                        // A gap costs a little, so tighter matches win.
                        -(((index - previous - 1) as i32).min(8))
                    };
                    Some(best[previous]? + step)
                })
                .max();
            next[index] = reached.map(|score| score + landing(index));
        }
        best = next;
    }
    best.into_iter().flatten().max()
}

fn starts_word(text: &[char], index: usize) -> bool {
    let Some(before) = index.checked_sub(1).map(|before| text[before]) else {
        return true;
    };
    !before.is_alphanumeric() || (before.is_lowercase() && text[index].is_uppercase())
}

#[cfg(test)]
mod tests {
    use super::score;

    fn best<'a>(query: &str, candidates: &[&'a str]) -> Vec<&'a str> {
        let mut scored: Vec<(i32, &str)> = candidates
            .iter()
            .filter_map(|candidate| Some((score(query, candidate)?, *candidate)))
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(b.1)));
        scored.into_iter().map(|(_, candidate)| candidate).collect()
    }

    #[test]
    fn requires_every_character_in_order() {
        assert!(score("qpl", "Quarterly Plan").is_some());
        assert!(score("plq", "Quarterly Plan").is_none());
        assert!(score("xyz", "Quarterly Plan").is_none());
        assert!(score("", "Anything").is_some());
        assert!(score("a", "").is_none());
    }

    #[test]
    fn ignores_case_and_handles_other_scripts() {
        assert!(score("CAFÉ", "café notes").is_some());
        assert!(score("東京", "旅行 東京 2026").is_some());
        assert!(score("straße", "Straße").is_some());
    }

    #[test]
    fn ranks_exact_then_prefix_then_word_starts_then_scattered() {
        assert_eq!(
            best(
                "plan",
                &[
                    "Explanation",
                    "Plan",
                    "Planning",
                    "Quarterly Plan",
                    "Apple Land"
                ]
            ),
            vec![
                "Plan",
                "Planning",
                "Quarterly Plan",
                "Explanation",
                "Apple Land"
            ]
        );
    }

    #[test]
    fn initials_beat_letters_buried_in_words() {
        assert_eq!(
            best("mn", &["Human Nature", "Meeting Notes", "Moon"]),
            vec!["Meeting Notes", "Moon", "Human Nature"]
        );
        assert_eq!(
            best("dn", &["Daily Notes", "Sudden"]),
            vec!["Daily Notes", "Sudden"]
        );
    }

    #[test]
    fn query_words_match_in_any_order_and_all_must_match() {
        assert!(score("notes meeting", "Meeting Notes").is_some());
        assert!(score("notes budget", "Meeting Notes").is_none());
    }

    #[test]
    fn shorter_names_win_ties() {
        assert_eq!(
            best("note", &["Note 10", "Note 1"]),
            vec!["Note 1", "Note 10"]
        );
    }
}
