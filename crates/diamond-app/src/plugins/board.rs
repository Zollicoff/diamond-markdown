//! Boards: a note seen as columns of cards.
//!
//! Any note can be a board. Each second-level heading (`## Doing`) is a
//! column, and each list item directly under it is a card. The note stays
//! plain Markdown: moving a card moves its lines, and nothing else in the
//! note is touched.

use diamond_vault::VaultPath;
use gpui_kit::component::{
    ActiveTheme as _, Disableable as _, Sizable as _, StyledExt as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    label::Label,
    scroll::ScrollableElement as _,
    v_flex,
};
use gpui_kit::*;

use crate::plugin::{Command, Plugin};
use crate::workspace::Workspace;

/// A piece of a column, kept exactly as written.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Piece {
    /// A list item with any indented lines under it.
    Card(String),
    /// Anything else: blank lines, a paragraph.
    Text(String),
}

/// One column: a heading and what is under it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Column {
    /// The heading's text.
    pub title: String,
    /// The heading line as written.
    heading: String,
    pieces: Vec<Piece>,
}

impl Column {
    /// The cards' source, top to bottom.
    fn cards(&self) -> impl Iterator<Item = &String> {
        self.pieces.iter().filter_map(|piece| match piece {
            Piece::Card(card) => Some(card),
            Piece::Text(_) => None,
        })
    }

    /// What each card says: its first line without the bullet and the box.
    pub fn labels(&self) -> Vec<String> {
        self.cards().map(|card| label(card)).collect()
    }

    /// The position in `pieces` of the card numbered `card`.
    fn piece_of(&self, card: usize) -> Option<usize> {
        self.pieces
            .iter()
            .enumerate()
            .filter(|(_, piece)| matches!(piece, Piece::Card(_)))
            .nth(card)
            .map(|(position, _)| position)
    }

    /// Adds a card under the cards already there, or right under the
    /// heading when there are none.
    fn push(&mut self, mut card: String) {
        if !card.ends_with('\n') {
            card.push('\n');
        }
        let after_last_card = self
            .pieces
            .iter()
            .rposition(|piece| matches!(piece, Piece::Card(_)))
            .map(|position| position + 1);
        // Keep a blank line that closes the column where it is: after the
        // cards.
        let before_closing_blank = match self.pieces.last() {
            Some(Piece::Text(text)) if text.trim().is_empty() => self.pieces.len() - 1,
            _ => self.pieces.len(),
        };
        self.pieces.insert(
            after_last_card.unwrap_or(before_closing_blank),
            Piece::Card(card),
        );
    }
}

/// A card's first line without its bullet and task box.
fn label(card: &str) -> String {
    let line = card.lines().next().unwrap_or_default().trim_start();
    let line = line
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches(['-', '*', '+', '.', ')'])
        .trim_start();
    let line = ["[ ]", "[x]", "[X]"]
        .iter()
        .find_map(|task| line.strip_prefix(task))
        .unwrap_or(line);
    line.trim().to_owned()
}

/// Whether a line starts a list item at the left margin.
fn starts_card(line: &str) -> bool {
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    let after_number = &line[digits..];
    (digits > 0 && (after_number.starts_with(". ") || after_number.starts_with(") ")))
        || ["- ", "* ", "+ "]
            .iter()
            .any(|bullet| line.starts_with(bullet))
}

/// A note taken apart into columns.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board {
    /// Everything before the first column, as written.
    before: String,
    /// The columns, left to right.
    pub columns: Vec<Column>,
}

impl Board {
    /// Reads a note as a board. Every note can be read; one without
    /// second-level headings has no columns.
    pub fn parse(text: &str) -> Self {
        let mut board = Self {
            before: String::new(),
            columns: Vec::new(),
        };
        let mut in_code = false;
        for line in text.split_inclusive('\n') {
            if line.trim_start().starts_with("```") {
                in_code = !in_code;
            }
            if !in_code && line.starts_with("## ") {
                board.columns.push(Column {
                    title: line[3..].trim().trim_end_matches('#').trim().to_owned(),
                    heading: line.to_owned(),
                    pieces: Vec::new(),
                });
                continue;
            }
            let Some(column) = board.columns.last_mut() else {
                board.before.push_str(line);
                continue;
            };
            let indented = line.starts_with([' ', '\t']) && !line.trim().is_empty();
            match column.pieces.last_mut() {
                _ if !in_code && starts_card(line) => {
                    column.pieces.push(Piece::Card(line.to_owned()))
                }
                // Indented lines under a card are part of it.
                Some(Piece::Card(card)) if indented || in_code => card.push_str(line),
                Some(Piece::Text(text)) => text.push_str(line),
                _ => column.pieces.push(Piece::Text(line.to_owned())),
            }
        }
        board
    }

    /// Writes the board back as the note's text.
    pub fn write(&self) -> String {
        let mut text = self.before.clone();
        for column in &self.columns {
            text.push_str(&column.heading);
            for piece in &column.pieces {
                match piece {
                    Piece::Card(piece) | Piece::Text(piece) => text.push_str(piece),
                }
            }
        }
        text
    }

    /// Moves a card to the bottom of another column. Returns whether there
    /// was such a card and column.
    pub fn move_card(&mut self, column: usize, card: usize, to: usize) -> bool {
        if column == to || to >= self.columns.len() {
            return false;
        }
        let Some(position) = self
            .columns
            .get(column)
            .and_then(|column| column.piece_of(card))
        else {
            return false;
        };
        // A heading must start its own line, so the column the card leaves
        // and the one it joins both end with a newline.
        let last = self.columns.len() - 1;
        let Piece::Card(text) = self.columns[column].pieces.remove(position) else {
            return false;
        };
        self.columns[to].push(text);
        if to == last
            && let Some(Piece::Card(card) | Piece::Text(card)) =
                self.columns[column].pieces.last_mut()
            && !card.ends_with('\n')
        {
            card.push('\n');
        }
        true
    }

    /// Moves a card one place up or down within its column.
    pub fn shift_card(&mut self, column: usize, card: usize, down: bool) -> bool {
        let Some(column) = self.columns.get_mut(column) else {
            return false;
        };
        let other = if down { card + 1 } else { card.wrapping_sub(1) };
        let (Some(from), Some(to)) = (column.piece_of(card), column.piece_of(other)) else {
            return false;
        };
        column.pieces.swap(from, to);
        // The last card of a note may have no newline; after a swap the card
        // now above it needs one.
        let upper = from.min(to);
        if let Piece::Card(text) = &mut column.pieces[upper]
            && !text.ends_with('\n')
        {
            text.push('\n');
        }
        true
    }

    /// Adds a card with this text to the bottom of a column.
    pub fn add_card(&mut self, column: usize, text: &str) -> bool {
        let text = text.trim().replace('\n', " ");
        let Some(column) = self.columns.get_mut(column) else {
            return false;
        };
        if text.is_empty() {
            return false;
        }
        column.push(format!("- {text}\n"));
        true
    }
}

/// The boards plugin.
#[derive(Default)]
pub struct Boards;

impl Plugin for Boards {
    fn id(&self) -> &'static str {
        "boards"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "Show this note as a board",
            &["kanban", "columns", "cards"],
            |workspace, window, cx| {
                let Some(path) = workspace.current().cloned() else {
                    workspace.report("Open a note to see it as a board", cx);
                    return;
                };
                // The board is read from the note as saved.
                if !workspace.save_all(window, cx) {
                    return;
                }
                let title = format!("{} board", workspace.session().title(&path));
                workspace.open_view(
                    format!("board:{path}"),
                    title,
                    window,
                    cx,
                    |workspace, cx| {
                        let board = workspace.session().note_text(&path).map(Board::parse);
                        let handle = cx.entity();
                        cx.new(|cx| BoardView {
                            workspace: handle.downgrade(),
                            path: path.clone(),
                            board,
                            _watch: cx.observe(&handle, |this: &mut BoardView, workspace, cx| {
                                this.board = workspace
                                    .read(cx)
                                    .session()
                                    .note_text(&this.path)
                                    .map(Board::parse);
                                cx.notify();
                            }),
                        })
                    },
                );
            },
        )]
    }
}

/// A note's board, shown in a tab.
pub struct BoardView {
    workspace: WeakEntity<Workspace>,
    path: VaultPath,
    /// `None` once the note is gone.
    board: Option<Board>,
    _watch: Subscription,
}

impl BoardView {
    /// Changes the note through the window, so an open editor, the file
    /// and this view all end up the same.
    fn change(
        &self,
        window: &mut Window,
        cx: &mut Context<Self>,
        change: impl FnOnce(&mut Board) -> bool + 'static,
    ) {
        let Some(workspace) = self.workspace.upgrade() else {
            return;
        };
        let path = self.path.clone();
        workspace.update(cx, |workspace, cx| {
            workspace.rewrite_note(&path, window, cx, |text| {
                let mut board = Board::parse(text);
                change(&mut board).then(|| board.write())
            });
        });
    }
}

impl Render for BoardView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let (muted, border, card_background) =
            (theme.muted_foreground, theme.border, theme.sidebar);
        let Some(board) = &self.board else {
            return div()
                .p_4()
                .text_color(muted)
                .child("This note is no longer in the vault.")
                .into_any_element();
        };
        if board.columns.is_empty() {
            return div()
                .p_4()
                .text_color(muted)
                .child("No columns yet. Each \"## Heading\" in the note is a column, and each list item under it is a card.")
                .into_any_element();
        }
        let count = board.columns.len();
        let columns = board.columns.iter().enumerate().map(|(column_ix, column)| {
            let labels = column.labels();
            let cards = labels.len();
            let rendered = labels.into_iter().enumerate().map(|(card_ix, label)| {
                let id = column_ix * 10_000 + card_ix;
                let step = |name: &'static str,
                            glyph: &'static str,
                            enabled: bool,
                            change: fn(&mut Board, usize, usize) -> bool,
                            cx: &mut Context<Self>| {
                    Button::new((name, id))
                        .ghost()
                        .xsmall()
                        .label(glyph)
                        .disabled(!enabled)
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.change(window, cx, move |board| change(board, column_ix, card_ix));
                        }))
                };
                v_flex()
                    .p_2()
                    .gap_1()
                    .rounded(px(6.))
                    .border_1()
                    .border_color(border)
                    .bg(card_background)
                    .child(div().text_sm().child(label))
                    .child(
                        h_flex()
                            .gap_1()
                            .child(step(
                                "card-left",
                                "←",
                                column_ix > 0,
                                |board, column, card| board.move_card(column, card, column - 1),
                                cx,
                            ))
                            .child(step(
                                "card-up",
                                "↑",
                                card_ix > 0,
                                |board, column, card| board.shift_card(column, card, false),
                                cx,
                            ))
                            .child(step(
                                "card-down",
                                "↓",
                                card_ix + 1 < cards,
                                |board, column, card| board.shift_card(column, card, true),
                                cx,
                            ))
                            .child(step(
                                "card-right",
                                "→",
                                column_ix + 1 < count,
                                |board, column, card| board.move_card(column, card, column + 1),
                                cx,
                            )),
                    )
            });
            let title = column.title.clone();
            v_flex()
                .w(px(240.))
                .flex_shrink_0()
                .gap_2()
                .child(
                    h_flex()
                        .justify_between()
                        .child(Label::new(column.title.clone()).font_semibold())
                        .child(div().text_sm().text_color(muted).child(cards.to_string())),
                )
                .children(rendered)
                .child(
                    Button::new(("add-card", column_ix))
                        .ghost()
                        .xsmall()
                        .label("+ Add a card")
                        .on_click(cx.listener(move |this, _, window, cx| {
                            let Some(workspace) = this.workspace.upgrade() else {
                                return;
                            };
                            let path = this.path.clone();
                            let title = format!("Add a card to {title}");
                            workspace.update(cx, |workspace, cx| {
                                workspace.prompt(
                                    title,
                                    "Enter to add.",
                                    "",
                                    window,
                                    cx,
                                    move |workspace, typed, window, cx| {
                                        workspace.rewrite_note(&path, window, cx, |text| {
                                            let mut board = Board::parse(text);
                                            board.add_card(column_ix, &typed).then(|| board.write())
                                        });
                                    },
                                );
                            });
                        })),
                )
        });
        h_flex()
            .id("board-view")
            .size_full()
            .p_4()
            .gap_4()
            .items_start()
            .overflow_x_scrollbar()
            .children(columns)
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use super::Board;

    const NOTE: &str = "---\ntitle: Launch\n---\n# Launch\n\nIntro text.\n\n## To do\n\n- [ ] Write copy\n  with a second line\n- Book venue\n\n## Doing\n\nA note about this column.\n\n1. Design logo\n\n## Done\n";

    fn labels(board: &Board) -> Vec<(String, Vec<String>)> {
        board
            .columns
            .iter()
            .map(|column| (column.title.clone(), column.labels()))
            .collect()
    }

    fn column(title: &str, cards: &[&str]) -> (String, Vec<String>) {
        (
            title.to_owned(),
            cards.iter().map(|card| (*card).to_owned()).collect(),
        )
    }

    #[test]
    fn a_note_is_read_as_columns_of_cards_and_written_back_unchanged() {
        let board = Board::parse(NOTE);
        assert_eq!(
            labels(&board),
            vec![
                column("To do", &["Write copy", "Book venue"]),
                column("Doing", &["Design logo"]),
                column("Done", &[]),
            ]
        );
        assert_eq!(board.write(), NOTE);
        // Any note reads and writes back, board or not.
        for text in [
            "",
            "no headings\n- item\n",
            "## Only\n",
            "## A\n- x",
            "```\n## not a column\n- nor a card\n```\n",
        ] {
            assert_eq!(Board::parse(text).write(), text, "{text:?}");
        }
        assert!(
            Board::parse("```\n## not a column\n```\n")
                .columns
                .is_empty()
        );
    }

    #[test]
    fn moving_a_card_moves_only_its_lines() {
        let mut board = Board::parse(NOTE);
        assert!(board.move_card(0, 0, 1));
        assert_eq!(
            board.write(),
            "---\ntitle: Launch\n---\n# Launch\n\nIntro text.\n\n## To do\n\n- Book venue\n\n## Doing\n\nA note about this column.\n\n1. Design logo\n- [ ] Write copy\n  with a second line\n\n## Done\n"
        );
        // Into an empty column, and back out again.
        assert!(board.move_card(1, 0, 2));
        assert_eq!(labels(&board)[2], column("Done", &["Design logo"]));
        assert!(board.write().ends_with("## Done\n1. Design logo\n"));
        assert!(board.move_card(2, 0, 0));
        assert_eq!(
            labels(&board)[0],
            column("To do", &["Book venue", "Design logo"])
        );

        // Nothing to move: no such card, no such column, same column.
        let before = board.write();
        assert!(!board.move_card(0, 9, 1));
        assert!(!board.move_card(0, 0, 9));
        assert!(!board.move_card(0, 0, 0));
        assert_eq!(board.write(), before);
    }

    #[test]
    fn cards_shift_within_a_column_and_can_be_added() {
        let mut board = Board::parse(NOTE);
        assert!(board.shift_card(0, 0, true));
        assert_eq!(
            labels(&board)[0],
            column("To do", &["Book venue", "Write copy"])
        );
        assert!(board.shift_card(0, 1, false));
        assert_eq!(board.write(), NOTE);
        assert!(!board.shift_card(0, 0, false));
        assert!(!board.shift_card(0, 1, true));

        assert!(board.add_card(2, "  Ship it  "));
        assert!(board.add_card(0, "Another"));
        assert!(!board.add_card(0, "   "));
        assert!(!board.add_card(9, "nowhere"));
        assert_eq!(labels(&board)[2], column("Done", &["Ship it"]));
        assert!(
            board
                .write()
                .contains("- Book venue\n- Another\n\n## Doing")
        );
        assert!(board.write().ends_with("## Done\n- Ship it\n"));
    }

    #[test]
    fn a_last_card_without_a_newline_can_still_move() {
        let mut board = Board::parse("## A\n- one\n## B\n- two");
        assert!(board.move_card(1, 0, 0));
        assert_eq!(board.write(), "## A\n- one\n- two\n## B\n");
        let mut board = Board::parse("## A\n- one\n- two");
        assert!(board.shift_card(0, 0, true));
        // The card that is now last keeps the newline it had.
        assert_eq!(board.write(), "## A\n- two\n- one\n");
    }
}
