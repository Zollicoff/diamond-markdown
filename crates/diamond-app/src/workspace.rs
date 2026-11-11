//! The main window: file tree, editor and the note's context panel.

use std::collections::HashSet;
use std::time::Duration;

use diamond_vault::{EntryKind, VaultPath, VaultWatcher};
use gpui_kit::component::{
    ActiveTheme as _, StyledExt as _,
    command::{Command, CommandItem, CommandState},
    h_flex,
    input::{Editor, EditorState, InputEvent},
    label::Label,
    list::ListItem,
    menu::PopupMenuItem,
    resizable::{h_resizable, resizable_panel},
    scroll::ScrollableElement as _,
    text::TextView,
    tree::{TreeEvent, TreeItem, TreeState, tree},
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::session::{Follow, NOTE_SCHEME, OpenChange, Session, TreeNode};

actions!(
    diamond,
    [SaveNote, FollowLink, NewNote, QuickSwitch, ToggleReading]
);

const CONTEXT: &str = "Workspace";

/// Starting width of the sidebar and of the context panel.
const SIDE_PANEL_WIDTH: f32 = 260.;

/// How long after the last keystroke an edited note is written to disk.
const AUTOSAVE_DELAY: Duration = Duration::from_millis(800);

/// How long to keep collecting file-change reports before acting on them.
/// One save by another program arrives as several reports.
const WATCH_SETTLE: Duration = Duration::from_millis(150);

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
        KeyBinding::new(primary!("n"), NewNote, Some(CONTEXT)),
        KeyBinding::new(primary!("o"), QuickSwitch, Some(CONTEXT)),
        KeyBinding::new(primary!("e"), ToggleReading, Some(CONTEXT)),
        // Off macOS the text input claims Ctrl-E for "move to end of line".
        // This more specific binding, registered after it, takes it back.
        #[cfg(not(target_os = "macos"))]
        KeyBinding::new("ctrl-e", ToggleReading, Some("Workspace > Input")),
        KeyBinding::new("alt-enter", FollowLink, Some(CONTEXT)),
    ]);
}

/// How many notes the quick switcher lists at once.
const SWITCHER_LIMIT: usize = 50;

/// The quick switcher while it is open.
struct Switcher {
    state: Entity<CommandState>,
    /// The notes currently listed, best match first.
    results: Vec<(VaultPath, SharedString)>,
}

/// The main window's root view.
pub struct Workspace {
    session: Session,
    tree: Entity<TreeState>,
    editor: Entity<EditorState>,
    /// Keeps keyboard focus inside the window when the editor is not shown,
    /// so shortcuts keep working in the reading view.
    focus: FocusHandle,
    /// Folders the user has opened in the sidebar, by vault path, so the
    /// tree can be rebuilt after a file change without collapsing.
    expanded: HashSet<SharedString>,
    /// The last failure, shown in the status bar until the next success.
    error: Option<SharedString>,
    /// Set when the open note changed or vanished on disk while the editor
    /// held unsaved edits. Nothing is written automatically until the user
    /// saves, so neither version is lost without a decision.
    conflict: Option<SharedString>,
    autosave: Option<Task<()>>,
    /// When set, the note is shown rendered and read-only. Holds the
    /// editor text the rendering was made from and the Markdown handed to
    /// the renderer, so the conversion runs only when the text changes.
    reading: Option<(SharedString, SharedString)>,
    switcher: Option<Switcher>,
    watcher: Option<(VaultWatcher, Task<()>)>,
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
            focus: cx.focus_handle(),
            expanded,
            error,
            conflict: None,
            autosave: None,
            reading: None,
            switcher: None,
            watcher: None,
            _subscriptions: subscriptions,
        }
    }

    /// Starts following changes other programs make to the vault folder.
    pub fn watch(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (sender, receiver) = async_channel::unbounded::<Vec<VaultPath>>();
        let watcher = match self.session.watch(move |paths| {
            // The receiver only goes away when the window closes.
            let _ = sender.try_send(paths);
        }) {
            Ok(watcher) => watcher,
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                return;
            }
        };
        let task = cx.spawn_in(window, async move |this, cx| {
            while let Ok(mut paths) = receiver.recv().await {
                cx.background_executor().timer(WATCH_SETTLE).await;
                while let Ok(more) = receiver.try_recv() {
                    paths.extend(more);
                }
                paths.sort();
                paths.dedup();
                let applied = this.update_in(cx, |this, window, cx| {
                    this.handle_changes(&paths, window, cx);
                });
                if applied.is_err() {
                    break;
                }
            }
        });
        self.watcher = Some((watcher, task));
    }

    /// Reacts to files changing on disk.
    ///
    /// A note open without unsaved edits is reloaded. With unsaved edits the
    /// editor keeps its text and autosave stops, so the other version is not
    /// overwritten until the user decides by saving.
    pub fn handle_changes(
        &mut self,
        paths: &[VaultPath],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let applied = match self.session.apply_changes(paths) {
            Ok(applied) => applied,
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                cx.notify();
                return;
            }
        };
        if applied.structure_changed {
            self.refresh_tree(cx);
        }

        let in_editor = self.editor.read(cx).value();
        let unsaved = self.session.is_dirty(&in_editor);
        match applied.open {
            OpenChange::Unchanged => {}
            OpenChange::Changed(on_disk) if on_disk == in_editor.as_ref() => {
                self.session.accept_disk_text(&on_disk);
            }
            OpenChange::Changed(_) if unsaved => {
                self.autosave = None;
                self.conflict = Some("Changed on disk. Save to keep this version.".into());
            }
            OpenChange::Changed(on_disk) => {
                self.session.accept_disk_text(&on_disk);
                self.editor.update(cx, |editor, cx| {
                    let cursor = editor.cursor().min(on_disk.len());
                    editor.set_value(on_disk, window, cx);
                    editor.set_selected_range(cursor..cursor, cx);
                });
            }
            OpenChange::Removed if unsaved => {
                self.autosave = None;
                self.conflict = Some("Removed on disk. Save to keep this note.".into());
            }
            OpenChange::Removed => {
                self.session.close();
                self.editor
                    .update(cx, |editor, cx| editor.set_value("", window, cx));
            }
        }
        cx.notify();
    }

    /// Opens a note in the editor, saving the current one first.
    pub fn open_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        self.leave_current(cx);
        match self.session.open_note(path) {
            Ok(text) => {
                self.error = None;
                self.editor
                    .update(cx, |editor, cx| editor.set_value(text, window, cx));
                if self.reading.is_some() {
                    self.focus.focus(window, cx);
                }
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Writes the open note now if it has unsaved changes. This is the
    /// user's explicit save: it settles a conflict in the editor's favour.
    pub fn save(&mut self, cx: &mut Context<Self>) {
        self.autosave = None;
        self.conflict = None;
        let text = self.editor.read(cx).value();
        match self.session.save(&text) {
            Ok(_) => self.error = None,
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Makes sure the open note's edits are on disk before the editor shows
    /// something else. In a conflict the edits go to a copy beside the note,
    /// so neither version is lost.
    fn leave_current(&mut self, cx: &mut Context<Self>) {
        if self.conflict.take().is_none() {
            self.save(cx);
            return;
        }
        self.autosave = None;
        let text = self.editor.read(cx).value();
        match self.session.save_conflict_copy(&text) {
            Ok(copy) => {
                self.reveal_in_tree(&copy, cx);
                self.error = Some(format!("Your edits were kept in {copy}").into());
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    /// Opens the note that the link under the cursor leads to, creating it
    /// if the link names a note that does not exist yet.
    pub fn follow_link(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (text, cursor) = {
            let editor = self.editor.read(cx);
            (editor.value(), editor.cursor())
        };
        let followed = self.session.follow(&text, cursor);
        self.go(followed, window, cx);
    }

    /// Handles a click on a link in the reading view.
    pub fn open_link(&mut self, address: &str, window: &mut Window, cx: &mut Context<Self>) {
        let target = match address.strip_prefix(NOTE_SCHEME) {
            Some(encoded) => diamond_parse::percent_decode(encoded),
            None if diamond_parse::is_external(address) => {
                cx.open_url(address);
                return;
            }
            // An ordinary Markdown link to a file in the vault.
            None => diamond_parse::percent_decode(address),
        };
        let followed = self.session.follow_target(&target);
        self.go(followed, window, cx);
    }

    /// Acts on where a link leads.
    fn go(
        &mut self,
        followed: Result<Follow, diamond_vault::VaultError>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match followed {
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

    /// Switches between editing the note and reading it rendered.
    pub fn toggle_reading(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.reading.take().is_some() {
            self.editor
                .update(cx, |editor, cx| editor.focus(window, cx));
        } else {
            self.reading = Some(Default::default());
            self.refresh_reading(cx);
            self.focus.focus(window, cx);
        }
        cx.notify();
    }

    /// Re-renders the reading view's Markdown if the note's text changed.
    fn refresh_reading(&mut self, cx: &mut Context<Self>) {
        let Some((source, _)) = &self.reading else {
            return;
        };
        let text = self.editor.read(cx).value();
        if *source != text || text.is_empty() {
            let rendered = self.session.reading_markdown(&text);
            self.reading = Some((text, rendered.into()));
        }
    }

    /// Creates an empty note and opens it.
    pub fn new_note(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match self.session.new_note() {
            Ok(path) => {
                self.reveal_in_tree(&path, cx);
                self.open_note(&path, window, cx);
                self.editor
                    .update(cx, |editor, cx| editor.focus(window, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Moves a file or folder to the vault's trash.
    pub fn delete_entry(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        // Unsaved edits to a note that is about to go are written first, so
        // the trashed copy is the latest text.
        if self.conflict.is_none() {
            self.save(cx);
        }
        match self.session.delete(path) {
            Ok(closed_open_note) => {
                self.error = None;
                if closed_open_note {
                    self.conflict = None;
                    self.autosave = None;
                    self.editor
                        .update(cx, |editor, cx| editor.set_value("", window, cx));
                }
                self.refresh_tree(cx);
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Opens the quick switcher: type part of a note's name, press Enter.
    pub fn open_switcher(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let state = cx.new(|cx| CommandState::new(window, cx));
        state.update(cx, |state, cx| state.focus(window, cx));
        self.switcher = Some(Switcher {
            state,
            results: self.switcher_results(""),
        });
        cx.notify();
    }

    /// Closes the quick switcher and puts the cursor back in the editor.
    fn close_switcher(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.switcher.take().is_some() {
            self.editor
                .update(cx, |editor, cx| editor.focus(window, cx));
            cx.notify();
        }
    }

    fn switcher_results(&self, query: &str) -> Vec<(VaultPath, SharedString)> {
        self.session
            .quick_switch(query, SWITCHER_LIMIT)
            .into_iter()
            .map(|(path, label)| (path, label.into()))
            .collect()
    }

    fn render_switcher(&self, switcher: &Switcher, cx: &mut Context<Self>) -> impl IntoElement {
        let on_query = cx.entity();
        let on_confirm = cx.entity();
        let on_cancel = cx.entity();
        let palette = Command::new(&switcher.state)
            // Ranking is ours, so the list shows exactly what we hand it.
            .filterable(false)
            .placeholder("Find a note")
            .max_h(px(420.))
            .items(
                switcher
                    .results
                    .iter()
                    .map(|(_, label)| CommandItem::new().label(label.clone())),
            )
            .on_query(move |query, _, cx| {
                on_query.update(cx, |this, cx| {
                    let results = this.switcher_results(query);
                    if let Some(switcher) = this.switcher.as_mut() {
                        switcher.results = results;
                    }
                    cx.notify();
                });
            })
            .on_confirm(move |chosen, window, cx| {
                on_confirm.update(cx, |this, cx| {
                    let path = this
                        .switcher
                        .as_ref()
                        .and_then(|switcher| switcher.results.get(chosen.row))
                        .map(|(path, _)| path.clone());
                    this.close_switcher(window, cx);
                    if let Some(path) = path {
                        this.open_note(&path, window, cx);
                    }
                });
            })
            .on_cancel(move |window, cx| {
                on_cancel.update(cx, |this, cx| this.close_switcher(window, cx));
            });

        div()
            .id("switcher-backdrop")
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .flex()
            .justify_center()
            .pt(px(72.))
            .bg(cx.theme().background.opacity(0.6))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, window, cx| this.close_switcher(window, cx)),
            )
            .child(
                div()
                    .id("switcher")
                    .w(px(560.))
                    // Clicks inside the palette must not reach the backdrop.
                    .occlude()
                    .child(palette),
            )
    }

    /// Handles a click on a sidebar row.
    fn open_entry(&mut self, id: &str, window: &mut Window, cx: &mut Context<Self>) {
        let Ok(path) = VaultPath::new(id) else {
            return;
        };
        if self.session.is_note(&path) {
            self.open_note(&path, window, cx);
        } else if path.extension().is_some() {
            self.error = Some(format!("{path} is not a note; it cannot be opened yet").into());
            cx.notify();
        }
    }

    /// Rebuilds the sidebar from disk, keeping opened folders open.
    fn refresh_tree(&mut self, cx: &mut Context<Self>) {
        match self.session.tree() {
            Ok(nodes) => {
                let items = tree_items(&nodes, &self.expanded);
                self.tree.update(cx, |tree, cx| tree.set_items(items, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    /// Rebuilds the sidebar with `path`'s folders opened.
    fn reveal_in_tree(&mut self, path: &VaultPath, cx: &mut Context<Self>) {
        let mut folder = path.parent();
        while let Some(current) = folder {
            self.expanded.insert(current.to_owned().into());
            folder = current.rfind('/').map(|slash| &current[..slash]);
        }
        self.refresh_tree(cx);
    }

    fn schedule_autosave(&mut self, cx: &mut Context<Self>) {
        if self.conflict.is_some() {
            return;
        }
        // Replacing the task drops the previous one, which cancels it.
        self.autosave = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(AUTOSAVE_DELAY).await;
            _ = this.update(cx, |this, cx| {
                if this.conflict.is_none() {
                    this.save(cx);
                }
            });
        }));
        cx.notify();
    }

    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let view = cx.entity();
        let menu_view = view.clone();
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
                            this.open_entry(&id, window, cx);
                        }))
                    })
                })
                .context_menu(move |_ix, entry, menu, _window, _cx| {
                    let view = menu_view.clone();
                    let id = entry.item().id.clone();
                    menu.item(PopupMenuItem::new("Delete").on_click(move |_, window, cx| {
                        if let Ok(path) = VaultPath::new(&id) {
                            view.update(cx, |this, cx| this.delete_entry(&path, window, cx));
                        }
                    }))
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
        let theme = cx.theme();
        let (state, color) = if let Some(error) = &self.error {
            (error.clone(), theme.danger)
        } else if let Some(conflict) = &self.conflict {
            (conflict.clone(), theme.warning)
        } else if self.session.current().is_none() {
            (SharedString::default(), theme.muted_foreground)
        } else if self.session.is_dirty(&self.editor.read(cx).value()) {
            ("Edited".into(), theme.muted_foreground)
        } else {
            ("Saved".into(), theme.muted_foreground)
        };
        v_flex()
            .size_full()
            .bg(theme.background)
            .child(
                h_flex()
                    .h_9()
                    .px_4()
                    .justify_between()
                    .border_b_1()
                    .border_color(theme.border)
                    .child(Label::new(title).font_semibold())
                    .child(
                        div()
                            .id("save-state")
                            .text_sm()
                            .text_color(color)
                            .child(state),
                    ),
            )
            .child(
                div().flex_1().min_h_0().child(match &self.reading {
                    None => Editor::new(&self.editor)
                        .appearance(false)
                        .bordered(false)
                        .h(relative(1.))
                        .into_any_element(),
                    Some((_, rendered)) => {
                        let view = cx.entity();
                        // A fresh id per note, so each note starts at its top.
                        let id = self
                            .session
                            .current()
                            .map(|path| format!("reading:{path}"))
                            .unwrap_or_default();
                        panel(
                            "reading-view",
                            div().size_full().px_8().py_4().child(
                                TextView::markdown(SharedString::from(id), rendered.clone())
                                    .selectable(true)
                                    .scrollable(true)
                                    .on_link_click(move |address, _, window, cx| {
                                        view.update(cx, |this, cx| {
                                            this.open_link(address, window, cx);
                                        });
                                    }),
                            ),
                        )
                        .into_any_element()
                    }
                }),
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
        self.refresh_reading(cx);
        div()
            .id("workspace")
            .track_focus(&self.focus)
            .key_context(CONTEXT)
            .on_action(cx.listener(|this, _: &SaveNote, _, cx| this.save(cx)))
            .on_action(cx.listener(|this, _: &FollowLink, window, cx| {
                this.follow_link(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NewNote, window, cx| {
                this.new_note(window, cx);
            }))
            .on_action(cx.listener(|this, _: &QuickSwitch, window, cx| {
                this.open_switcher(window, cx);
            }))
            .on_action(cx.listener(|this, _: &ToggleReading, window, cx| {
                this.toggle_reading(window, cx);
            }))
            .relative()
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
            .children(
                self.switcher
                    .as_ref()
                    .map(|switcher| self.render_switcher(switcher, cx)),
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
            workspace.editor.read(cx).value().to_string()
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
            assert!(workspace.conflict.is_none());
            assert!(!workspace.session.is_dirty("second, from elsewhere\n"));
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
            assert!(workspace.conflict.is_some());
            assert!(workspace.autosave.is_none());
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
        workspace.read_with(cx, |workspace, _| assert!(workspace.conflict.is_none()));
    }

    #[gpui_kit::test]
    fn saving_settles_a_conflict_in_the_editors_favour(cx: &mut TestAppContext) {
        let (dir, workspace, cx) = open(&[("Home.md", "base\n")], cx);
        let home = dir.path().join("Home.md");
        open_note(&workspace, "Home.md", cx);
        cx.simulate_keystrokes("x");
        fs::write(&home, "theirs\n").unwrap();
        changed(&workspace, "Home.md", cx);

        cx.simulate_keystrokes(super::primary!("s"));
        assert_eq!(fs::read_to_string(&home).unwrap(), "xbase\n");
        workspace.read_with(cx, |workspace, _| assert!(workspace.conflict.is_none()));
        assert!(!dir.path().join("Home (conflict).md").exists());
    }

    #[gpui_kit::test]
    fn a_note_removed_elsewhere_closes_unless_it_has_unsaved_changes(cx: &mut TestAppContext) {
        let (dir, workspace, cx) = open(&[("A.md", "a\n"), ("B.md", "b\n")], cx);
        open_note(&workspace, "A.md", cx);
        fs::remove_file(dir.path().join("A.md")).unwrap();
        changed(&workspace, "A.md", cx);
        assert_eq!(editor_text(&workspace, cx), "");
        workspace.read_with(cx, |workspace, _| {
            assert!(workspace.session.current().is_none())
        });

        open_note(&workspace, "B.md", cx);
        cx.simulate_keystrokes("x");
        fs::remove_file(dir.path().join("B.md")).unwrap();
        changed(&workspace, "B.md", cx);
        assert_eq!(editor_text(&workspace, cx), "xb\n");
        workspace.read_with(cx, |workspace, _| assert!(workspace.conflict.is_some()));
        // Saving puts the note back.
        cx.simulate_keystrokes(super::primary!("s"));
        assert_eq!(fs::read_to_string(dir.path().join("B.md")).unwrap(), "xb\n");
    }

    #[gpui_kit::test]
    fn the_new_note_shortcut_creates_and_opens_untitled(cx: &mut TestAppContext) {
        let (dir, workspace, cx) = open(&[("Home.md", "home\n")], cx);
        open_note(&workspace, "Home.md", cx);
        cx.simulate_keystrokes("x");
        cx.simulate_keystrokes(super::primary!("n"));

        workspace.read_with(cx, |workspace, cx| {
            assert_eq!(workspace.session.current(), Some(&path("Untitled.md")));
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
            fs::read_to_string(dir.path().join(".trash/Home.md")).unwrap(),
            "xhome\n"
        );
        assert_eq!(editor_text(&workspace, cx), "");
        workspace.read_with(cx, |workspace, cx| {
            assert!(workspace.session.current().is_none());
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

        cx.simulate_keystrokes(super::primary!("o"));
        workspace.read_with(cx, |workspace, _| {
            let switcher = workspace.switcher.as_ref().expect("switcher open");
            assert_eq!(switcher.results.len(), 3);
        });

        // Typing goes to the switcher, not the note, and narrows the list.
        cx.simulate_keystrokes("q p l");
        assert_eq!(editor_text(&workspace, cx), "xhome\n");
        workspace.read_with(cx, |workspace, _| {
            let results = &workspace.switcher.as_ref().unwrap().results;
            assert_eq!(results.len(), 1, "{results:?}");
            assert_eq!(results[0].0, path("Projects/Quarterly Plan.md"));
            assert_eq!(results[0].1.as_ref(), "Quarterly Plan  ·  Projects");
        });

        cx.simulate_keystrokes("enter");
        workspace.read_with(cx, |workspace, _| {
            assert!(workspace.switcher.is_none());
            assert_eq!(
                workspace.session.current(),
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
        cx.simulate_keystrokes(super::primary!("o"));
        workspace.read_with(cx, |workspace, _| assert!(workspace.switcher.is_some()));
        cx.simulate_keystrokes("escape");
        workspace.read_with(cx, |workspace, _| {
            assert!(workspace.switcher.is_none());
            assert_eq!(workspace.session.current(), Some(&path("Home.md")));
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

        cx.simulate_keystrokes(super::primary!("e"));
        workspace.read_with(cx, |workspace, _| {
            let (source, rendered) = workspace.reading.as_ref().expect("reading view on");
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
            assert_eq!(workspace.session.current(), Some(&path("Plan.md")));
            assert!(workspace.reading.is_some());
        });
        assert!(
            fs::read_to_string(dir.path().join("Home.md"))
                .unwrap()
                .starts_with("x# Home")
        );
        cx.update(|window, cx| window.render_frame(cx));
        workspace.read_with(cx, |workspace, _| {
            assert_eq!(workspace.reading.as_ref().unwrap().1.as_ref(), "# Plan\n");
        });

        // A link to a note that does not exist creates it.
        click("diamond://note/Brand%20New", cx);
        assert!(dir.path().join("Brand New.md").exists());
        workspace.read_with(cx, |workspace, _| {
            assert_eq!(workspace.session.current(), Some(&path("Brand New.md")));
        });

        // Back to editing: typing reaches the editor again.
        cx.simulate_keystrokes(super::primary!("e"));
        workspace.read_with(cx, |workspace, _| assert!(workspace.reading.is_none()));
        cx.simulate_keystrokes("h i");
        assert_eq!(editor_text(&workspace, cx), "hi");
    }
}
