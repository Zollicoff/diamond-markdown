//! Clicks and drags on the real views: what a person does with the mouse,
//! sent through the window's own hit testing.

use super::*;

/// Clicks the element with this id.
fn click(id: impl Into<gpui_kit::ElementId>, cx: &mut VisualTestContext) {
    let id = id.into();
    cx.update(|window, cx| {
        window.render_frame(cx);
        window.click(id, cx);
        window.render_frame(cx);
    });
}

/// Clicks a row of the sidebar by the path it shows.
fn click_in_sidebar(
    workspace: &gpui_kit::Entity<Workspace>,
    name: &str,
    cx: &mut VisualTestContext,
) {
    let row = workspace.read_with(cx, |workspace, cx| {
        workspace
            .tree
            .read(cx)
            .index_of(&name.to_owned().into())
            .unwrap_or_else(|| panic!("{name} is not showing in the sidebar"))
    });
    cx.update(|window, cx| {
        window.render_frame(cx);
        window.click(("file", row), cx);
        window.render_frame(cx);
    });
}

#[gpui_kit::test]
fn the_sidebar_tabs_and_bars_answer_to_clicks(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[("A.md", "alpha\n"), ("B.md", "bravo\n"), ("pic.png", "")],
        cx,
    );
    click_in_sidebar(&workspace, "A.md", cx);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));
    click_in_sidebar(&workspace, "B.md", cx);
    assert_eq!(current(&workspace, cx), Some("B.md".to_owned()));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*B"]]);

    // Back and forward buttons.
    click(("go-back", 0usize), cx);
    assert_eq!(current(&workspace, cx), Some("A.md".to_owned()));
    click(("go-forward", 0usize), cx);
    assert_eq!(current(&workspace, cx), Some("B.md".to_owned()));

    // The plus beside the tabs, then a tab, then a tab's close button.
    click(("new-tab", 0usize), cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["B", "*-"]]);
    click_in_sidebar(&workspace, "A.md", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["B", "*A"]]);
    cx.update(|window, cx| {
        window.within(("tabs", 0usize)).click(0usize, cx);
        window.render_frame(cx);
    });
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*B", "A"]]);
    let second = workspace.read_with(cx, |workspace, _| workspace.panes[0].tabs[1].id);
    click(("close-tab", second), cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*B"]]);

    // The plus in the sidebar makes a note and opens it.
    click("new-note", cx);
    assert_eq!(current(&workspace, cx), Some("Untitled.md".to_owned()));
    assert!(dir.path().join("Untitled.md").exists());

    // The status line's switches.
    click("toggle-reading", cx);
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_some())
    });
    click("toggle-reading", cx);
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.tab().reading.is_none())
    });
    let dark = cx.update(|_, cx| Theme::global(cx).is_dark());
    click("toggle-theme", cx);
    assert_eq!(cx.update(|_, cx| Theme::global(cx).is_dark()), !dark);

    // A click in another pane brings that pane to the front.
    click_in_sidebar(&workspace, "A.md", cx);
    cx.simulate_keystrokes(primary!("\\"));
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.active_pane, 1));
    click(("new-tab", 0usize), cx);
    workspace.read_with(cx, |workspace, _| {
        assert_eq!(workspace.active_pane, 0);
        assert_eq!(workspace.panes[0].tabs.len(), 2);
    });
    cx.simulate_keystrokes(primary!("w"));
    cx.simulate_keystrokes("f6");
    cx.simulate_keystrokes(primary!("w"));
    workspace.read_with(cx, |workspace, _| assert_eq!(workspace.panes.len(), 1));

    // A picture in the sidebar opens in a tab.
    click_in_sidebar(&workspace, "pic.png", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*pic.png"]]);
}

#[gpui_kit::test]
fn the_context_panel_answers_to_clicks(cx: &mut TestAppContext) {
    let home = "---\nstatus: open\n---\n# Top\n\ntext #alpha\n\n## Lower\n";
    let (dir, workspace, cx) = open(
        &[("Home.md", home), ("Other.md", "to [[Home]] #alpha\n")],
        cx,
    );
    open_note(&workspace, "Home.md", cx);

    // A heading in the outline puts the cursor on it.
    click(("outline", 1usize), cx);
    assert_eq!(cursor(&workspace, cx), home.find("## Lower").unwrap());

    // A backlink opens the note that links here.
    click(("backlink", 0usize), cx);
    assert_eq!(current(&workspace, cx), Some("Other.md".to_owned()));

    // A tag lists the notes carrying it.
    click(("tag", 0usize), cx);
    workspace.read_with(cx, |workspace, cx| {
        let palette = workspace.palette().expect("the search palette opens");
        assert_eq!(palette.state.read(cx).query(cx).as_ref(), "tag:alpha");
        assert_eq!(palette.rows.len(), 2);
    });
    cx.simulate_keystrokes("escape");

    // The rows plugins add: a property asks for its value, and a bookmark
    // opens its note. Rows are numbered by section and place.
    open_note(&workspace, "Home.md", cx);
    cx.simulate_keystrokes(primary!("d"));
    click(("plugin-row", 0usize), cx);
    workspace.read_with(cx, |workspace, _| match &workspace.overlay {
        Some(Overlay::Prompt(prompt)) => assert_eq!(prompt.title.as_ref(), "Set status"),
        _ => panic!("clicking a property should ask for its value"),
    });
    cx.simulate_keystrokes("d o n e enter");
    cx.executor()
        .advance_clock(AUTOSAVE_DELAY + Duration::from_millis(50));
    cx.run_until_parked();
    assert!(
        fs::read_to_string(dir.path().join("Home.md"))
            .unwrap()
            .starts_with("---\nstatus: done\n---\n")
    );
    open_note(&workspace, "Other.md", cx);
    click(("plugin-row", 10_000usize), cx);
    assert_eq!(current(&workspace, cx), Some("Home.md".to_owned()));
}

#[gpui_kit::test]
fn the_plugin_views_answer_to_clicks(cx: &mut TestAppContext) {
    let board = "## To do\n\n- [ ] Write copy\n- Book venue\n\n## Done\n";
    let (dir, workspace, cx) = open(
        &[
            ("Launch.md", board),
            ("Home.md", "[[Launch]]\n"),
            ("Templates/Daily.md", "{{date}}\n"),
        ],
        cx,
    );
    let read = |name: &str| fs::read_to_string(dir.path().join(name)).unwrap();

    // Tasks: the box ticks the task in its note, the row opens the note.
    run_command("show tasks", &workspace, cx);
    click(("task-box", 0usize), cx);
    assert_eq!(
        read("Launch.md"),
        "## To do\n\n- [x] Write copy\n- Book venue\n\n## Done\n"
    );
    click("tasks-with-done", cx);
    click(("task", 0usize), cx);
    assert_eq!(current(&workspace, cx), Some("Launch.md".to_owned()));
    assert_eq!(cursor(&workspace, cx), "## To do\n\n".len());

    // Board: the arrow moves the card, and "Add a card" asks for its text.
    run_command("as a board", &workspace, cx);
    click(("card-right", 0usize), cx);
    assert_eq!(
        read("Launch.md"),
        "## To do\n\n- Book venue\n\n## Done\n- [x] Write copy\n"
    );
    click(("add-card", 0usize), cx);
    cx.simulate_keystrokes("n e w enter");
    assert_eq!(
        read("Launch.md"),
        "## To do\n\n- Book venue\n- new\n\n## Done\n- [x] Write copy\n"
    );

    // Calendar: a day opens its daily note, made from the template.
    run_command("show calendar", &workspace, cx);
    click(("calendar-day", 15usize), cx);
    let now = Moment::now();
    let daily = format!("Daily/{:04}-{:02}-15.md", now.year, now.month);
    assert_eq!(current(&workspace, cx), Some(daily.clone()));
    assert_eq!(
        read(&daily),
        format!("{:04}-{:02}-15\n", now.year, now.month)
    );

    // The calendar's own buttons turn the month and come back to today.
    run_command("show calendar", &workspace, cx);
    click("calendar-next", cx);
    click("calendar-next", cx);
    click("calendar-previous", cx);
    click("calendar-today", cx);
    click(("calendar-day", 16usize), cx);
    assert_eq!(
        current(&workspace, cx),
        Some(format!("Daily/{:04}-{:02}-16.md", now.year, now.month))
    );

    // Graph: a dot opens its note.
    open_note(&workspace, "Home.md", cx);
    run_command("show graph", &workspace, cx);
    click("graph-scope", cx);
    click("graph-scope", cx);
    click(("graph-note", 1usize), cx);
    assert_eq!(current(&workspace, cx), Some("Launch.md".to_owned()));
    workspace.read_with(cx, |workspace, _| {
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
    });
}

#[gpui_kit::test]
fn a_canvas_answers_to_clicks_and_drags(cx: &mut TestAppContext) {
    use crate::plugins::canvas::Canvas;

    let start = "[[card]]\nid = 1\nx = 40.0\ny = 40.0\ntext = \"An idea\"\n\n[[card]]\nid = 2\nx = 400.0\ny = 40.0\nnote = \"Plan\"\n";
    let (dir, workspace, cx) = open(&[("Plan.md", "# Plan\n"), ("Map.canvas.toml", start)], cx);
    let stored =
        || Canvas::parse(&fs::read_to_string(dir.path().join("Map.canvas.toml")).unwrap()).unwrap();
    click_in_sidebar(&workspace, "Map.canvas.toml", cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["*Map"]]);

    // Dragging a card by its top strip moves it, and the file follows.
    cx.update(|window, cx| {
        window.render_frame(cx);
        let handle = window.find(("canvas-handle", 1usize)).bounds();
        // The left of the strip: its right end holds the buttons.
        let from = gpui_kit::point(handle.left() + px(20.), handle.center().y);
        window.drag(
            from,
            gpui_kit::point(from.x + px(120.), from.y + px(70.)),
            cx,
        );
        window.render_frame(cx);
    });
    let moved = stored();
    assert_eq!((moved.cards[0].x, moved.cards[0].y), (160., 110.));
    assert_eq!((moved.cards[1].x, moved.cards[1].y), (400., 40.));

    // "link" on two cards joins them; doing it again removes the line.
    click(("canvas-link", 1usize), cx);
    click(("canvas-link", 2usize), cx);
    assert_eq!(stored().links.len(), 1);
    click(("canvas-link", 2usize), cx);
    click(("canvas-link", 1usize), cx);
    assert!(stored().links.is_empty());

    // Adding a card asks for its text.
    click("canvas-add", cx);
    cx.simulate_keystrokes("t h i r d enter");
    let added = stored();
    assert_eq!(added.cards.len(), 3);
    assert_eq!(added.cards[2].text, "third");

    // Removing one.
    click(("canvas-remove", 1usize), cx);
    assert_eq!(stored().cards.len(), 2);

    // A file changed by another program is never overwritten: the change
    // made here is dropped, the file's version is shown, and that is said.
    let theirs = "[[card]]\nid = 2\nx = 10.0\ny = 10.0\nnote = \"Plan\"\n\n[[card]]\nid = 9\nx = 300.0\ny = 10.0\ntext = \"From elsewhere\"\n";
    fs::write(dir.path().join("Map.canvas.toml"), theirs).unwrap();
    click(("canvas-remove", 2usize), cx);
    assert_eq!(
        fs::read_to_string(dir.path().join("Map.canvas.toml")).unwrap(),
        theirs
    );
    workspace.read_with(cx, |workspace, _| {
        let error = workspace.error.as_ref().expect("the conflict is reported");
        assert!(error.contains("changed by another program"), "{error}");
    });
    // The card from elsewhere is on screen now and can be worked with.
    click(("canvas-remove", 9usize), cx);
    assert_eq!(stored().cards.len(), 1);

    // Following a note card to its note.
    click(("canvas-note", 2usize), cx);
    assert_eq!(current(&workspace, cx), Some("Plan.md".to_owned()));
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["Map", "*Plan"]]);
}

/// Right-clicks a row of the sidebar and picks the item at this place in
/// its menu, counting from one, with the arrow keys and Enter.
fn choose_in_menu(
    workspace: &gpui_kit::Entity<Workspace>,
    name: &str,
    place: usize,
    cx: &mut VisualTestContext,
) {
    let row = workspace.read_with(cx, |workspace, cx| {
        workspace
            .tree
            .read(cx)
            .index_of(&name.to_owned().into())
            .unwrap_or_else(|| panic!("{name} is not showing in the sidebar"))
    });
    cx.update(|window, cx| {
        window.render_frame(cx);
        window.right_click(("file", row), cx);
        window.render_frame(cx);
    });
    for _ in 0..place {
        cx.simulate_keystrokes("down");
    }
    cx.simulate_keystrokes("enter");
    cx.update(|window, cx| window.render_frame(cx));
}

#[gpui_kit::test]
fn the_sidebar_menu_answers_to_clicks(cx: &mut TestAppContext) {
    let (dir, workspace, cx) = open(
        &[("A.md", "to [[B]]\n"), ("B.md", "b\n"), ("Dir/C.md", "c\n")],
        cx,
    );
    let read = |name: &str| fs::read_to_string(dir.path().join(name)).unwrap();
    click_in_sidebar(&workspace, "A.md", cx);

    // A note's menu holds, in order: open in new tab, new note here,
    // rename or move, delete. A folder's has no first item.
    // Rename: the menu opens the prompt, and Enter renames with links kept.
    choose_in_menu(&workspace, "B.md", 3, cx);
    workspace.read_with(cx, |workspace, _| match &workspace.overlay {
        Some(Overlay::Prompt(prompt)) => {
            assert_eq!(prompt.title.as_ref(), "Rename or move B.md");
        }
        _ => panic!("the rename prompt should be open"),
    });
    cx.simulate_keystrokes("b e e enter");
    assert_eq!(read("bee.md"), "b\n");
    assert_eq!(read("A.md"), "to [[bee]]\n");
    assert_eq!(editor_text(&workspace, cx), "to [[bee]]\n");

    // Open in a new tab.
    choose_in_menu(&workspace, "bee.md", 1, cx);
    assert_eq!(tab_titles(&workspace, cx), vec![vec!["A", "*bee"]]);

    // A new note inside the folder that was clicked.
    choose_in_menu(&workspace, "Dir", 1, cx);
    assert_eq!(current(&workspace, cx), Some("Dir/Untitled.md".to_owned()));
    assert!(dir.path().join("Dir/Untitled.md").exists());

    // Delete moves the file to the vault's trash and empties its tab.
    choose_in_menu(&workspace, "A.md", 4, cx);
    assert!(!dir.path().join("A.md").exists());
    assert_eq!(
        fs::read_to_string(dir.path().join(".diamond/trash/A.md")).unwrap(),
        "to [[bee]]\n"
    );
    workspace.read_with(cx, |workspace, cx| {
        assert!(workspace.error.is_none(), "{:?}", workspace.error);
        assert!(workspace.tree.read(cx).index_of(&"A.md".into()).is_none());
    });
}
