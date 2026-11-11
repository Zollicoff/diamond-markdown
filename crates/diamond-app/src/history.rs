//! Back and forward through the notes that were open.

use diamond_vault::VaultPath;

/// How many places are remembered.
const LIMIT: usize = 100;

/// A note that was open and where the cursor was in it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Place {
    /// The note.
    pub path: VaultPath,
    /// Byte offset of the cursor when the note was left.
    pub cursor: usize,
}

/// The notes visited in one window, oldest first, and which of them is open.
#[derive(Clone, Debug, Default)]
pub struct History {
    places: Vec<Place>,
    /// Index of the open note in `places`. Meaningless while it is empty.
    at: usize,
}

impl History {
    /// Records that `path` was opened by going somewhere new, as opposed to
    /// stepping back or forward. Everything ahead of the current place is
    /// forgotten, as in a browser.
    pub fn visit(&mut self, path: &VaultPath) {
        if self.current().is_some_and(|place| place.path == *path) {
            return;
        }
        self.places.truncate(self.at + 1);
        self.places.push(Place {
            path: path.clone(),
            cursor: 0,
        });
        if self.places.len() > LIMIT {
            self.places.remove(0);
        }
        self.at = self.places.len() - 1;
    }

    /// The place that is open.
    pub fn current(&self) -> Option<&Place> {
        self.places.get(self.at)
    }

    /// Notes where the cursor is in the open note, so coming back finds it.
    pub fn set_cursor(&mut self, cursor: usize) {
        if let Some(place) = self.places.get_mut(self.at) {
            place.cursor = cursor;
        }
    }

    /// Whether there is a place to go back to.
    pub fn can_go_back(&self) -> bool {
        self.at > 0 && !self.places.is_empty()
    }

    /// Whether there is a place to go forward to.
    pub fn can_go_forward(&self) -> bool {
        self.at + 1 < self.places.len()
    }

    /// Steps back and returns the place now current.
    pub fn back(&mut self) -> Option<Place> {
        if !self.can_go_back() {
            return None;
        }
        self.at -= 1;
        self.current().cloned()
    }

    /// Steps forward and returns the place now current.
    pub fn forward(&mut self) -> Option<Place> {
        if !self.can_go_forward() {
            return None;
        }
        self.at += 1;
        self.current().cloned()
    }

    /// Follows a rename or move of a note, or of a folder with notes in it.
    pub fn renamed(&mut self, from: &VaultPath, to: &VaultPath) {
        let under = format!("{}/", from.as_str());
        for place in &mut self.places {
            if place.path == *from {
                place.path = to.clone();
            } else if let Some(rest) = place.path.as_str().strip_prefix(&under)
                && let Ok(moved) = to.join(rest)
            {
                place.path = moved;
            }
        }
    }

    /// Forgets a note, or every note in a folder, that no longer exists.
    /// The current place stays the same note when it survives, and otherwise
    /// becomes the nearest earlier one.
    pub fn removed(&mut self, path: &VaultPath) {
        let under = format!("{}/", path.as_str());
        self.retain(|_, place| place.path != *path && !place.path.as_str().starts_with(&under));
    }

    /// Forgets every place whose note is gone, according to `exists`, so
    /// stepping back or forward does not stop on it. The open note stays.
    pub fn prune(&mut self, exists: impl Fn(&VaultPath) -> bool) {
        let open = self.at;
        self.retain(|index, place| index == open || exists(&place.path));
    }

    /// Keeps the places `keep` accepts, given each one's position.
    fn retain(&mut self, keep: impl Fn(usize, &Place) -> bool) {
        let mut kept: Vec<Place> = Vec::with_capacity(self.places.len());
        let mut at = 0;
        for (index, place) in std::mem::take(&mut self.places).into_iter().enumerate() {
            if !keep(index, &place) {
                continue;
            }
            // Dropping a place can leave the same note twice in a row.
            if kept.last().is_none_or(|last| last.path != place.path) {
                kept.push(place);
            }
            if index <= self.at {
                at = kept.len() - 1;
            }
        }
        self.places = kept;
        self.at = at;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    fn visited(names: &[&str]) -> History {
        let mut history = History::default();
        for name in names {
            history.visit(&path(name));
        }
        history
    }

    fn current(history: &History) -> &str {
        history.current().map_or("", |place| place.path.as_str())
    }

    #[test]
    fn back_and_forward_walk_the_visited_notes() {
        let mut history = History::default();
        assert!(!history.can_go_back() && !history.can_go_forward());
        assert_eq!(history.back(), None);
        assert_eq!(history.forward(), None);

        let mut history = visited(&["A.md", "B.md", "C.md"]);
        assert!(history.can_go_back() && !history.can_go_forward());
        assert_eq!(history.back().unwrap().path, path("B.md"));
        assert_eq!(history.back().unwrap().path, path("A.md"));
        assert_eq!(history.back(), None);
        assert_eq!(history.forward().unwrap().path, path("B.md"));
        assert!(history.can_go_back() && history.can_go_forward());
    }

    #[test]
    fn visiting_somewhere_new_forgets_what_was_ahead() {
        let mut history = visited(&["A.md", "B.md", "C.md"]);
        history.back();
        history.back();
        history.visit(&path("D.md"));
        assert!(!history.can_go_forward());
        assert_eq!(history.back().unwrap().path, path("A.md"));
        assert_eq!(history.forward().unwrap().path, path("D.md"));
    }

    #[test]
    fn opening_the_open_note_again_adds_nothing() {
        let mut history = visited(&["A.md", "B.md", "B.md"]);
        assert_eq!(history.back().unwrap().path, path("A.md"));
        assert!(!history.can_go_back());
    }

    #[test]
    fn the_cursor_is_remembered_per_place() {
        let mut history = visited(&["A.md"]);
        history.set_cursor(42);
        history.visit(&path("B.md"));
        history.set_cursor(7);
        assert_eq!(
            history.back(),
            Some(Place {
                path: path("A.md"),
                cursor: 42
            })
        );
        assert_eq!(history.forward().unwrap().cursor, 7);
    }

    #[test]
    fn only_the_newest_places_are_kept() {
        let mut history = History::default();
        for number in 0..LIMIT + 20 {
            history.visit(&path(&format!("{number}.md")));
        }
        let mut steps = 0;
        while history.back().is_some() {
            steps += 1;
        }
        assert_eq!(steps, LIMIT - 1);
        assert_eq!(current(&history), "20.md");
    }

    #[test]
    fn renames_and_moves_are_followed() {
        let mut history = visited(&["A.md", "Old/B.md", "Old/Deep/C.md", "Older.md"]);
        history.renamed(&path("A.md"), &path("Renamed.md"));
        history.renamed(&path("Old"), &path("New"));
        assert_eq!(history.back().unwrap().path, path("New/Deep/C.md"));
        assert_eq!(history.back().unwrap().path, path("New/B.md"));
        assert_eq!(history.back().unwrap().path, path("Renamed.md"));
        // A name that merely starts the same is a different note.
        assert_eq!(history.forward().unwrap().path, path("New/B.md"));
        history.forward();
        assert_eq!(history.forward().unwrap().path, path("Older.md"));
    }

    #[test]
    fn removed_notes_are_forgotten_without_losing_the_place() {
        // The open note survives: it stays the open note.
        let mut history = visited(&["A.md", "B.md", "C.md", "D.md"]);
        history.back();
        history.removed(&path("B.md"));
        assert_eq!(current(&history), "C.md");
        assert_eq!(history.back().unwrap().path, path("A.md"));
        assert_eq!(history.forward().unwrap().path, path("C.md"));
        assert_eq!(history.forward().unwrap().path, path("D.md"));

        // The open note goes: the one before it becomes current.
        let mut history = visited(&["A.md", "Gone/B.md", "Gone/C.md", "D.md"]);
        history.back();
        history.removed(&path("Gone"));
        assert_eq!(current(&history), "A.md");
        assert_eq!(history.forward().unwrap().path, path("D.md"));

        // Removing the note between two visits to the same note leaves one.
        let mut history = visited(&["A.md", "B.md", "A.md"]);
        history.removed(&path("B.md"));
        assert_eq!(current(&history), "A.md");
        assert!(!history.can_go_back() && !history.can_go_forward());

        let mut history = visited(&["A.md"]);
        history.removed(&path("A.md"));
        assert_eq!(history.current(), None);
        assert!(!history.can_go_back());
    }

    #[test]
    fn pruning_steps_over_missing_notes_but_keeps_the_open_one() {
        let mut history = visited(&["A.md", "Gone.md", "Open.md", "AlsoGone.md", "D.md"]);
        history.back();
        history.back();
        // The open note is kept even if it is not in the vault any more.
        history.prune(|path| !path.as_str().contains("Gone") && path.as_str() != "Open.md");
        assert_eq!(current(&history), "Open.md");
        assert_eq!(history.forward().unwrap().path, path("D.md"));
        history.back();
        assert_eq!(history.back().unwrap().path, path("A.md"));
    }
}
