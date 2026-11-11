//! Canvas: cards laid out freely on a surface, with lines between them.
//!
//! A canvas is a file of its own, named `Something.canvas.toml`, in a
//! format of Diamond's own that can be read and fixed by hand:
//!
//! ```toml
//! [[card]]
//! id = 1
//! x = 40.0
//! y = 60.0
//! text = "An idea"
//!
//! [[card]]
//! id = 2
//! x = 320.0
//! y = 60.0
//! note = "Projects/Plan.md"
//!
//! [[link]]
//! from = 1
//! to = 2
//! ```
//!
//! A card holds text or stands for a note. Cards are dragged by their top
//! strip; a click on a note card's name opens the note.

use std::rc::Rc;

use diamond_vault::VaultPath;
use gpui_kit::component::{
    ActiveTheme as _, Sizable as _, StyledExt as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    label::Label,
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use serde::{Deserialize, Serialize};

use crate::plugin::{Command, Plugin, Run};
use crate::workspace::Workspace;

/// How a canvas file's name ends.
const SUFFIX: &str = ".canvas.toml";

const CARD_WIDTH: f32 = 220.;
const CARD_HEIGHT: f32 = 96.;

/// One card.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct Card {
    /// Names the card within its canvas, for links.
    pub id: u32,
    /// Distance of its left edge from the canvas's left edge.
    pub x: f32,
    /// Distance of its top edge from the canvas's top edge.
    pub y: f32,
    /// What the card says, when it is a text card.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub text: String,
    /// The note the card stands for, when it is a note card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// A line between two cards.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Link {
    /// The card the line starts at.
    pub from: u32,
    /// The card it ends at.
    pub to: u32,
}

/// A canvas: its cards and the lines between them.
#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
pub struct Canvas {
    /// The cards, in the order they were added. Later cards are drawn over
    /// earlier ones.
    #[serde(default, rename = "card", skip_serializing_if = "Vec::is_empty")]
    pub cards: Vec<Card>,
    /// The lines.
    #[serde(default, rename = "link", skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<Link>,
}

impl Canvas {
    /// Reads a canvas file. An empty file is an empty canvas.
    pub fn parse(text: &str) -> Result<Self, String> {
        toml::from_str(text).map_err(|error| error.message().to_owned())
    }

    /// Writes the canvas as its file's text.
    pub fn write(&self) -> String {
        // The types here always serialize; an empty file is the safe answer
        // if that ever stops being true.
        toml::to_string(self).unwrap_or_default()
    }

    /// Adds a card and returns its id. `content` written as `[[Note]]`
    /// makes a card for that note; anything else is the card's text.
    pub fn add(&mut self, content: &str, x: f32, y: f32) -> Option<u32> {
        let content = content.trim();
        if content.is_empty() {
            return None;
        }
        let id = self.cards.iter().map(|card| card.id).max().unwrap_or(0) + 1;
        let note = content
            .strip_prefix("[[")
            .and_then(|rest| rest.strip_suffix("]]"))
            .map(|note| note.trim().to_owned())
            .filter(|note| !note.is_empty());
        self.cards.push(Card {
            id,
            x,
            y,
            text: if note.is_some() {
                String::new()
            } else {
                content.to_owned()
            },
            note,
        });
        Some(id)
    }

    /// A free spot for a new card: to the right of the last one, starting a
    /// new row when the row is long.
    pub fn next_spot(&self) -> (f32, f32) {
        match self.cards.last() {
            None => (40., 40.),
            Some(last) if last.x > 900. => (40., last.y + CARD_HEIGHT + 40.),
            Some(last) => (last.x + CARD_WIDTH + 40., last.y),
        }
    }

    /// Moves a card. Cards cannot leave the canvas up or to the left.
    pub fn place(&mut self, id: u32, x: f32, y: f32) -> bool {
        match self.cards.iter_mut().find(|card| card.id == id) {
            Some(card) => {
                (card.x, card.y) = (x.max(0.), y.max(0.));
                true
            }
            None => false,
        }
    }

    /// Removes a card and every line that touched it.
    pub fn remove(&mut self, id: u32) -> bool {
        let before = self.cards.len();
        self.cards.retain(|card| card.id != id);
        self.links.retain(|link| link.from != id && link.to != id);
        self.cards.len() != before
    }

    /// Draws a line between two cards, or removes the one that is there.
    /// Returns whether the canvas changed.
    pub fn toggle_link(&mut self, from: u32, to: u32) -> bool {
        let has = |id| self.cards.iter().any(|card| card.id == id);
        if from == to || !has(from) || !has(to) {
            return false;
        }
        let joins =
            |link: &Link| (link.from, link.to) == (from, to) || (link.from, link.to) == (to, from);
        if self.links.iter().any(joins) {
            self.links.retain(|link| !joins(link));
        } else {
            self.links.push(Link { from, to });
        }
        true
    }

    /// The middle of a card, for the end of a line.
    fn middle(&self, id: u32) -> Option<(f32, f32)> {
        self.cards
            .iter()
            .find(|card| card.id == id)
            .map(|card| (card.x + CARD_WIDTH / 2., card.y + CARD_HEIGHT / 2.))
    }
}

/// The canvas plugin.
#[derive(Default)]
pub struct Canvases;

/// Shows a canvas file in a tab.
fn show(
    workspace: &mut Workspace,
    path: &VaultPath,
    window: &mut Window,
    cx: &mut Context<Workspace>,
) {
    let canvas = match workspace.session().read_file(path) {
        Ok(text) => Canvas::parse(&text),
        Err(problem) => Err(problem),
    };
    let canvas = match canvas {
        Ok(canvas) => canvas,
        Err(problem) => {
            workspace.report(format!("{path} cannot be shown: {problem}"), cx);
            return;
        }
    };
    let name = path
        .file_name()
        .strip_suffix(SUFFIX)
        .unwrap_or(path.file_name())
        .to_owned();
    let path = path.clone();
    workspace.open_view(format!("canvas:{path}"), name, window, cx, |_, cx| {
        let handle = cx.entity().downgrade();
        cx.new(|_| CanvasView {
            workspace: handle,
            path,
            canvas,
            drag: None,
            linking: None,
        })
    });
}

impl Plugin for Canvases {
    fn id(&self) -> &'static str {
        "canvas"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "New canvas",
            &["board", "whiteboard", "cards", "map", "diagram"],
            |workspace, window, cx| match workspace.new_file("Untitled.canvas", "toml", "", cx) {
                Ok(path) => show(workspace, &path, window, cx),
                Err(problem) => workspace.report(problem, cx),
            },
        )]
    }

    fn opener(&self, path: &VaultPath) -> Option<Run> {
        if !path.file_name().ends_with(SUFFIX) {
            return None;
        }
        let path = path.clone();
        Some(Rc::new(move |workspace, window, cx| {
            show(workspace, &path, window, cx);
        }))
    }
}

/// A card being dragged: which one, and where it and the pointer started.
struct Drag {
    card: u32,
    card_start: (f32, f32),
    pointer_start: Point<Pixels>,
}

/// A canvas, shown in a tab.
pub struct CanvasView {
    workspace: WeakEntity<Workspace>,
    path: VaultPath,
    canvas: Canvas,
    drag: Option<Drag>,
    /// The card a line is being drawn from, until its other end is chosen.
    linking: Option<u32>,
}

impl CanvasView {
    /// Writes the canvas to its file, reporting a failure in the window.
    fn store(&self, cx: &mut Context<Self>) {
        let Some(workspace) = self.workspace.upgrade() else {
            return;
        };
        let (path, text) = (self.path.clone(), self.canvas.write());
        workspace.update(cx, |workspace, cx| {
            if let Err(problem) = workspace.session().write_file(&path, &text) {
                workspace.report(problem, cx);
            }
        });
    }

    /// Handles a click on a card's link button: the first click picks one
    /// end of a line, the second the other.
    fn link(&mut self, card: u32, cx: &mut Context<Self>) {
        match self.linking.take() {
            Some(from) if self.canvas.toggle_link(from, card) => self.store(cx),
            Some(_) => {}
            None => self.linking = Some(card),
        }
        cx.notify();
    }
}

impl Render for CanvasView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let (muted, border, line, accent, surface) = (
            theme.muted_foreground,
            theme.border,
            theme.muted_foreground,
            theme.primary,
            theme.sidebar,
        );

        let ends: Vec<((f32, f32), (f32, f32))> = self
            .canvas
            .links
            .iter()
            .filter_map(|link| Some((self.canvas.middle(link.from)?, self.canvas.middle(link.to)?)))
            .collect();
        let lines = canvas(
            |_, _, _| {},
            move |bounds, (), window, _| {
                let point = |(x, y): (f32, f32)| {
                    gpui_kit::point(bounds.origin.x + px(x), bounds.origin.y + px(y))
                };
                for (from, to) in ends {
                    let mut path = PathBuilder::stroke(px(1.5));
                    path.move_to(point(from));
                    path.line_to(point(to));
                    if let Ok(path) = path.build() {
                        window.paint_path(path, line);
                    }
                }
            },
        )
        .absolute()
        .size_full();

        let cards = self
            .canvas
            .cards
            .iter()
            .map(|card| {
                let id = card.id;
                let start = (card.x, card.y);
                let is_link_start = self.linking == Some(id);
                let body = match &card.note {
                    Some(note) => {
                        let note = note.clone();
                        div()
                            .id(("canvas-note", id as usize))
                            .cursor_pointer()
                            .font_semibold()
                            .text_color(accent)
                            .child(note.clone())
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let Some(workspace) = this.workspace.upgrade() else {
                                    return;
                                };
                                let from = this.path.clone();
                                workspace.update(cx, |workspace, cx| {
                                    workspace.follow_from(&from, &note, window, cx);
                                });
                            }))
                            .into_any_element()
                    }
                    None => div().child(card.text.clone()).into_any_element(),
                };
                v_flex()
                    .id(("canvas-card", id as usize))
                    .absolute()
                    .left(px(card.x))
                    .top(px(card.y))
                    .w(px(CARD_WIDTH))
                    .min_h(px(CARD_HEIGHT))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(if is_link_start { accent } else { border })
                    .bg(surface)
                    .child(
                        // The strip a card is dragged by.
                        h_flex()
                            .id(("canvas-handle", id as usize))
                            .h(px(22.))
                            .px_1()
                            .justify_end()
                            .cursor_pointer()
                            .border_b_1()
                            .border_color(border)
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                                    this.drag = Some(Drag {
                                        card: id,
                                        card_start: start,
                                        pointer_start: event.position,
                                    });
                                    cx.notify();
                                }),
                            )
                            .child(
                                Button::new(("canvas-link", id as usize))
                                    .ghost()
                                    .xsmall()
                                    .label(if is_link_start { "to…" } else { "link" })
                                    .on_click(cx.listener(move |this, _, _, cx| this.link(id, cx))),
                            )
                            .child(
                                Button::new(("canvas-remove", id as usize))
                                    .ghost()
                                    .xsmall()
                                    .label("×")
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        if this.canvas.remove(id) {
                                            this.store(cx);
                                        }
                                        this.linking = None;
                                        cx.notify();
                                    })),
                            ),
                    )
                    .child(div().p_2().text_sm().child(body))
            })
            .collect::<Vec<_>>();

        let hint = if self.linking.is_some() {
            "Click \"link\" on another card to join them, or on the same card to stop."
        } else if self.canvas.cards.is_empty() {
            "An empty canvas. Add a card to begin."
        } else {
            "Drag a card by its top strip. \"link\" on two cards joins them, or removes their line."
        };
        v_flex()
            .id("canvas-view")
            .size_full()
            .test_support()
            .child(
                h_flex()
                    .px_4()
                    .py_2()
                    .gap_3()
                    .child(
                        Label::new(match self.canvas.cards.len() {
                            1 => "1 card".to_owned(),
                            count => format!("{count} cards"),
                        })
                        .font_semibold(),
                    )
                    .child(
                        Button::new("canvas-add")
                            .ghost()
                            .xsmall()
                            .label("+ Add a card")
                            .on_click(cx.listener(|this, _, window, cx| {
                                let Some(workspace) = this.workspace.upgrade() else {
                                    return;
                                };
                                let view = cx.entity().downgrade();
                                workspace.update(cx, |workspace, cx| {
                                    workspace.prompt(
                                        "Add a card",
                                        "Text for a text card, or [[Note name]] for a note. Enter to add.",
                                        "",
                                        window,
                                        cx,
                                        move |_, typed, _, cx| {
                                            _ = view.update(cx, |this, cx| {
                                                let (x, y) = this.canvas.next_spot();
                                                if this.canvas.add(&typed, x, y).is_some() {
                                                    this.store(cx);
                                                }
                                                cx.notify();
                                            });
                                        },
                                    );
                                });
                            })),
                    )
                    // Last, so a narrow pane cuts the hint short and not
                    // the button.
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .overflow_hidden()
                            .text_sm()
                            .text_color(muted)
                            .child(hint),
                    ),
            )
            .child(
                div()
                    .id("canvas-surface")
                    .relative()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .when(self.drag.is_some(), |surface| {
                        // While a card is held, the whole surface follows the
                        // pointer, so a fast drag cannot outrun the card.
                        surface
                            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                                let Some(drag) = &this.drag else {
                                    return;
                                };
                                let moved = event.position - drag.pointer_start;
                                let (x, y) = drag.card_start;
                                let card = drag.card;
                                this.canvas
                                    .place(card, x + f32::from(moved.x), y + f32::from(moved.y));
                                cx.notify();
                            }))
                            .on_mouse_up(
                                MouseButton::Left,
                                cx.listener(|this, _, _, cx| {
                                    if this.drag.take().is_some() {
                                        this.store(cx);
                                    }
                                    cx.notify();
                                }),
                            )
                    })
                    .child(lines)
                    .children(cards),
            )
    }
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use super::{Canvas, Link};

    #[test]
    fn a_canvas_is_written_as_readable_toml_and_read_back() {
        let mut canvas = Canvas::default();
        assert_eq!(canvas.write(), "");
        assert_eq!(Canvas::parse("").unwrap(), canvas);

        let idea = canvas.add("An idea", 40., 60.).unwrap();
        let plan = canvas.add(" [[Projects/Plan]] ", 320., 60.).unwrap();
        assert_eq!((idea, plan), (1, 2));
        assert!(canvas.toggle_link(idea, plan));
        let written = canvas.write();
        assert_eq!(
            written,
            "[[card]]\nid = 1\nx = 40.0\ny = 60.0\ntext = \"An idea\"\n\n[[card]]\nid = 2\nx = 320.0\ny = 60.0\nnote = \"Projects/Plan\"\n\n[[link]]\nfrom = 1\nto = 2\n"
        );
        assert_eq!(Canvas::parse(&written).unwrap(), canvas);
        // A file that is not a canvas is an error, not an empty canvas.
        assert!(Canvas::parse("[[card]]\nid = \"one\"\n").is_err());
        assert!(Canvas::parse("{ \"nodes\": [] }").is_err());
    }

    #[test]
    fn cards_are_added_placed_and_removed_with_their_lines() {
        let mut canvas = Canvas::default();
        assert_eq!(canvas.add("   ", 0., 0.), None);
        assert_eq!(canvas.add("[[]]", 0., 0.), Some(1));
        assert_eq!(canvas.cards[0].text, "[[]]");
        let (a, b, c) = (
            1,
            canvas.add("b", 10., 10.).unwrap(),
            canvas.add("c", 20., 20.).unwrap(),
        );

        assert!(canvas.place(b, 500., 300.));
        assert_eq!((canvas.cards[1].x, canvas.cards[1].y), (500., 300.));
        // Not off the top or the left.
        assert!(canvas.place(b, -50., -1.));
        assert_eq!((canvas.cards[1].x, canvas.cards[1].y), (0., 0.));
        assert!(!canvas.place(99, 1., 1.));

        assert!(canvas.toggle_link(a, b));
        assert!(canvas.toggle_link(c, b));
        // Asking again, either way round, removes the line.
        assert!(canvas.toggle_link(b, a));
        assert_eq!(canvas.links, vec![Link { from: c, to: b }]);
        assert!(!canvas.toggle_link(a, a));
        assert!(!canvas.toggle_link(a, 99));

        assert!(canvas.remove(b));
        assert!(canvas.links.is_empty());
        assert!(!canvas.remove(b));
        // Ids are not reused while a higher one exists.
        assert_eq!(canvas.add("d", 0., 0.), Some(4));
    }

    #[test]
    fn new_cards_go_beside_the_last_one_and_wrap() {
        let mut canvas = Canvas::default();
        assert_eq!(canvas.next_spot(), (40., 40.));
        canvas.add("a", 40., 40.);
        assert_eq!(canvas.next_spot(), (300., 40.));
        canvas.add("b", 950., 40.);
        assert_eq!(canvas.next_spot(), (40., 176.));
    }
}
