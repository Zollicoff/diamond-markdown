//! Window tests: the real views in a headless window.

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

use gpui_kit::component::theme::Theme;

use super::palette::{Palette, PaletteMode, RowTarget};
use super::{AUTOSAVE_DELAY, Overlay, SIDE_PANEL_WIDTH, Workspace};
use crate::actions::{BACK_FORWARD, COMMANDS, bind_keys as init, primary};
use crate::notes::Moment;
use crate::session::Session;

impl Workspace {
    /// The palette, when that is what is open over the window.
    fn palette(&self) -> Option<&Palette> {
        match &self.overlay {
            Some(Overlay::Palette(palette)) => Some(palette),
            _ => None,
        }
    }
}

/// The label of a palette row that opens a note, the note, and the line it
/// opens at.
fn note_row(palette: &Palette, row: usize) -> (&str, &str, Option<usize>) {
    match &palette.rows[row].target {
        RowTarget::Note { path, line } => (palette.rows[row].label.as_ref(), path.as_str(), *line),
        other => panic!("row {row} is not a note: {other:?}"),
    }
}

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
    let editor = workspace.read_with(cx, |workspace, _| workspace.tab().editor.clone());
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
            workspace.backlinks(),
            vec![(path("Home.md"), "Home".to_owned())]
        );
        assert!(!workspace.tab().is_dirty("# Plan\n"));
        assert!(workspace.tab().autosave.is_none());
    });

    // Typing changes the editor, not the file.
    cx.update(|window, cx| editor.update(cx, |editor, cx| editor.focus(window, cx)));
    cx.simulate_keystrokes("x");
    assert_eq!(text(cx).as_ref(), "x# Plan\n");
    assert_eq!(fs::read_to_string(&plan).unwrap(), "# Plan\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().autosave.is_some())
    });

    // The save shortcut writes immediately.
    cx.simulate_keystrokes(primary!("s"));
    assert_eq!(fs::read_to_string(&plan).unwrap(), "x# Plan\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().autosave.is_none())
    });

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
        assert_eq!(workspace.current(), Some(&path("Home.md")));
        assert_eq!(workspace.tab().editor.read(cx).value().as_ref(), "home\n");
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
    let editor = workspace.read_with(cx, |workspace, _| workspace.tab().editor.clone());
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
        workspace.read_with(cx, |workspace, _| workspace.current().cloned())
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

/// Opens a workspace on a vault holding `files` and returns the pieces
/// the tests poke at.
fn open<'a>(
    files: &[(&str, &str)],
    cx: &'a mut TestAppContext,
) -> (
    tempfile::TempDir,
    gpui_kit::Entity<Workspace>,
    &'a mut VisualTestContext,
) {
    let dir = tempfile::tempdir().unwrap();
    for (name, contents) in files {
        let absolute = dir.path().join(name);
        fs::create_dir_all(absolute.parent().unwrap()).unwrap();
        fs::write(absolute, contents).unwrap();
    }
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
    (dir, workspace.unwrap(), cx)
}

fn open_note(workspace: &gpui_kit::Entity<Workspace>, name: &str, cx: &mut VisualTestContext) {
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.open_note(&path(name), window, cx);
            workspace
                .tab()
                .editor
                .update(cx, |editor, cx| editor.focus(window, cx));
        });
    });
}

fn changed(workspace: &gpui_kit::Entity<Workspace>, name: &str, cx: &mut VisualTestContext) {
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.handle_changes(&[path(name)], window, cx);
        });
    });
}

fn editor_text(workspace: &gpui_kit::Entity<Workspace>, cx: &mut VisualTestContext) -> String {
    workspace.read_with(cx, |workspace, cx| {
        workspace.tab().editor.read(cx).value().to_string()
    })
}

#[gpui_kit::test]
fn an_outside_edit_reloads_a_note_without_unsaved_changes(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "first\n")], cx);
    open_note(&workspace, "Home.md", cx);

    fs::write(dir.path().join("Home.md"), "second, from elsewhere\n").unwrap();
    changed(&workspace, "Home.md", cx);
    assert_eq!(editor_text(&workspace, cx), "second, from elsewhere\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().conflict.is_none());
        assert!(!workspace.tab().is_dirty("second, from elsewhere\n"));
    });

    // A new file elsewhere shows up in the sidebar.
    fs::write(dir.path().join("Added.md"), "").unwrap();
    changed(&workspace, "Added.md", cx);
    workspace.read_with(cx, |workspace, cx| {
        assert!(
            workspace
                .tree
                .read(cx)
                .index_of(&"Added.md".into())
                .is_some()
        );
    });
}

#[gpui_kit::test]
fn an_outside_edit_never_overwrites_or_loses_unsaved_changes(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "base\n"), ("Other.md", "")], cx);
    let home = dir.path().join("Home.md");
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("m i n e");
    fs::write(&home, "theirs\n").unwrap();
    changed(&workspace, "Home.md", cx);

    // The editor keeps the user's text and autosave stands down.
    assert_eq!(editor_text(&workspace, cx), "minebase\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().conflict.is_some());
        assert!(workspace.tab().autosave.is_none());
    });
    cx.simulate_keystrokes("!");
    cx.executor().advance_clock(AUTOSAVE_DELAY * 3);
    cx.run_until_parked();
    assert_eq!(fs::read_to_string(&home).unwrap(), "theirs\n");

    // Leaving the note keeps both versions: theirs in place, the user's
    // in a copy beside it.
    open_note(&workspace, "Other.md", cx);
    assert_eq!(fs::read_to_string(&home).unwrap(), "theirs\n");
    assert_eq!(
        fs::read_to_string(dir.path().join("Home (conflict).md")).unwrap(),
        "mine!base\n"
    );
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().conflict.is_none())
    });
}

#[gpui_kit::test]
fn saving_settles_a_conflict_in_the_editors_favour(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "base\n")], cx);
    let home = dir.path().join("Home.md");
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");
    fs::write(&home, "theirs\n").unwrap();
    changed(&workspace, "Home.md", cx);

    cx.simulate_keystrokes(primary!("s"));
    assert_eq!(fs::read_to_string(&home).unwrap(), "xbase\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().conflict.is_none())
    });
    assert!(!dir.path().join("Home (conflict).md").exists());
}

#[gpui_kit::test]
fn a_note_removed_elsewhere_closes_unless_it_has_unsaved_changes(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("A.md", "a\n"), ("B.md", "b\n")], cx);
    open_note(&workspace, "A.md", cx);
    fs::remove_file(dir.path().join("A.md")).unwrap();
    changed(&workspace, "A.md", cx);
    assert_eq!(editor_text(&workspace, cx), "");
    workspace.read_with(cx, |workspace, _| assert!(workspace.current().is_none()));

    open_note(&workspace, "B.md", cx);
    cx.simulate_keystrokes("x");
    fs::remove_file(dir.path().join("B.md")).unwrap();
    changed(&workspace, "B.md", cx);
    assert_eq!(editor_text(&workspace, cx), "xb\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().conflict.is_some())
    });
    // Saving puts the note back.
    cx.simulate_keystrokes(primary!("s"));
    assert_eq!(fs::read_to_string(dir.path().join("B.md")).unwrap(), "xb\n");
}

#[gpui_kit::test]
fn the_new_note_shortcut_creates_and_opens_untitled(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");
    cx.simulate_keystrokes(primary!("n"));

    workspace.read_with(cx, |workspace, cx| {
        assert_eq!(workspace.current(), Some(&path("Untitled.md")));
        assert!(
            workspace
                .tree
                .read(cx)
                .index_of(&"Untitled.md".into())
                .is_some()
        );
    });
    // The note being left was saved, and typing goes into the new one.
    assert_eq!(
        fs::read_to_string(dir.path().join("Home.md")).unwrap(),
        "xhome\n"
    );
    cx.simulate_keystrokes("h i");
    assert_eq!(editor_text(&workspace, cx), "hi");
}

#[gpui_kit::test]
fn deleting_the_open_note_trashes_its_latest_text(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n"), ("Keep.md", "")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.delete_entry(&path("Home.md"), window, cx);
        });
    });

    assert!(!dir.path().join("Home.md").exists());
    assert_eq!(
        fs::read_to_string(dir.path().join(".diamond/trash/Home.md")).unwrap(),
        "xhome\n"
    );
    assert_eq!(editor_text(&workspace, cx), "");
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.current().is_none());
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
        let tree = workspace.tree.read(cx);
        assert!(tree.index_of(&"Home.md".into()).is_none());
        assert!(tree.index_of(&"Keep.md".into()).is_some());
    });
    // Nothing brings the file back afterwards.
    cx.executor().advance_clock(AUTOSAVE_DELAY * 3);
    cx.run_until_parked();
    assert!(!dir.path().join("Home.md").exists());
}

#[gpui_kit::test]
fn the_quick_switcher_finds_and_opens_a_note(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "home\n"),
            ("Projects/Quarterly Plan.md", "# Plan\n"),
            ("Projects/Budget.md", "# Budget\n"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");

    cx.simulate_keystrokes(primary!("o"));
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().expect("palette open");
        assert_eq!(palette.mode, PaletteMode::Notes);
        assert_eq!(palette.rows.len(), 3);
    });

    // Typing goes to the switcher, not the note, and narrows the list.
    cx.simulate_keystrokes("q p l");
    assert_eq!(editor_text(&workspace, cx), "xhome\n");
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().unwrap();
        assert_eq!(palette.rows.len(), 1, "{:?}", palette.rows);
        assert_eq!(
            note_row(palette, 0),
            (
                "Quarterly Plan  ·  Projects",
                "Projects/Quarterly Plan.md",
                None
            )
        );
    });

    cx.simulate_keystrokes("enter");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.overlay.is_none());
        assert_eq!(
            workspace.current(),
            Some(&path("Projects/Quarterly Plan.md"))
        );
    });
    assert_eq!(editor_text(&workspace, cx), "# Plan\n");
    // The note that was left got saved, and typing is back in the editor.
    assert_eq!(
        fs::read_to_string(dir.path().join("Home.md")).unwrap(),
        "xhome\n"
    );
    cx.simulate_keystrokes("y");
    assert_eq!(editor_text(&workspace, cx), "y# Plan\n");
}

#[gpui_kit::test]
fn escape_closes_the_quick_switcher_without_changing_notes(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(&[("Home.md", "home\n"), ("Other.md", "")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("o"));
    workspace.read_with(cx, |workspace, _| assert!(workspace.palette().is_some()));
    cx.simulate_keystrokes("escape");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.overlay.is_none());
        assert_eq!(workspace.current(), Some(&path("Home.md")));
    });
    cx.simulate_keystrokes("z");
    assert_eq!(editor_text(&workspace, cx), "zhome\n");
}

#[gpui_kit::test]
fn reading_view_shows_the_note_and_follows_its_links(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "# Home\n\nGo to [[Plan]] or [[Brand New]].\n"),
            ("Plan.md", "# Plan\n"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");

    cx.simulate_keystrokes(primary!("e"));
    workspace.read_with(cx, |workspace, _| {
        let (source, rendered) = workspace.tab().reading.as_ref().expect("reading view on");
        assert_eq!(source.as_ref(), "x# Home\n\nGo to [[Plan]] or [[Brand New]].\n");
        assert_eq!(
            rendered.as_ref(),
            "x# Home\n\nGo to [Plan](diamond://note/Plan) or [Brand New](diamond://note/Brand%20New).\n"
        );
    });
    cx.update(|window, cx| {
        window.render_frame(cx);
        let reading = window.find("reading-view").bounds();
        assert!(
            reading.size.width > px(100.) && reading.size.height > px(100.),
            "{reading:?}"
        );
    });

    // Clicking a link opens that note, still in the reading view, and
    // saves what was typed in the note being left.
    let click = |address: &str, cx: &mut VisualTestContext| {
        cx.update(|window, cx| {
            workspace.update(cx, |workspace, cx| workspace.open_link(address, window, cx));
        });
    };
    click("diamond://note/Plan", cx);
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(workspace.current(), Some(&path("Plan.md")));
        assert!(workspace.tab().reading.is_some());
    });
    assert!(
        fs::read_to_string(dir.path().join("Home.md"))
            .unwrap()
            .starts_with("x# Home")
    );
    cx.update(|window, cx| window.render_frame(cx));
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(
            workspace.tab().reading.as_ref().unwrap().1.as_ref(),
            "# Plan\n"
        );
    });

    // A link to a note that does not exist creates it.
    click("diamond://note/Brand%20New", cx);
    assert!(dir.path().join("Brand New.md").exists());
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(workspace.current(), Some(&path("Brand New.md")));
    });

    // Back to editing: typing reaches the editor again.
    cx.simulate_keystrokes(primary!("e"));
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_none())
    });
    cx.simulate_keystrokes("h i");
    assert_eq!(editor_text(&workspace, cx), "hi");
}

#[gpui_kit::test]
fn the_search_palette_opens_a_note_at_the_matching_line(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(
        &[
            ("Home.md", "home\n"),
            (
                "Deep/Report.md",
                "# Report\n\nintro\nthe needle is here\nend\n",
            ),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);

    // The shortcut works from inside the editor, which has its own
    // binding for the same key.
    cx.simulate_keystrokes(primary!("shift-f"));
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().expect("palette open");
        assert_eq!(palette.mode, PaletteMode::Search);
        assert!(palette.rows.is_empty());
    });

    cx.simulate_keystrokes("n e e d l e");
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().unwrap();
        assert_eq!(palette.rows.len(), 1, "{:?}", palette.rows);
        assert_eq!(
            note_row(palette, 0),
            ("Report  ·  the needle is here", "Deep/Report.md", Some(3))
        );
    });

    cx.simulate_keystrokes("enter");
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.overlay.is_none());
        assert_eq!(workspace.current(), Some(&path("Deep/Report.md")));
        let text = "# Report\n\nintro\n";
        assert_eq!(workspace.tab().editor.read(cx).cursor(), text.len());
    });
    // Typing lands on the matching line.
    cx.simulate_keystrokes("x");
    assert_eq!(
        editor_text(&workspace, cx),
        "# Report\n\nintro\nxthe needle is here\nend\n"
    );
}

fn current(workspace: &gpui_kit::Entity<Workspace>, cx: &mut VisualTestContext) -> Option<String> {
    workspace.read_with(cx, |workspace, _| {
        workspace.current().map(ToString::to_string)
    })
}

fn cursor(workspace: &gpui_kit::Entity<Workspace>, cx: &mut VisualTestContext) -> usize {
    workspace.read_with(cx, |workspace, cx| workspace.tab().editor.read(cx).cursor())
}

fn set_cursor(workspace: &gpui_kit::Entity<Workspace>, offset: usize, cx: &mut VisualTestContext) {
    cx.update(|_, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.tab().editor.update(cx, |editor, cx| {
                editor.set_selected_range(offset..offset, cx);
            });
        });
    });
}

/// How many rows the open palette shows after narrowing by what was typed.
fn matched(workspace: &gpui_kit::Entity<Workspace>, cx: &mut VisualTestContext) -> usize {
    workspace.read_with(cx, |workspace, cx| {
        workspace
            .palette()
            .expect("palette open")
            .state
            .read(cx)
            .matched_count()
    })
}

#[gpui_kit::test]
fn the_command_palette_lists_every_command_and_runs_the_chosen_one(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "home\n"),
            ("Templates/Daily.md", "# {{title}}\n"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);

    cx.simulate_keystrokes(primary!("shift-p"));
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().expect("palette open");
        assert_eq!(palette.mode, PaletteMode::Commands);
        // The built-in commands and the ones plugins add, in one list.
        assert_eq!(
            palette.rows.len(),
            COMMANDS.len() + workspace.commands.len()
        );
        assert!(!workspace.commands.is_empty());
    });
    let every_command =
        workspace.read_with(cx, |workspace, _| COMMANDS.len() + workspace.commands.len());
    assert_eq!(matched(&workspace, cx), every_command);

    // Typing narrows the list, by name or by keyword, and leaves the note
    // alone.
    cx.simulate_keystrokes("j o u r n a l");
    assert_eq!(matched(&workspace, cx), 1);
    assert_eq!(editor_text(&workspace, cx), "home\n");

    cx.simulate_keystrokes("enter");
    let today = Moment::now().date();
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.overlay.is_none());
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
    });
    assert_eq!(current(&workspace, cx), Some(format!("Daily/{today}.md")));
    assert_eq!(
        fs::read_to_string(dir.path().join(format!("Daily/{today}.md"))).unwrap(),
        format!("# {today}\n")
    );
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.expanded.contains("Daily"));
        let tree = workspace.tree.read(cx);
        assert!(tree.index_of(&format!("Daily/{today}.md").into()).is_some());
    });
    // The keyboard is back in the note.
    cx.simulate_keystrokes("x");
    assert_eq!(editor_text(&workspace, cx), format!("x# {today}\n"));
}

#[gpui_kit::test]
fn the_daily_note_shortcut_opens_the_same_note_again(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
    open_note(&workspace, "Home.md", cx);
    let today = Moment::now().date();
    let daily = dir.path().join(format!("Daily/{today}.md"));

    cx.simulate_keystrokes(primary!("shift-d"));
    assert_eq!(current(&workspace, cx), Some(format!("Daily/{today}.md")));
    // No template in this vault, so the note starts empty.
    assert_eq!(fs::read_to_string(&daily).unwrap(), "");

    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace
                .tab()
                .editor
                .update(cx, |editor, cx| editor.focus(window, cx));
        });
    });
    cx.simulate_keystrokes("k e p t");
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("shift-d"));
    assert_eq!(current(&workspace, cx), Some(format!("Daily/{today}.md")));
    assert_eq!(editor_text(&workspace, cx), "kept");
    assert_eq!(fs::read_to_string(&daily).unwrap(), "kept");
}

#[gpui_kit::test]
fn a_command_that_opens_the_rename_field_leaves_it_open(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n"), ("Other.md", "to [[Home]]\n")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("shift-p"));
    cx.simulate_keystrokes("r e n a m e");
    assert_eq!(matched(&workspace, cx), 1);
    cx.simulate_keystrokes("enter");
    workspace.read_with(cx, |workspace, cx| match &workspace.overlay {
        Some(Overlay::Rename(rename)) => {
            assert_eq!(rename.path, path("Home.md"));
            assert_eq!(rename.input.read(cx).value().as_ref(), "Home");
        }
        _ => panic!("the rename field should be open"),
    });

    // The name is selected, so typing replaces it.
    cx.simulate_keystrokes("s t a r t");
    cx.simulate_keystrokes("enter");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.overlay.is_none());
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
    });
    assert_eq!(current(&workspace, cx), Some("start.md".to_owned()));
    assert_eq!(
        fs::read_to_string(dir.path().join("Other.md")).unwrap(),
        "to [[start]]\n"
    );
}

#[gpui_kit::test]
fn f2_renames_the_open_note_and_rewrites_the_links_to_it(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "See [[Plan]] and [[Home]] itself.\n"),
            ("Plan.md", "Back to [[Home]].\n"),
        ],
        cx,
    );
    let read = |name: &str| fs::read_to_string(dir.path().join(name)).unwrap();
    open_note(&workspace, "Plan.md", cx);
    open_note(&workspace, "Home.md", cx);
    // An unsaved edit is saved as part of the rename.
    cx.simulate_keystrokes("x");

    cx.simulate_keystrokes("f2");
    cx.simulate_keystrokes("i n d e x");
    // Nothing happens until Enter.
    assert!(dir.path().join("Home.md").exists());
    assert_eq!(current(&workspace, cx), Some("Home.md".to_owned()));
    cx.simulate_keystrokes("enter");

    assert!(!dir.path().join("Home.md").exists());
    assert_eq!(read("index.md"), "xSee [[Plan]] and [[index]] itself.\n");
    assert_eq!(read("Plan.md"), "Back to [[index]].\n");
    assert_eq!(current(&workspace, cx), Some("index.md".to_owned()));
    // The editor shows the rewritten text and has nothing left to save.
    assert_eq!(
        editor_text(&workspace, cx),
        "xSee [[Plan]] and [[index]] itself.\n"
    );
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
        assert_eq!(
            workspace.notice.as_deref(),
            Some("Renamed to index.md; links updated in 2 notes")
        );
        assert!(
            !workspace
                .tab()
                .is_dirty(&workspace.tab().editor.read(cx).value())
        );
        let tree = workspace.tree.read(cx);
        assert!(tree.index_of(&"index.md".into()).is_some());
        assert!(tree.index_of(&"Home.md".into()).is_none());
    });
    // Typing still goes to the note, and nothing brings the old file back.
    cx.simulate_keystrokes("y");
    cx.executor().advance_clock(AUTOSAVE_DELAY * 2);
    cx.run_until_parked();
    assert!(!dir.path().join("Home.md").exists());
    assert!(read("index.md").contains('y'));

    // Going back and forward follows the note under its new name.
    cx.simulate_keystrokes(BACK_FORWARD.0);
    assert_eq!(current(&workspace, cx), Some("Plan.md".to_owned()));
    cx.simulate_keystrokes(BACK_FORWARD.1);
    assert_eq!(current(&workspace, cx), Some("index.md".to_owned()));
}

#[gpui_kit::test]
fn escape_closes_the_rename_field_without_renaming(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("f2");
    cx.simulate_keystrokes("z z");
    cx.simulate_keystrokes("escape");
    workspace.read_with(cx, |workspace, _| assert!(workspace.overlay.is_none()));
    assert!(dir.path().join("Home.md").exists());
    assert_eq!(current(&workspace, cx), Some("Home.md".to_owned()));
    cx.simulate_keystrokes("x");
    assert_eq!(editor_text(&workspace, cx), "xhome\n");
}

#[gpui_kit::test]
fn renaming_reports_bad_names_and_moves_into_folders(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "[[Projects/Plan]]\n"),
            ("Taken.md", ""),
            ("Projects/Plan.md", "p\n"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);
    let rename = |from: &str, name: &str, cx: &mut VisualTestContext| {
        cx.update(|window, cx| {
            workspace.update(cx, |workspace, cx| {
                workspace.rename_entry(&path(from), name, window, cx);
            });
        });
        workspace.read_with(cx, |workspace, _| {
            workspace.error.as_ref().map(ToString::to_string)
        })
    };

    assert_eq!(
        rename("Home.md", "Taken", cx),
        Some("Taken.md already exists".to_owned())
    );
    assert!(rename("Home.md", "  ", cx).is_some());
    assert!(rename("Home.md", "../outside", cx).is_some());
    assert!(dir.path().join("Home.md").exists());

    // A folder: its notes move, the links that named it follow, and it
    // stays open in the sidebar.
    cx.update(|_, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.reveal_in_tree(&path("Projects/Plan.md"), cx);
        });
    });
    assert_eq!(rename("Projects", "Work/Active", cx), None);
    assert_eq!(
        fs::read_to_string(dir.path().join("Work/Active/Plan.md")).unwrap(),
        "p\n"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("Home.md")).unwrap(),
        "[[Work/Active/Plan]]\n"
    );
    assert_eq!(editor_text(&workspace, cx), "[[Work/Active/Plan]]\n");
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.expanded.contains("Work/Active"));
        assert!(!workspace.expanded.contains("Projects"));
        let tree = workspace.tree.read(cx);
        assert!(tree.index_of(&"Work/Active/Plan.md".into()).is_some());
    });
}

#[gpui_kit::test]
fn renaming_waits_for_a_conflict_to_be_settled(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "base\n")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes("x");
    fs::write(dir.path().join("Home.md"), "theirs\n").unwrap();
    changed(&workspace, "Home.md", cx);

    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.rename_entry(&path("Home.md"), "New", window, cx);
        });
    });
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.error.is_some());
        assert!(workspace.tab().conflict.is_some());
    });
    assert_eq!(
        fs::read_to_string(dir.path().join("Home.md")).unwrap(),
        "theirs\n"
    );
    assert!(!dir.path().join("New.md").exists());
}

#[gpui_kit::test]
fn back_and_forward_return_to_earlier_notes_and_cursors(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("A.md", "alpha\n"),
            ("B.md", "bravo\n"),
            ("C.md", "charlie\n"),
            ("D.md", "delta\n"),
        ],
        cx,
    );
    let (back, forward) = BACK_FORWARD;

    // Nothing to go back to yet.
    cx.simulate_keystrokes(back);
    assert_eq!(current(&workspace, cx), None);

    open_note(&workspace, "A.md", cx);
    set_cursor(&workspace, 3, cx);
    open_note(&workspace, "B.md", cx);
    set_cursor(&workspace, 5, cx);
    open_note(&workspace, "C.md", cx);
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().history.can_go_back());
        assert!(!workspace.tab().history.can_go_forward());
    });

    cx.simulate_keystrokes(back);
    assert_eq!(current(&workspace, cx), Some("B.md".to_owned()));
    assert_eq!(cursor(&workspace, cx), 5);
    // Edits made on the way are saved like any other switch of notes.
    cx.simulate_keystrokes("x");
    cx.simulate_keystrokes(back);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));
    assert_eq!(cursor(&workspace, cx), 3);
    assert_eq!(
        fs::read_to_string(dir.path().join("B.md")).unwrap(),
        "bravox\n"
    );
    cx.simulate_keystrokes(back);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));

    cx.simulate_keystrokes(forward);
    assert_eq!(current(&workspace, cx), Some("B.md".to_owned()));
    assert_eq!(cursor(&workspace, cx), 6);

    // A note deleted in the meantime is stepped over.
    fs::remove_file(dir.path().join("C.md")).unwrap();
    changed(&workspace, "C.md", cx);
    cx.simulate_keystrokes(forward);
    assert_eq!(current(&workspace, cx), Some("B.md".to_owned()));

    // Going somewhere new from the middle forgets what was ahead.
    cx.simulate_keystrokes(back);
    open_note(&workspace, "D.md", cx);
    cx.simulate_keystrokes(forward);
    assert_eq!(current(&workspace, cx), Some("D.md".to_owned()));
    cx.simulate_keystrokes(back);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));
}

#[gpui_kit::test]
fn deleting_the_open_note_takes_it_out_of_the_history(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(&[("A.md", "a\n"), ("B.md", "b\n")], cx);
    open_note(&workspace, "A.md", cx);
    open_note(&workspace, "B.md", cx);
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.delete_entry(&path("B.md"), window, cx);
        });
    });
    assert_eq!(current(&workspace, cx), None);
    workspace.read_with(cx, |workspace, _| {
        assert!(!workspace.tab().history.can_go_forward());
        assert_eq!(workspace.notice.as_deref(), Some("Moved B.md to the trash"));
    });
}

#[gpui_kit::test]
fn a_template_is_inserted_at_the_cursor_and_saved(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "one two\n"),
            ("Templates/Daily.md", "daily\n"),
            ("Templates/Meeting.md", "[{{title}} on {{date}}]"),
        ],
        cx,
    );
    // With no note open there is nowhere to insert.
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.insert_template(&path("Templates/Meeting.md"), window, cx);
        });
    });
    workspace.read_with(cx, |workspace, _| assert!(workspace.error.is_some()));

    open_note(&workspace, "Home.md", cx);
    set_cursor(&workspace, 4, cx);
    cx.simulate_keystrokes(primary!("shift-t"));
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().expect("palette open");
        assert_eq!(palette.mode, PaletteMode::Templates);
        let names: Vec<&str> = palette.rows.iter().map(|row| row.label.as_ref()).collect();
        assert_eq!(names, vec!["Daily", "Meeting"]);
    });
    cx.simulate_keystrokes("m e e t");
    assert_eq!(matched(&workspace, cx), 1);
    cx.simulate_keystrokes("enter");

    let today = Moment::now().date();
    let expected = format!("one [Home on {today}]two\n");
    assert_eq!(editor_text(&workspace, cx), expected);
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.overlay.is_none());
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
        // Inserted text is saved like typed text.
        assert!(workspace.tab().autosave.is_some());
    });
    // The cursor is after what was inserted.
    cx.simulate_keystrokes("x");
    assert_eq!(
        editor_text(&workspace, cx),
        format!("one [Home on {today}]xtwo\n")
    );
    cx.executor()
        .advance_clock(AUTOSAVE_DELAY + Duration::from_millis(50));
    cx.run_until_parked();
    assert_eq!(
        fs::read_to_string(dir.path().join("Home.md")).unwrap(),
        format!("one [Home on {today}]xtwo\n")
    );
    // The template itself is untouched.
    assert_eq!(
        fs::read_to_string(dir.path().join("Templates/Meeting.md")).unwrap(),
        "[{{title}} on {{date}}]"
    );
}

#[gpui_kit::test]
fn the_template_palette_says_where_templates_go_when_there_are_none(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("shift-t"));
    workspace.read_with(cx, |workspace, _| {
        let palette = workspace.palette().expect("palette open");
        assert!(palette.rows.is_empty());
    });
    // Enter on the empty list does nothing; Escape closes it.
    cx.simulate_keystrokes("enter");
    cx.simulate_keystrokes("escape");
    workspace.read_with(cx, |workspace, _| assert!(workspace.overlay.is_none()));
    assert_eq!(editor_text(&workspace, cx), "home\n");
}

#[gpui_kit::test]
fn the_outline_tags_and_counts_follow_what_is_typed(cx: &mut TestAppContext) {
    let home = "---\ntags: [meta]\n---\n# Top\n\nsome words here #alpha\n\n## Sub\n";
    let (_dir, workspace, cx) = open(&[("Home.md", home), ("Other.md", "also #alpha\n")], cx);
    let outline = |cx: &mut VisualTestContext| {
        workspace.read_with(cx, |workspace, _| {
            workspace
                .tab()
                .live
                .meta
                .headings
                .iter()
                .map(|heading| heading.text.clone())
                .collect::<Vec<_>>()
        })
    };
    // Nothing is open: nothing to count.
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(
            (workspace.tab().live.words, workspace.tab().live.characters),
            (0, 0)
        );
    });

    open_note(&workspace, "Home.md", cx);
    assert_eq!(outline(cx), vec!["Top", "Sub"]);
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(workspace.tab().live.meta.all_tags(), vec!["meta", "alpha"]);
        // The properties block and bare markers are not words.
        assert_eq!(workspace.tab().live.words, 6);
    });

    // Typing a new heading shows up before anything is saved.
    let end = home.len();
    set_cursor(&workspace, end, cx);
    cx.simulate_keystrokes("# space n e w");
    assert_eq!(outline(cx), vec!["Top", "Sub", "new"]);
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.tab().live.words, 7));

    // Clicking a heading puts the cursor on it, leaving the reading view
    // if that is where the click came from.
    cx.simulate_keystrokes(primary!("e"));
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_some())
    });
    let sub = home.find("## Sub").unwrap();
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| workspace.jump_to(sub, window, cx));
    });
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_none())
    });
    assert_eq!(cursor(&workspace, cx), sub);
    cx.simulate_keystrokes("x");
    assert!(editor_text(&workspace, cx).contains("\nx## Sub\n"));
    assert_eq!(outline(cx), vec!["Top", "new"]);

    // Closing the note clears the panel.
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.delete_entry(&path("Home.md"), window, cx);
        });
    });
    assert!(outline(cx).is_empty());
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.tab().live.words, 0));
}

#[gpui_kit::test]
fn clicking_a_tag_lists_the_notes_that_carry_it(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(
        &[
            ("Home.md", "home #project/active\n"),
            ("Other.md", "also #project\n"),
            ("Plain.md", "no tags, just the word project\n"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.search_tag("project", window, cx)
        });
    });
    workspace.read_with(cx, |workspace, cx| {
        let palette = workspace.palette().expect("palette open");
        assert_eq!(palette.mode, PaletteMode::Search);
        assert_eq!(palette.state.read(cx).query(cx).as_ref(), "tag:project");
        let notes: Vec<&str> = (0..palette.rows.len())
            .map(|row| note_row(palette, row).1)
            .collect();
        assert_eq!(notes, vec!["Home.md", "Other.md"]);
    });

    // The query can be refined, and Enter opens the chosen note.
    cx.simulate_keystrokes("down");
    cx.simulate_keystrokes("enter");
    assert_eq!(current(&workspace, cx), Some("Other.md".to_owned()));
}

#[gpui_kit::test]
fn the_theme_switch_changes_every_window_and_is_remembered(cx: &mut TestAppContext) {
    let config = tempfile::tempdir().unwrap();
    let settings = config.path().join("settings.toml");
    let (_dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
    cx.update(|_, cx| {
        assert_eq!(
            crate::app::init(Some(config.path().to_path_buf()), cx),
            None
        );
    });
    open_note(&workspace, "Home.md", cx);
    let dark = |cx: &mut VisualTestContext| cx.update(|_, cx| Theme::global(cx).is_dark());
    let was_dark = dark(cx);

    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| workspace.toggle_theme(window, cx));
    });
    assert_eq!(dark(cx), !was_dark);
    let expected = if was_dark { "light" } else { "dark" };
    assert_eq!(
        fs::read_to_string(&settings).unwrap(),
        format!("appearance = \"{expected}\"\n")
    );
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
    });

    // Through the command palette, the way a user reaches it.
    cx.simulate_keystrokes(primary!("shift-p"));
    cx.simulate_keystrokes("l i g h t space a n d");
    assert_eq!(matched(&workspace, cx), 1);
    cx.simulate_keystrokes("enter");
    assert_eq!(dark(cx), was_dark);

    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| workspace.use_system_theme(window, cx));
    });
    assert_eq!(
        fs::read_to_string(&settings).unwrap(),
        "appearance = \"system\"\n"
    );

    // A settings file that cannot be read is never overwritten; the switch
    // still happens and the reason it was not remembered is shown.
    fs::write(&settings, "appearance = [").unwrap();
    let before = dark(cx);
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| workspace.toggle_theme(window, cx));
    });
    assert_eq!(dark(cx), !before);
    assert_eq!(fs::read_to_string(&settings).unwrap(), "appearance = [");
    workspace.read_with(cx, |workspace, _| assert!(workspace.error.is_some()));
}

#[gpui_kit::test]
fn a_new_note_can_be_made_inside_a_folder(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("Home.md", "home\n"), ("Work/Plan.md", "")], cx);
    open_note(&workspace, "Home.md", cx);
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.new_note(Some("Work"), window, cx);
        });
    });
    assert_eq!(current(&workspace, cx), Some("Work/Untitled.md".to_owned()));
    assert!(dir.path().join("Work/Untitled.md").exists());
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.expanded.contains("Work"));
        let tree = workspace.tree.read(cx);
        assert!(tree.index_of(&"Work/Untitled.md".into()).is_some());
    });
    cx.simulate_keystrokes("h i");
    assert_eq!(editor_text(&workspace, cx), "hi");
}

#[gpui_kit::test]
fn the_status_line_and_its_parts_are_laid_out(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "four words right here\n"),
            (".diamond/settings.toml", "[daily"),
        ],
        cx,
    );
    open_note(&workspace, "Home.md", cx);
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(workspace.tab().live.words, 4);
        // A settings file that cannot be read is reported, not ignored.
        assert!(workspace.session.settings_problem().is_some());
    });
    cx.update(|window, cx| {
        window.render_frame(cx);
        let pane = window.find("editor-pane").bounds();
        let status = window.find("status-line").bounds();
        assert!(status.size.height > px(10.), "{status:?}");
        assert!(
            (status.bottom() - pane.bottom()).abs() <= px(2.),
            "{status:?} in {pane:?}"
        );
        assert!(
            (status.size.width - pane.size.width).abs() <= px(2.),
            "{status:?}"
        );
    });

    // Fixing the file and reloading clears the report.
    fs::write(
        dir.path().join(".diamond/settings.toml"),
        "[daily]\nfolder = \"Journal\"\n",
    )
    .unwrap();
    cx.update(|_, cx| {
        workspace.update(cx, |workspace, cx| workspace.reload_settings(cx));
    });
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.session.settings_problem().is_none());
        assert_eq!(workspace.notice.as_deref(), Some("Vault settings reloaded"));
    });
    cx.simulate_keystrokes(primary!("shift-d"));
    assert!(current(&workspace, cx).unwrap().starts_with("Journal/"));
}

fn tab_titles(
    workspace: &gpui_kit::Entity<Workspace>,
    cx: &mut VisualTestContext,
) -> Vec<Vec<String>> {
    workspace.read_with(cx, |workspace, _| {
        workspace
            .panes
            .iter()
            .map(|pane| {
                pane.tabs
                    .iter()
                    .map(|tab| {
                        let name = tab.path().map_or("-", |path| path.stem());
                        let front = std::ptr::eq(tab, pane.tab());
                        format!("{}{name}", if front { "*" } else { "" })
                    })
                    .collect()
            })
            .collect()
    })
}

fn open_in_new_tab(
    workspace: &gpui_kit::Entity<Workspace>,
    name: &str,
    cx: &mut VisualTestContext,
) {
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.open_in_new_tab(&path(name), window, cx);
        });
    });
}

#[gpui_kit::test]
fn tabs_open_switch_and_close_keeping_each_notes_text(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("A.md", "alpha\n"),
            ("B.md", "bravo\n"),
            ("C.md", "charlie\n"),
        ],
        cx,
    );
    let read = |name: &str| fs::read_to_string(dir.path().join(name)).unwrap();
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*-"]]);

    open_note(&workspace, "A.md", cx);
    open_in_new_tab(&workspace, "B.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*B"]]);
    assert_eq!(editor_text(&workspace, cx), "bravo\n");

    // Typing lands in the tab in front; switching tabs saves it and shows
    // the other note with its own text.
    cx.simulate_keystrokes("x");
    workspace.read_with(cx, |workspace, _| assert!(workspace.tab().dirty));
    cx.simulate_keystrokes("ctrl-tab");
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A", "B"]]);
    assert_eq!(editor_text(&workspace, cx), "alpha\n");
    assert_eq!(read("B.md"), "xbravo\n");
    cx.simulate_keystrokes("y");
    assert_eq!(editor_text(&workspace, cx), "yalpha\n");
    cx.simulate_keystrokes("ctrl-shift-tab");
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*B"]]);
    assert_eq!(editor_text(&workspace, cx), "xbravo\n");
    assert_eq!(read("A.md"), "yalpha\n");

    // The sidebar marks the note in front, whichever way it got there.
    let marked = |cx: &mut VisualTestContext| {
        workspace.read_with(cx, |workspace, cx| {
            workspace
                .tree
                .read(cx)
                .selected_item()
                .map(|item| item.id.to_string())
        })
    };
    assert_eq!(marked(cx), Some("B.md".to_owned()));

    // A new tab is empty and goes beside the one in front.
    cx.simulate_keystrokes("ctrl-tab");
    assert_eq!(marked(cx), Some("A.md".to_owned()));
    cx.simulate_keystrokes(primary!("t"));
    assert_eq!(marked(cx), None);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*-", "B"]]);
    assert_eq!(current(&workspace, cx), None);
    assert_eq!(editor_text(&workspace, cx), "");
    open_note(&workspace, "C.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*C", "B"]]);

    // Opening a note that already has a tab goes to that tab.
    open_note(&workspace, "B.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "C", "*B"]]);
    open_in_new_tab(&workspace, "A.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A", "C", "B"]]);

    // Closing saves, and the neighbour comes to the front. The cursor was
    // where it had been left in this tab, after the "y".
    cx.simulate_keystrokes("z");
    cx.simulate_keystrokes(primary!("w"));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*C", "B"]]);
    assert_eq!(read("A.md"), "yzalpha\n");
    cx.simulate_keystrokes("ctrl-tab");
    cx.simulate_keystrokes(primary!("w"));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*C"]]);
    // The last tab is replaced by an empty one rather than leaving nothing.
    cx.simulate_keystrokes(primary!("w"));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*-"]]);
    // An empty tab has no editor to type into, but shortcuts still work.
    cx.simulate_keystrokes("q");
    assert_eq!(editor_text(&workspace, cx), "");
    assert_eq!(read("C.md"), "charlie\n");
    cx.simulate_keystrokes(primary!("o"));
    workspace.read_with(cx, |workspace, _| assert!(workspace.palette().is_some()));
}

#[gpui_kit::test]
fn each_tab_has_its_own_history_and_view(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(&[("A.md", "a\n"), ("B.md", "b\n"), ("C.md", "c\n")], cx);
    open_note(&workspace, "A.md", cx);
    open_note(&workspace, "B.md", cx);
    open_in_new_tab(&workspace, "C.md", cx);
    // The new tab has nowhere to go back to; the first one does.
    cx.simulate_keystrokes(BACK_FORWARD.0);
    assert_eq!(current(&workspace, cx), Some("C.md".to_owned()));
    cx.simulate_keystrokes(primary!("e"));
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_some())
    });

    cx.simulate_keystrokes("ctrl-tab");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_none())
    });
    cx.simulate_keystrokes(BACK_FORWARD.0);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A", "C"]]);
    // Typing still works here, and the other tab is still being read.
    cx.simulate_keystrokes("x");
    assert_eq!(editor_text(&workspace, cx), "xa\n");
    cx.simulate_keystrokes("ctrl-tab");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_some())
    });
}

#[gpui_kit::test]
fn split_right_shows_the_same_note_twice_and_keeps_both_in_step(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("A.md", "alpha\n"), ("B.md", "bravo\n")], cx);
    let read = |name: &str| fs::read_to_string(dir.path().join(name)).unwrap();
    open_note(&workspace, "A.md", cx);
    cx.simulate_keystrokes("x");

    cx.simulate_keystrokes(primary!("\\"));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A"], vec!["*A"]]);
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.active_pane, 1));
    // The split saved what was typed, so both panes start from the same text.
    assert_eq!(read("A.md"), "xalpha\n");
    assert_eq!(editor_text(&workspace, cx), "xalpha\n");

    let texts = |cx: &mut VisualTestContext| {
        workspace.read_with(cx, |workspace, cx| {
            workspace
                .panes
                .iter()
                .map(|pane| pane.tab().editor.read(cx).value().to_string())
                .collect::<Vec<_>>()
        })
    };
    // Typing in the right pane shows in the left one at once, before
    // anything is saved.
    cx.simulate_keystrokes("y");
    assert_eq!(texts(cx), vec!["yxalpha\n", "yxalpha\n"]);
    assert_eq!(read("A.md"), "xalpha\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.panes.iter().all(|pane| pane.tab().dirty));
    });
    // One save settles both.
    cx.executor()
        .advance_clock(AUTOSAVE_DELAY + Duration::from_millis(50));
    cx.run_until_parked();
    assert_eq!(read("A.md"), "yxalpha\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.panes.iter().all(|pane| !pane.tab().dirty));
        assert!(
            workspace
                .panes
                .iter()
                .all(|pane| pane.tab().conflict.is_none())
        );
    });

    // F6 moves the keyboard to the other pane, which kept its own cursor.
    cx.simulate_keystrokes("f6");
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.active_pane, 0));
    cx.simulate_keystrokes("z");
    assert_eq!(texts(cx), vec!["yzxalpha\n", "yzxalpha\n"]);

    // Typing on both sides in turn never ends in a conflict.
    cx.simulate_keystrokes("shift-f6");
    cx.simulate_keystrokes("w");
    cx.simulate_keystrokes(primary!("s"));
    assert_eq!(read("A.md"), "ywzxalpha\n");
    assert_eq!(texts(cx), vec!["ywzxalpha\n", "ywzxalpha\n"]);
    workspace.read_with(cx, |workspace, _| {
        assert!(
            workspace
                .panes
                .iter()
                .all(|pane| pane.tab().conflict.is_none() && !pane.tab().dirty)
        );
    });

    // A different note can go in either pane.
    open_note(&workspace, "B.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A"], vec!["*B"]]);

    // Closing a pane's last tab closes the pane.
    cx.simulate_keystrokes(primary!("w"));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*A"]]);
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.active_pane, 0));
}

#[gpui_kit::test]
fn panes_share_the_space_between_the_side_panels(cx: &mut TestAppContext) {
    let (_dir, workspace, cx) = open(&[("A.md", "alpha\n")], cx);
    open_note(&workspace, "A.md", cx);
    cx.simulate_keystrokes(primary!("\\"));
    cx.update(|window, cx| {
        window.render_frame(cx);
        let whole = window.find("editor-pane").bounds();
        let left = window.find(("pane", 0usize)).bounds();
        let right = window.find(("pane", 1usize)).bounds();
        let status = window.find("status-line").bounds();
        let near = |a: Pixels, b: Pixels| (a - b).abs() <= px(3.);
        assert!(near(left.left(), whole.left()), "{left:?} in {whole:?}");
        assert!(near(right.right(), whole.right()), "{right:?} in {whole:?}");
        assert!(left.right() <= right.left() + px(1.), "{left:?} {right:?}");
        assert!(left.size.width > px(100.) && right.size.width > px(100.));
        // Both sit above the one status line.
        assert!(near(left.bottom(), status.top()), "{left:?} {status:?}");
        assert!(near(right.bottom(), status.top()), "{right:?} {status:?}");
    });
}

#[gpui_kit::test]
fn renames_and_deletes_reach_every_tab(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[
            ("Work/A.md", "to [[Work/B]]\n"),
            ("Work/B.md", "bravo\n"),
            ("C.md", "to [[Work/A]]\n"),
        ],
        cx,
    );
    open_note(&workspace, "Work/A.md", cx);
    open_in_new_tab(&workspace, "Work/B.md", cx);
    open_in_new_tab(&workspace, "C.md", cx);
    // An unsaved edit in a tab that is not in front.
    cx.simulate_keystrokes("x");
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| workspace.activate(0, 0, window, cx));
    });

    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.rename_entry(&path("Work"), "Job", window, cx);
        });
    });
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
        let paths: Vec<&str> = workspace.panes[0]
            .tabs
            .iter()
            .map(|tab| tab.path().unwrap().as_str())
            .collect();
        assert_eq!(paths, vec!["Job/A.md", "Job/B.md", "C.md"]);
        let texts: Vec<String> = workspace.panes[0]
            .tabs
            .iter()
            .map(|tab| tab.editor.read(cx).value().to_string())
            .collect();
        assert_eq!(texts, vec!["to [[Job/B]]\n", "bravo\n", "xto [[Job/A]]\n"]);
        assert!(workspace.panes[0].tabs.iter().all(|tab| !tab.dirty));
    });
    assert_eq!(
        fs::read_to_string(dir.path().join("C.md")).unwrap(),
        "xto [[Job/A]]\n"
    );

    // Deleting the folder empties the tabs that showed its notes.
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.delete_entry(&path("Job"), window, cx);
        });
    });
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*-", "-", "C"]]);
    assert_eq!(editor_text(&workspace, cx), "");
    // Nothing brings the files back.
    cx.executor().advance_clock(AUTOSAVE_DELAY * 3);
    cx.run_until_parked();
    assert!(!dir.path().join("Job").exists());
}

#[gpui_kit::test]
fn an_outside_edit_reaches_tabs_that_are_not_in_front(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("A.md", "alpha\n"), ("B.md", "bravo\n")], cx);
    open_note(&workspace, "A.md", cx);
    open_in_new_tab(&workspace, "B.md", cx);
    fs::write(dir.path().join("A.md"), "from elsewhere\n").unwrap();
    changed(&workspace, "A.md", cx);
    assert_eq!(editor_text(&workspace, cx), "bravo\n");
    cx.simulate_keystrokes("ctrl-tab");
    assert_eq!(editor_text(&workspace, cx), "from elsewhere\n");
    workspace.read_with(cx, |workspace, _| {
        assert!(!workspace.tab().dirty);
        assert!(workspace.tab().conflict.is_none());
    });
}

#[gpui_kit::test]
fn unsaved_edits_are_written_when_the_window_goes_away(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(&[("A.md", "alpha\n"), ("B.md", "bravo\n")], cx);
    open_note(&workspace, "A.md", cx);
    cx.simulate_keystrokes("x");
    open_in_new_tab(&workspace, "B.md", cx);
    cx.simulate_keystrokes("y");
    // Neither autosave has run yet for B; A was saved on the switch.
    assert_eq!(
        fs::read_to_string(dir.path().join("B.md")).unwrap(),
        "bravo\n"
    );
    cx.update(|_, cx| {
        workspace.update(cx, |workspace, cx| workspace.save_on_the_way_out(cx));
    });
    assert_eq!(
        fs::read_to_string(dir.path().join("A.md")).unwrap(),
        "xalpha\n"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("B.md")).unwrap(),
        "ybravo\n"
    );
}

#[gpui_kit::test]
fn a_plugin_adds_a_command_a_shortcut_and_a_panel_section(cx: &mut TestAppContext) {
    use crate::plugins::bookmarks::Bookmarks;

    let (dir, workspace, cx) = open(
        &[
            ("Home.md", "home\n"),
            ("Work/Plan.md", "---\ntitle: The Plan\n---\n"),
        ],
        cx,
    );
    let stored = dir.path().join(".diamond/bookmarks.toml");
    let bookmarked = |cx: &mut VisualTestContext| {
        workspace.read_with(cx, |workspace, _| {
            workspace.plugins[0].sections(&workspace.session, None)[0]
                .rows
                .iter()
                .map(|row| row.label.clone())
                .collect::<Vec<_>>()
        })
    };
    // With no note open the command explains itself instead of failing.
    cx.simulate_keystrokes(primary!("d"));
    workspace.read_with(cx, |workspace, _| assert!(workspace.error.is_some()));
    assert!(!stored.exists());

    // The shortcut bookmarks the note in front and writes the plugin's file.
    open_note(&workspace, "Work/Plan.md", cx);
    cx.simulate_keystrokes(primary!("d"));
    assert_eq!(bookmarked(cx), vec!["The Plan"]);
    assert_eq!(
        fs::read_to_string(&stored).unwrap(),
        "notes = [\"Work/Plan.md\"]\n"
    );
    workspace.read_with(cx, |workspace, _| {
        assert!(
            workspace
                .plugin::<Bookmarks>()
                .unwrap()
                .contains(&path("Work/Plan.md"))
        );
        assert_eq!(workspace.notice.as_deref(), Some("Bookmarked Work/Plan.md"));
    });

    // The same command is in the palette, found by a keyword.
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("shift-p"));
    cx.simulate_keystrokes("f a v o u r");
    assert_eq!(matched(&workspace, cx), 1);
    cx.simulate_keystrokes("enter");
    assert_eq!(bookmarked(cx), vec!["The Plan", "Home"]);
    workspace.read_with(cx, |workspace, _| assert!(workspace.overlay.is_none()));

    // Bookmarks follow a rename and forget a deleted note.
    cx.update(|window, cx| {
        workspace.update(cx, |workspace, cx| {
            workspace.rename_entry(&path("Work"), "Job", window, cx);
            workspace.delete_entry(&path("Home.md"), window, cx);
        });
    });
    assert_eq!(
        fs::read_to_string(&stored).unwrap(),
        "notes = [\"Job/Plan.md\"]\n"
    );
    // Pressing the shortcut again removes the bookmark.
    open_note(&workspace, "Job/Plan.md", cx);
    cx.simulate_keystrokes(primary!("d"));
    assert!(bookmarked(cx).is_empty());
}
