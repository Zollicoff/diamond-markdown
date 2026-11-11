//! Graph: notes as dots and the links between them as lines.
//!
//! The graph shows the notes around the one in front, two links out, or
//! the whole vault. Clicking a dot opens its note.

use std::collections::VecDeque;

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

use crate::plugin::{Command, Plugin};
use crate::session::{NoteGraph, Session};
use crate::workspace::Workspace;

/// How far from the note in front the local graph reaches, in links.
const DEPTH: usize = 2;

/// The most notes drawn at once. Past this the best-connected are kept, so
/// the picture stays readable and quick to lay out.
const MOST: usize = 300;

/// Labels are drawn beside every dot only while there are few enough to
/// read.
const MOST_LABELLED: usize = 60;

/// The notes within `depth` links of `center`, nearest first. Links count
/// in both directions.
pub fn around(count: usize, links: &[(usize, usize)], center: usize, depth: usize) -> Vec<usize> {
    if center >= count {
        return Vec::new();
    }
    let mut neighbours: Vec<Vec<usize>> = vec![Vec::new(); count];
    for &(a, b) in links {
        if a < count && b < count {
            neighbours[a].push(b);
            neighbours[b].push(a);
        }
    }
    let mut distance = vec![usize::MAX; count];
    distance[center] = 0;
    let mut found = vec![center];
    let mut queue = VecDeque::from([center]);
    while let Some(at) = queue.pop_front() {
        if distance[at] == depth {
            continue;
        }
        for &next in &neighbours[at] {
            if distance[next] == usize::MAX {
                distance[next] = distance[at] + 1;
                found.push(next);
                queue.push_back(next);
            }
        }
    }
    found
}

/// Places `count` dots in a unit square so that linked dots sit near each
/// other and unlinked ones keep apart. The same input always gives the same
/// picture.
pub fn layout(count: usize, links: &[(usize, usize)]) -> Vec<(f32, f32)> {
    if count == 0 {
        return Vec::new();
    }
    // Start on a spiral: spread out, and no two dots in the same place.
    let mut at: Vec<(f32, f32)> = (0..count)
        .map(|index| {
            let radius = ((index as f32 + 0.5) / count as f32).sqrt() * 0.45;
            let angle = index as f32 * 2.399_963;
            (0.5 + radius * angle.cos(), 0.5 + radius * angle.sin())
        })
        .collect();
    // The distance dots settle at when nothing else pulls on them.
    let ideal = (1.0 / count as f32).sqrt() * 0.8;
    let rounds = if count > 150 { 60 } else { 120 };
    for round in 0..rounds {
        let mut push = vec![(0.0f32, 0.0f32); count];
        // Every pair of dots pushes apart.
        for a in 0..count {
            for b in a + 1..count {
                let (dx, dy) = (at[a].0 - at[b].0, at[a].1 - at[b].1);
                let distance = (dx * dx + dy * dy).sqrt().max(0.001);
                let force = ideal * ideal / distance;
                let (fx, fy) = (dx / distance * force, dy / distance * force);
                push[a].0 += fx;
                push[a].1 += fy;
                push[b].0 -= fx;
                push[b].1 -= fy;
            }
        }
        // Linked dots pull together.
        for &(a, b) in links {
            if a >= count || b >= count || a == b {
                continue;
            }
            let (dx, dy) = (at[a].0 - at[b].0, at[a].1 - at[b].1);
            let distance = (dx * dx + dy * dy).sqrt().max(0.001);
            let force = distance * distance / ideal;
            let (fx, fy) = (dx / distance * force, dy / distance * force);
            push[a].0 -= fx;
            push[a].1 -= fy;
            push[b].0 += fx;
            push[b].1 += fy;
        }
        // Move less each round, so the picture settles.
        let limit = 0.1 * (1.0 - round as f32 / rounds as f32) + 0.002;
        for (position, (fx, fy)) in at.iter_mut().zip(push) {
            // A pull to the middle keeps notes without links near the rest.
            // Left weak, they drift so far that fitting the picture to the
            // square squeezes the linked notes into a knot.
            let (fx, fy) = (fx + (0.5 - position.0), fy + (0.5 - position.1));
            let size = (fx * fx + fy * fy).sqrt().max(0.0001);
            let step = size.min(limit);
            // Dots may leave the square for now: holding them at its edge
            // would pile them into the corners. The picture is fitted to
            // the square once it has settled.
            position.0 += fx / size * step;
            position.1 += fy / size * step;
        }
    }
    // Stretch to fill the square with a margin, whatever shape it settled in.
    let (mut left, mut right, mut top, mut bottom) = (1.0f32, 0.0f32, 1.0f32, 0.0f32);
    for &(x, y) in &at {
        (left, right) = (left.min(x), right.max(x));
        (top, bottom) = (top.min(y), bottom.max(y));
    }
    let (width, height) = ((right - left).max(0.001), (bottom - top).max(0.001));
    // The wider margin on the right leaves room for a label beside a dot.
    for position in &mut at {
        position.0 = 0.05 + (position.0 - left) / width * 0.78;
        position.1 = 0.06 + (position.1 - top) / height * 0.88;
    }
    if count == 1 {
        at[0] = (0.5, 0.5);
    }
    at
}

/// What is drawn: some notes, the links among them, and where each goes.
#[derive(Default)]
struct Picture {
    notes: Vec<(VaultPath, String)>,
    links: Vec<(usize, usize)>,
    at: Vec<(f32, f32)>,
    /// How many links each note has, for the size of its dot.
    degree: Vec<usize>,
    /// How many notes were left out to keep to [`MOST`].
    left_out: usize,
}

/// Chooses the notes to draw and lays them out.
fn picture(session: &Session, center: Option<&VaultPath>) -> Picture {
    let NoteGraph { notes, links } = session.graph();
    let mut degree = vec![0usize; notes.len()];
    for &(a, b) in &links {
        degree[a] += 1;
        degree[b] += 1;
    }
    let center = center.and_then(|center| notes.iter().position(|(path, _)| path == center));
    let mut chosen: Vec<usize> = match center {
        Some(center) => around(notes.len(), &links, center, DEPTH),
        None => {
            let mut all: Vec<usize> = (0..notes.len()).collect();
            // Best-connected first; the sort is stable, so ties stay in
            // path order.
            all.sort_by_key(|&note| std::cmp::Reverse(degree[note]));
            all
        }
    };
    let left_out = chosen.len().saturating_sub(MOST);
    chosen.truncate(MOST);

    let mut place = vec![usize::MAX; notes.len()];
    for (position, &note) in chosen.iter().enumerate() {
        place[note] = position;
    }
    let links: Vec<(usize, usize)> = links
        .iter()
        .filter(|(a, b)| place[*a] != usize::MAX && place[*b] != usize::MAX)
        .map(|&(a, b)| (place[a], place[b]))
        .collect();
    Picture {
        at: layout(chosen.len(), &links),
        degree: chosen.iter().map(|&note| degree[note]).collect(),
        notes: chosen.into_iter().map(|note| notes[note].clone()).collect(),
        links,
        left_out,
    }
}

/// The graph plugin.
#[derive(Default)]
pub struct Graph;

impl Plugin for Graph {
    fn id(&self) -> &'static str {
        "graph"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "Show graph",
            &["links", "network", "map", "connections"],
            |workspace, window, cx| {
                let center = workspace.current().cloned();
                workspace.open_view("graph", "Graph", window, cx, |workspace, cx| {
                    let handle = cx.entity();
                    let session = workspace.session();
                    let view = GraphView {
                        workspace: handle.downgrade(),
                        local: center.is_some(),
                        picture: picture(session, center.as_ref()),
                        revision: session.revision(),
                        center,
                        _watch: None,
                    };
                    cx.new(|cx| view.watching(&handle, cx))
                });
            },
        )]
    }
}

/// The graph, shown in a tab.
pub struct GraphView {
    workspace: WeakEntity<Workspace>,
    /// The last note that was in front: the middle of the local graph.
    center: Option<VaultPath>,
    /// Whether only the notes around `center` are shown.
    local: bool,
    picture: Picture,
    /// The index revision the picture was made from.
    revision: u64,
    _watch: Option<Subscription>,
}

impl GraphView {
    fn watching(mut self, workspace: &Entity<Workspace>, cx: &mut Context<Self>) -> Self {
        self._watch = Some(cx.observe(workspace, |this, workspace, cx| {
            let workspace = workspace.read(cx);
            // The graph's own tab has no note; the middle stays where it was.
            let center = workspace.current().cloned().or_else(|| this.center.clone());
            let revision = workspace.session().revision();
            if center != this.center || revision != this.revision {
                this.center = center;
                this.revision = revision;
                this.draw(workspace.session());
                cx.notify();
            }
        }));
        self
    }

    fn draw(&mut self, session: &Session) {
        let center = if self.local {
            self.center.as_ref()
        } else {
            None
        };
        self.picture = picture(session, center);
    }
}

impl Render for GraphView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let (muted, line, dot, accent) = (
            theme.muted_foreground,
            theme.border,
            theme.foreground,
            theme.primary,
        );
        let picture = &self.picture;
        let labelled = picture.notes.len() <= MOST_LABELLED;

        // The lines are painted straight onto a canvas under the dots.
        let (at, links) = (picture.at.clone(), picture.links.clone());
        let lines = canvas(
            |_, _, _| {},
            move |bounds, (), window, _| {
                let point = |(x, y): (f32, f32)| {
                    gpui_kit::point(
                        bounds.origin.x + bounds.size.width * x,
                        bounds.origin.y + bounds.size.height * y,
                    )
                };
                for (a, b) in links {
                    let mut path = PathBuilder::stroke(px(1.));
                    path.move_to(point(at[a]));
                    path.line_to(point(at[b]));
                    if let Ok(path) = path.build() {
                        window.paint_path(path, line);
                    }
                }
            },
        )
        .absolute()
        .size_full();

        let dots = picture
            .notes
            .iter()
            .enumerate()
            .map(|(index, (path, title))| {
                let (x, y) = picture.at[index];
                let is_center = self.local && self.center.as_ref() == Some(path);
                let size = px(6. + (picture.degree[index] as f32).sqrt().min(4.) * 2.);
                let path = path.clone();
                h_flex()
                    .id(("graph-note", index))
                    .test_support()
                    .absolute()
                    .left(relative(x))
                    .top(relative(y))
                    // The dot's middle, not its corner, sits on the spot.
                    .ml(-size / 2.)
                    .mt(-size / 2.)
                    .gap_1()
                    .cursor_pointer()
                    .child(
                        div()
                            .size(size)
                            .rounded_full()
                            .bg(if is_center { accent } else { dot }),
                    )
                    .when(labelled || is_center, |note| {
                        note.child(
                            div()
                                .text_xs()
                                .text_color(if is_center { accent } else { muted })
                                .child(title.clone()),
                        )
                    })
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if let Some(workspace) = this.workspace.upgrade() {
                            workspace.update(cx, |workspace, cx| {
                                workspace.open_note(&path, window, cx);
                            });
                        }
                    }))
            })
            .collect::<Vec<_>>();

        let summary = match (picture.notes.len(), picture.left_out) {
            (0, _) => "No notes to show".to_owned(),
            (shown, 0) => format!("{shown} notes, {} links", picture.links.len()),
            (shown, left_out) => format!(
                "The {shown} best-connected notes, {} links; {left_out} more not shown",
                picture.links.len()
            ),
        };
        let can_be_local = self.center.is_some();
        v_flex()
            .id("graph-view")
            .size_full()
            .test_support()
            .child(
                h_flex()
                    .px_4()
                    .py_2()
                    .gap_3()
                    .child(
                        Label::new(if self.local {
                            "Around this note"
                        } else {
                            "Whole vault"
                        })
                        .font_semibold(),
                    )
                    .child(div().text_sm().text_color(muted).child(summary))
                    .child(div().flex_1())
                    .when(can_be_local, |bar| {
                        bar.child(
                            Button::new("graph-scope")
                                .ghost()
                                .xsmall()
                                .label(if self.local {
                                    "Show whole vault"
                                } else {
                                    "Show around this note"
                                })
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.local = !this.local;
                                    if let Some(workspace) = this.workspace.upgrade() {
                                        this.draw(workspace.read(cx).session());
                                    }
                                    cx.notify();
                                })),
                        )
                    }),
            )
            .child(
                div()
                    .relative()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .child(lines)
                    .children(dots),
            )
    }
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use super::{around, layout};

    #[test]
    fn the_local_graph_reaches_a_set_number_of_links_either_way() {
        // 0 - 1 - 2 - 3 - 4, and 5 on its own.
        let links = [(0, 1), (1, 2), (2, 3), (3, 4)];
        assert_eq!(around(6, &links, 2, 0), vec![2]);
        assert_eq!(around(6, &links, 2, 1), vec![2, 1, 3]);
        assert_eq!(around(6, &links, 0, 2), vec![0, 1, 2]);
        assert_eq!(around(6, &links, 5, 3), vec![5]);
        // A loop is walked once.
        assert_eq!(around(3, &[(0, 1), (1, 2), (0, 2)], 0, 5), vec![0, 1, 2]);
        assert!(around(3, &links, 7, 2).is_empty());
    }

    #[test]
    fn linked_notes_end_up_closer_than_unlinked_ones() {
        // Two triangles joined by nothing.
        let links = [(0, 1), (1, 2), (0, 2), (3, 4), (4, 5), (3, 5)];
        let at = layout(6, &links);
        let distance = |a: usize, b: usize| {
            let (dx, dy) = (at[a].0 - at[b].0, at[a].1 - at[b].1);
            (dx * dx + dy * dy).sqrt()
        };
        let within = [
            distance(0, 1),
            distance(1, 2),
            distance(3, 4),
            distance(4, 5),
        ];
        let across = [distance(0, 3), distance(1, 4), distance(2, 5)];
        let furthest_within = within.iter().copied().fold(0.0, f32::max);
        let nearest_across = across.iter().copied().fold(f32::MAX, f32::min);
        assert!(furthest_within < nearest_across, "{within:?} vs {across:?}");
    }

    #[test]
    fn every_dot_is_inside_the_square_and_none_share_a_spot() {
        for count in [1, 2, 7, 40, 200] {
            let links: Vec<(usize, usize)> = (1..count).map(|note| (note / 2, note)).collect();
            let at = layout(count, &links);
            assert_eq!(at.len(), count);
            for &(x, y) in &at {
                assert!(
                    (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y),
                    "{count}: {x}, {y}"
                );
                assert!(x.is_finite() && y.is_finite());
            }
            for a in 0..count {
                for b in a + 1..count {
                    assert!(at[a] != at[b], "{count}: {a} and {b} at {:?}", at[a]);
                }
            }
            // The same input gives the same picture.
            assert_eq!(layout(count, &links), at);
        }
        assert!(layout(0, &[]).is_empty());
        assert_eq!(layout(1, &[]), vec![(0.5, 0.5)]);
        // Links that name notes that are not there are ignored.
        assert_eq!(layout(2, &[(0, 9), (1, 1)]).len(), 2);
    }
}
