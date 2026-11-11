//! The core plugins: features compiled into the app, each in its own module
//! and each using only the plugin interface.

pub mod board;
pub mod bookmarks;
pub mod calendar;
pub mod canvas;
pub mod git;
pub mod graph;
pub mod preview;
pub mod properties;
pub mod tables;
pub mod tasks;

use crate::plugin::Plugin;

/// Every core plugin, in the order their commands and panel sections appear.
pub fn core() -> Vec<Box<dyn Plugin>> {
    vec![
        Box::new(properties::Properties),
        Box::new(bookmarks::Bookmarks::default()),
        Box::new(tasks::Tasks),
        Box::new(calendar::Calendar),
        Box::new(preview::Preview),
        Box::new(graph::Graph),
        Box::new(board::Boards),
        Box::new(canvas::Canvases),
        Box::new(tables::Tables),
        Box::new(git::Git),
    ]
}

#[cfg(test)]
mod tests {
    use diamond_vault::VaultPath;

    use super::{board::Board, canvas::Canvas};
    use crate::session::Session;

    /// The vault in the repository is what a newcomer opens first, so every
    /// feature it points at has to work on it.
    #[test]
    fn the_sample_vault_shows_each_feature_without_loose_ends() {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample-vault");
        let (mut session, report) = Session::open(root).unwrap();
        assert!(report.skipped.is_empty(), "{:?}", report.skipped);
        assert_eq!(session.settings_problem(), None);
        let path = |raw: &str| VaultPath::new(raw).unwrap();

        // Every link leads somewhere.
        let graph = session.graph();
        for (note, _) in &graph.notes {
            assert_eq!(session.unresolved_link_count(note), 0, "{note}");
        }
        assert!(graph.links.len() >= 5, "{:?}", graph.links);

        // Templates, and tasks with due dates.
        let templates: Vec<String> = session
            .templates()
            .into_iter()
            .map(|(_, name)| name)
            .collect();
        assert_eq!(templates, vec!["Daily", "Meeting"]);
        let tasks = session.tasks();
        assert!(tasks.iter().any(|task| task.done) && tasks.iter().any(|task| !task.done));
        let dated = tasks
            .iter()
            .filter(|task| super::tasks::due_date(&task.text).is_some())
            .count();
        assert_eq!(dated, 3);

        // The query computes a table that links to both projects.
        let overview = path("Projects/Overview.md");
        let rendered = session.reading_markdown(&overview, session.note_text(&overview).unwrap());
        assert!(
            rendered.contains("| [Launch](diamond://note/Projects/Launch) | active | 2026-12-01 |"),
            "{rendered}"
        );
        assert!(rendered.contains("| [Budget](diamond://note/Projects/Budget) | draft |  |"));

        // The project note reads as a board, and the properties are there.
        let launch = path("Projects/Launch.md");
        let board = Board::parse(session.note_text(&launch).unwrap());
        let columns: Vec<&str> = board
            .columns
            .iter()
            .map(|column| column.title.as_str())
            .collect();
        assert_eq!(columns, vec!["To do", "Doing", "Done"]);
        assert_eq!(session.properties(&launch).len(), 4);

        // The canvas reads, and each note card leads to a note.
        let map = path("Map.canvas.toml");
        let canvas = Canvas::parse(&session.read_file(&map).unwrap()).unwrap();
        assert_eq!((canvas.cards.len(), canvas.links.len()), (4, 3));
        for note in canvas.cards.iter().filter_map(|card| card.note.as_deref()) {
            assert!(
                matches!(
                    session.follow_target(&map, note),
                    Ok(crate::session::Follow::Note { created: false, .. })
                ),
                "{note}"
            );
        }
    }
}
