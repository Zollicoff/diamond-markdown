//! The main window: file tree, editor and the note's context panel.

use std::collections::HashSet;
use std::time::Duration;

use diamond_vault::{EntryKind, VaultPath};
use gpui_kit::component::{
    ActiveTheme as _, StyledExt as _, h_flex,
    input::{Editor, EditorState, InputEvent},
    label::Label,
    list::ListItem,
    resizable::{h_resizable, resizable_panel},
    scroll::ScrollableElement as _,
    tree::{TreeEvent, TreeItem, TreeState, tree},
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::session::{Follow, Session, TreeNode};

actions!(diamond, [SaveNote, FollowLink]);

const CONTEXT: &str = "Workspace";

/// Starting width of the sidebar and of the context panel.
const SIDE_PANEL_WIDTH: f32 = 260.;

/// How long after the last keystroke an edited note is written to disk.
const AUTOSAVE_DELAY: Duration = Duration::from_millis(800);

/// The platform's main shortcut modifier: Command on macOS, Control elsewhere.
#[cfg(target_os = "macos")]
macro_rules! primary {
    ($key:literal) => {
        concat!("cmd-", $key)
    };
}
#[cfg(not(target_os = "macos"))]
macro_rules! primary {
    ($key:literal) => {
        concat!("ctrl-", $key)
    };
}
pub(crate) use primary;

/// Registers the workspace's key bindings. Call once at startup.
pub fn init(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new(primary!("s"), SaveNote, Some(CONTEXT)),
        KeyBinding::new("alt-enter", FollowLink, Some(CONTEXT)),
    ]);
}

/// The main window's root view.
pub struct Workspace {
    session: Session,
    tree: Entity<TreeState>,
    editor: Entity<EditorState>,
    /// Folders the user has opened in the sidebar, by vault path, so the
    /// tree can be rebuilt after a file change without collapsing.
    expanded: HashSet<SharedString>,
    /// The last failure, shown in the status bar until the next success.
    error: Option<SharedString>,
    autosave: Option<Task<()>>,
    _subscriptions: Vec<Subscription>,
}

impl Workspace {
    /// Builds the workspace for an open vault.
    pub fn new(session: Session, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut error = None;
        let expanded = HashSet::new();
        let items = match session.tree() {
            Ok(nodes) => tree_items(&nodes, &expanded),
            Err(failure) => {
                error = Some(failure.to_string().into());
                Vec::new()
            }
        };
        let tree = cx.new(|cx| TreeState::new(cx).items(items));
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language("markdown")
                .soft_wrap(true)
                .line_number(false)
                .placeholder("Select a note in the sidebar")
        });

        let subscriptions = vec![
            cx.subscribe_in(&editor, window, |this, _, event: &InputEvent, _, cx| {
                if matches!(event, InputEvent::Change) {
                    this.schedule_autosave(cx);
                }
            }),
            cx.subscribe(&tree, |this, _, event: &TreeEvent, _| match event {
                TreeEvent::Expanded(id) => {
                    this.expanded.insert(id.clone());
                }
                TreeEvent::Collapsed(id) => {
                    this.expanded.remove(id);
                }
            }),
        ];

        Self {
            session,
            tree,
            editor,
            expanded,
            error,
            autosave: None,
            _subscriptions: subscriptions,
        }
    }

    /// Opens a note in the editor, saving the current one first.
    pub fn open_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        self.save(cx);
        match self.session.open_note(path) {
            Ok(text) => {
                self.error = None;
                self.editor
                    .update(cx, |editor, cx| editor.set_value(text, window, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Writes the open note now if it has unsaved changes.
    pub fn save(&mut self, cx: &mut Context<Self>) {
        self.autosave = None;
        let text = self.editor.read(cx).value();
        match self.session.save(&text) {
            Ok(_) => self.error = None,
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Opens the note that the link under the cursor leads to, creating it
    /// if the link names a note that does not exist yet.
    pub fn follow_link(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        // Save first, so the note being left is on disk and indexed.
        self.save(cx);
        let (text, cursor) = {
            let editor = self.editor.read(cx);
            (editor.value(), editor.cursor())
        };
        match self.session.follow(&text, cursor) {
            Ok(Follow::NoLink) => {}
            Ok(Follow::Note { path, created }) => {
                if created {
                    self.reveal_in_tree(&path, cx);
                }
                self.open_note(&path, window, cx);
            }
            Ok(Follow::Attachment(path)) => {
                self.error = Some(format!("{path} is not a note; it cannot be opened yet").into());
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Rebuilds the sidebar from disk with `path`'s folders opened.
    fn reveal_in_tree(&mut self, path: &VaultPath, cx: &mut Context<Self>) {
        let mut folder = path.parent();
        while let Some(current) = folder {
            self.expanded.insert(current.to_owned().into());
            folder = current.rfind('/').map(|slash| &current[..slash]);
        }
        match self.session.tree() {
            Ok(nodes) => {
                let items = tree_items(&nodes, &self.expanded);
                self.tree.update(cx, |tree, cx| tree.set_items(items, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    fn schedule_autosave(&mut self, cx: &mut Context<Self>) {
        // Replacing the task drops the previous one, which cancels it.
        self.autosave = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(AUTOSAVE_DELAY).await;
            _ = this.update(cx, |this, cx| this.save(cx));
        }));
        cx.notify();
    }

    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let view = cx.entity();
        let current = self.session.current().map(|path| path.to_string());
        v_flex()
            .size_full()
            .bg(cx.theme().sidebar)
            .child(
                h_flex()
                    .h_9()
                    .px_3()
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(Label::new(self.session.vault_name().to_owned()).font_semibold()),
            )
            .child(
                tree(&self.tree, move |ix, entry, _selected, _window, cx| {
                    let item = entry.item();
                    let id = item.id.clone();
                    let is_folder = entry.is_folder();
                    let is_current = current.as_deref() == Some(id.as_ref());
                    let marker = if !is_folder {
                        ""
                    } else if entry.is_expanded() {
                        "▾ "
                    } else {
                        "▸ "
                    };
                    let row = ListItem::new(ix)
                        .w_full()
                        .pl(px(14.) * entry.depth() + px(10.))
                        .pr_2()
                        .selected(is_current)
                        .child(format!("{marker}{}", item.label));
                    if is_folder {
                        return row;
                    }
                    view.update(cx, |_, cx| {
                        row.on_click(cx.listener(move |this, _, window, cx| {
                            if let Ok(path) = VaultPath::new(&id) {
                                this.open_note(&path, window, cx);
                            }
                        }))
                    })
                })
                .flex_1()
                .p_1(),
            )
    }

    fn render_editor(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let title = self
            .session
            .current_title()
            .unwrap_or("No note open")
            .to_owned();
        let state = match (&self.error, self.session.current()) {
            (Some(error), _) => error.clone(),
            (None, None) => SharedString::default(),
            (None, Some(_)) if self.session.is_dirty(&self.editor.read(cx).value()) => {
                "Edited".into()
            }
            (None, Some(_)) => "Saved".into(),
        };
        v_flex()
            .size_full()
            .bg(cx.theme().background)
            .child(
                h_flex()
                    .h_9()
                    .px_4()
                    .justify_between()
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(Label::new(title).font_semibold())
                    .child(
                        div()
                            .id("save-state")
                            .text_sm()
                            .text_color(if self.error.is_some() {
                                cx.theme().danger
                            } else {
                                cx.theme().muted_foreground
                            })
                            .child(state),
                    ),
            )
            .child(
                div().flex_1().min_h_0().child(
                    Editor::new(&self.editor)
                        .appearance(false)
                        .bordered(false)
                        .h(relative(1.)),
                ),
            )
    }

    fn render_context(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let muted = cx.theme().muted_foreground;
        let backlinks = self.session.backlinks();
        let outline = self.session.outline();
        let tags = self.session.tags();
        let unresolved = self.session.unresolved_link_count();

        let section = |title: &str, count: usize| {
            div()
                .pt_3()
                .pb_1()
                .text_xs()
                .text_color(muted)
                .child(format!("{} ({count})", title.to_uppercase()))
        };

        v_flex()
            .id("context-panel")
            .size_full()
            .px_3()
            .bg(cx.theme().sidebar)
            .overflow_y_scrollbar()
            .child(section("Backlinks", backlinks.len()))
            .children(
                backlinks
                    .into_iter()
                    .enumerate()
                    .map(|(ix, (path, title))| {
                        ListItem::new(("backlink", ix))
                            .child(title)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_note(&path, window, cx);
                            }))
                    }),
            )
            .child(section("Outline", outline.len()))
            .children(outline.into_iter().map(|heading| {
                div()
                    .pl(px(10.) * (heading.level.saturating_sub(1)) as f32)
                    .text_sm()
                    .child(heading.text)
            }))
            .child(section("Tags", tags.len()))
            .children(
                tags.into_iter()
                    .map(|tag| div().text_sm().child(format!("#{tag}"))),
            )
            .when(unresolved > 0, |panel| {
                panel.child(
                    div()
                        .pt_3()
                        .text_xs()
                        .text_color(muted)
                        .child(format!("{unresolved} unresolved link(s)")),
                )
            })
    }
}

impl Render for Workspace {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("workspace")
            .key_context(CONTEXT)
            .on_action(cx.listener(|this, _: &SaveNote, _, cx| this.save(cx)))
            .on_action(cx.listener(|this, _: &FollowLink, window, cx| {
                this.follow_link(window, cx);
            }))
            .size_full()
            .text_color(cx.theme().foreground)
            .child(
                h_resizable("workspace-panels")
                    .child(
                        resizable_panel()
                            .size(px(SIDE_PANEL_WIDTH))
                            .size_range(px(180.)..px(480.))
                            .child(panel("sidebar", self.render_sidebar(cx))),
                    )
                    .child(resizable_panel().child(panel("editor-pane", self.render_editor(cx))))
                    .child(
                        resizable_panel()
                            .size(px(SIDE_PANEL_WIDTH))
                            .size_range(px(180.)..px(480.))
                            .child(panel("context-pane", self.render_context(cx))),
                    ),
            )
    }
}

/// Wraps a panel's content in a named element that fills its slot. The name
/// lets window tests find the panel and check where it was laid out.
fn panel(id: &'static str, content: impl IntoElement) -> impl IntoElement {
    div().id(id).size_full().child(content).test_support()
}

fn tree_items(nodes: &[TreeNode], expanded: &HashSet<SharedString>) -> Vec<TreeItem> {
    nodes
        .iter()
        .map(|node| {
            let id: SharedString = node.path.to_string().into();
            let item = TreeItem::new(id.clone(), node.name.clone());
            if node.kind == EntryKind::Folder {
                item.expanded(expanded.contains(&id))
                    .children(tree_items(&node.children, expanded))
            } else {
                item
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use std::fs;
    use std::time::Duration;

    use diamond_vault::VaultPath;
    use gpui_kit::component::Root;
    use gpui_kit::test::TestWindowExt as _;
    use gpui_kit::{
        AppContext as _, Bounds, Pixels, Point, TestAppContext, VisualTestContext, WindowBounds,
        WindowOptions, px, size,
    };

    use super::{AUTOSAVE_DELAY, SIDE_PANEL_WIDTH, Workspace, init};
    use crate::session::Session;

    fn path(raw: &str) -> VaultPath {
        VaultPath::new(raw).unwrap()
    }

    #[gpui_kit::test]
    fn open_type_save_autosave_and_switch(cx: &mut TestAppContext) {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("Home.md");
        let plan = dir.path().join("Plan.md");
        fs::write(&home, "Home links to [[Plan]].\n").unwrap();
        fs::write(&plan, "# Plan\n").unwrap();
        let (session, _) = Session::open(dir.path()).unwrap();

        cx.update(|cx| {
            gpui_kit::init(cx);
            init(cx);
        });
        let mut session = Some(session);
        let mut workspace = None;
        let (_root, cx) = cx.add_window_view(|window, cx| {
            let view = cx.new(|cx| Workspace::new(session.take().unwrap(), window, cx));
            workspace = Some(view.clone());
            Root::new(view, window, cx)
        });
        let workspace = workspace.unwrap();
        let editor = workspace.read_with(cx, |workspace, _| workspace.editor.clone());
        let text = |cx: &mut VisualTestContext| editor.read_with(cx, |editor, _| editor.value());

        // Opening a note loads it without marking it edited.
        cx.update(|window, cx| {
            workspace.update(cx, |workspace, cx| {
                workspace.open_note(&path("Plan.md"), window, cx);
            });
        });
        assert_eq!(text(cx).as_ref(), "# Plan\n");
        workspace.read_with(cx, |workspace, _| {
            assert_eq!(
                workspace.session.backlinks(),
                vec![(path("Home.md"), "Home".to_owned())]
            );
            assert!(!workspace.session.is_dirty("# Plan\n"));
            assert!(workspace.autosave.is_none());
        });

        // Typing changes the editor, not the file.
        cx.update(|window, cx| editor.update(cx, |editor, cx| editor.focus(window, cx)));
        cx.simulate_keystrokes("x");
        assert_eq!(text(cx).as_ref(), "x# Plan\n");
        assert_eq!(fs::read_to_string(&plan).unwrap(), "# Plan\n");
        workspace.read_with(cx, |workspace, _| assert!(workspace.autosave.is_some()));

        // The save shortcut writes immediately.
        cx.simulate_keystrokes(super::primary!("s"));
        assert_eq!(fs::read_to_string(&plan).unwrap(), "x# Plan\n");
        workspace.read_with(cx, |workspace, _| assert!(workspace.autosave.is_none()));

        // Otherwise the note is written shortly after the last keystroke.
        cx.simulate_keystrokes("y");
        assert_eq!(fs::read_to_string(&plan).unwrap(), "x# Plan\n");
        cx.executor()
            .advance_clock(AUTOSAVE_DELAY + Duration::from_millis(50));
        cx.run_until_parked();
        assert_eq!(fs::read_to_string(&plan).unwrap(), "xy# Plan\n");

        // Switching notes saves the one being left.
        cx.simulate_keystrokes("z");
        cx.update(|window, cx| {
            workspace.update(cx, |workspace, cx| {
                workspace.open_note(&path("Home.md"), window, cx);
            });
        });
        assert_eq!(fs::read_to_string(&plan).unwrap(), "xyz# Plan\n");
        assert_eq!(text(cx).as_ref(), "Home links to [[Plan]].\n");
        assert_eq!(
            fs::read_to_string(&home).unwrap(),
            "Home links to [[Plan]].\n"
        );
    }

    #[gpui_kit::test]
    fn a_missing_note_shows_an_error_and_keeps_the_editor(cx: &mut TestAppContext) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Home.md"), "home\n").unwrap();
        let (session, _) = Session::open(dir.path()).unwrap();

        cx.update(|cx| {
            gpui_kit::init(cx);
            init(cx);
        });
        let mut session = Some(session);
        let mut workspace = None;
        let (_root, cx) = cx.add_window_view(|window, cx| {
            let view = cx.new(|cx| Workspace::new(session.take().unwrap(), window, cx));
            workspace = Some(view.clone());
            Root::new(view, window, cx)
        });
        let workspace = workspace.unwrap();

        cx.update(|window, cx| {
            workspace.update(cx, |workspace, cx| {
                workspace.open_note(&path("Home.md"), window, cx);
                workspace.open_note(&path("Gone.md"), window, cx);
            });
        });
        workspace.read_with(cx, |workspace, cx| {
            assert!(
                workspace
                    .error
                    .as_ref()
                    .is_some_and(|error| error.contains("Gone.md"))
            );
            assert_eq!(workspace.session.current(), Some(&path("Home.md")));
            assert_eq!(workspace.editor.read(cx).value().as_ref(), "home\n");
        });
    }

    #[gpui_kit::test]
    fn panels_sit_side_by_side_and_fill_the_window(cx: &mut TestAppContext) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Home.md"), "# Home\n").unwrap();
        let (session, _) = Session::open(dir.path()).unwrap();

        // Opened the way `main` opens it, at a known size.
        let (width, height) = (1200., 800.);
        let window = cx.update(|cx| {
            gpui_kit::init(cx);
            init(cx);
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds {
                    origin: Point::default(),
                    size: size(px(width), px(height)),
                })),
                ..WindowOptions::default()
            };
            let (window, _) = gpui_kit::open_window(options, cx, |window, cx| {
                cx.new(|cx| Workspace::new(session, window, cx))
            })
            .unwrap();
            window
        });

        cx.update_window(window, |_, window, cx| {
            window.render_frame(cx);
            let sidebar = window.find("sidebar").bounds();
            let editor = window.find("editor-pane").bounds();
            let context = window.find("context-pane").bounds();
            let near = |actual: Pixels, expected: f32| (actual - px(expected)).abs() <= px(2.);

            for (name, bounds) in [
                ("sidebar", sidebar),
                ("editor", editor),
                ("context", context),
            ] {
                assert!(near(bounds.top(), 0.), "{name} top: {bounds:?}");
                assert!(
                    near(bounds.size.height, height),
                    "{name} height: {bounds:?}"
                );
            }
            assert!(near(sidebar.left(), 0.), "{sidebar:?}");
            assert!(near(sidebar.size.width, SIDE_PANEL_WIDTH), "{sidebar:?}");
            assert!(near(context.right(), width), "{context:?}");
            assert!(near(context.size.width, SIDE_PANEL_WIDTH), "{context:?}");
            // The editor takes the space between the two side panels.
            assert!(near(editor.left(), SIDE_PANEL_WIDTH), "{editor:?}");
            assert!(
                near(editor.size.width, width - 2. * SIDE_PANEL_WIDTH),
                "{editor:?}"
            );
        })
        .unwrap();
    }

    #[gpui_kit::test]
    fn alt_enter_follows_the_link_under_the_cursor(cx: &mut TestAppContext) {
        let dir = tempfile::tempdir().unwrap();
        let home_text = "See [[Plan]] or start [[Ideas/Fresh]].\n";
        fs::write(dir.path().join("Home.md"), home_text).unwrap();
        fs::write(dir.path().join("Plan.md"), "# Plan\n").unwrap();
        let (session, _) = Session::open(dir.path()).unwrap();

        cx.update(|cx| {
            gpui_kit::init(cx);
            init(cx);
        });
        let mut session = Some(session);
        let mut workspace = None;
        let (_root, cx) = cx.add_window_view(|window, cx| {
            let view = cx.new(|cx| Workspace::new(session.take().unwrap(), window, cx));
            workspace = Some(view.clone());
            Root::new(view, window, cx)
        });
        let workspace = workspace.unwrap();
        let editor = workspace.read_with(cx, |workspace, _| workspace.editor.clone());
        let open_home_with_cursor_on = |needle: &str, cx: &mut VisualTestContext| {
            let offset = home_text.find(needle).unwrap() + 3;
            cx.update(|window, cx| {
                workspace.update(cx, |workspace, cx| {
                    workspace.open_note(&path("Home.md"), window, cx);
                });
                editor.update(cx, |editor, cx| {
                    editor.focus(window, cx);
                    editor.set_selected_range(offset..offset, cx);
                });
            });
        };
        let current = |cx: &mut VisualTestContext| {
            workspace.read_with(cx, |workspace, _| workspace.session.current().cloned())
        };

        // An existing note opens.
        open_home_with_cursor_on("[[Plan", cx);
        cx.simulate_keystrokes("alt-enter");
        assert_eq!(current(cx), Some(path("Plan.md")));
        assert_eq!(
            editor.read_with(cx, |editor, _| editor.value()).as_ref(),
            "# Plan\n"
        );

        // A link to a note that does not exist creates it, opens it and shows
        // it in the sidebar with its folder opened.
        open_home_with_cursor_on("[[Ideas", cx);
        cx.simulate_keystrokes("alt-enter");
        assert_eq!(current(cx), Some(path("Ideas/Fresh.md")));
        assert!(dir.path().join("Ideas/Fresh.md").exists());
        workspace.read_with(cx, |workspace, cx| {
            assert!(workspace.error.is_none(), "{:?}", workspace.error);
            assert!(workspace.expanded.contains("Ideas"));
            let tree = workspace.tree.read(cx);
            assert!(tree.index_of(&"Ideas/Fresh.md".into()).is_some());
        });

        // Away from a link, nothing changes.
        open_home_with_cursor_on("See", cx);
        cx.simulate_keystrokes("alt-enter");
        assert_eq!(current(cx), Some(path("Home.md")));
        assert_eq!(
            fs::read_to_string(dir.path().join("Home.md")).unwrap(),
            home_text
        );
    }
}
