//! The main window: file tree, editor and the note's context panel.
//!
//! This file holds what the window does. How it is drawn is in `panels`,
//! and the palette that finds notes, text, commands and templates is in
//! `palette`.

mod palette;
mod panels;
#[cfg(test)]
mod tests;

use std::collections::HashSet;
use std::time::Duration;

use diamond_parse::NoteMeta;
use diamond_vault::{EntryKind, VaultPath, VaultWatcher};
use gpui_kit::component::{
    input::{EditorState, InputEvent, InputState},
    tree::{TreeEvent, TreeItem, TreeState},
};
use gpui_kit::*;

use crate::history::History;
use crate::notes::{self, Moment};
use crate::session::{Follow, NOTE_SCHEME, OpenChange, Session, TreeNode};
use crate::settings::Appearance;
use palette::Palette;

/// Starting width of the sidebar and of the context panel.
const SIDE_PANEL_WIDTH: f32 = 260.;

/// How long after the last keystroke an edited note is written to disk.
const AUTOSAVE_DELAY: Duration = Duration::from_millis(800);

/// How long to keep collecting file-change reports before acting on them.
/// One save by another program arrives as several reports.
const WATCH_SETTLE: Duration = Duration::from_millis(150);

/// What the open note's text says right now, as opposed to at its last save.
#[derive(Default)]
struct Live {
    /// Headings, tags and the rest, parsed from the editor's text.
    meta: NoteMeta,
    words: usize,
    characters: usize,
}

/// The field for typing an entry's new name.
struct RenameBox {
    /// The file or folder being renamed.
    path: VaultPath,
    input: Entity<InputState>,
    _subscription: Subscription,
}

/// Something shown over the window that takes the keyboard until it is
/// confirmed or dismissed. Only one is open at a time.
enum Overlay {
    Palette(Palette),
    Rename(RenameBox),
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
    /// The last failure, shown in the status line until the next success.
    error: Option<SharedString>,
    /// What the last action did, when that is worth a line: "Renamed…".
    /// Shown in the status line until the user does something else.
    notice: Option<SharedString>,
    /// Set when the open note changed or vanished on disk while the editor
    /// held unsaved edits. Nothing is written automatically until the user
    /// saves, so neither version is lost without a decision.
    conflict: Option<SharedString>,
    autosave: Option<Task<()>>,
    /// When set, the note is shown rendered and read-only. Holds the
    /// editor text the rendering was made from and the Markdown handed to
    /// the renderer, so the conversion runs only when the text changes.
    reading: Option<(SharedString, SharedString)>,
    overlay: Option<Overlay>,
    history: History,
    live: Live,
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
                    this.notice = None;
                    this.refresh_live(cx);
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
            // Only matters while the setting is to follow the system.
            cx.observe_window_appearance(window, |_, window, cx| {
                crate::app::apply(Some(window), cx);
            }),
        ];

        Self {
            session,
            tree,
            editor,
            focus: cx.focus_handle(),
            expanded,
            error,
            notice: None,
            conflict: None,
            autosave: None,
            reading: None,
            overlay: None,
            history: History::default(),
            live: Live::default(),
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
                self.replace_editor_text(on_disk, window, cx);
            }
            OpenChange::Removed if unsaved => {
                self.autosave = None;
                self.conflict = Some("Removed on disk. Save to keep this note.".into());
            }
            OpenChange::Removed => {
                self.session.close();
                self.set_editor_text("", window, cx);
            }
        }
        cx.notify();
    }

    /// Opens a note in the editor, saving the current one first, and adds it
    /// to the back-and-forward history.
    pub fn open_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        self.notice = None;
        self.remember_cursor(cx);
        if self.show_note(path, window, cx) {
            self.history.visit(path);
        }
        cx.notify();
    }

    /// Puts a note in the editor without touching the history. Returns
    /// whether it could be opened.
    fn show_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) -> bool {
        self.leave_current(cx);
        match self.session.open_note(path) {
            Ok(text) => {
                self.error = None;
                self.set_editor_text(text, window, cx);
                if self.reading.is_some() {
                    self.focus.focus(window, cx);
                }
                true
            }
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                false
            }
        }
    }

    /// Shows `text` in the editor as a note just read from disk: the cursor
    /// goes to the start and there is nothing to undo.
    fn set_editor_text(
        &mut self,
        text: impl Into<SharedString>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let text: SharedString = text.into();
        self.editor
            .update(cx, |editor, cx| editor.set_value(text, window, cx));
        self.refresh_live(cx);
    }

    /// Shows a new version of the open note's text, leaving the cursor as
    /// near as possible to where it was.
    fn replace_editor_text(&mut self, text: String, window: &mut Window, cx: &mut Context<Self>) {
        let cursor = self.editor.read(cx).cursor().min(text.len());
        self.set_editor_text(text, window, cx);
        self.editor.update(cx, |editor, cx| {
            editor.set_selected_range(cursor..cursor, cx)
        });
    }

    /// Re-reads the outline, tags and counts from the editor's text.
    fn refresh_live(&mut self, cx: &mut Context<Self>) {
        let text = self.editor.read(cx).value();
        let meta = diamond_parse::parse(&text);
        let (words, characters) = notes::counts(&text, &meta);
        self.live = Live {
            meta,
            words,
            characters,
        };
    }

    /// Writes the open note now if it has unsaved changes. This is the
    /// user's explicit save: it settles a conflict in the editor's favour.
    /// Returns whether the note is now on disk as the editor shows it.
    pub fn save(&mut self, cx: &mut Context<Self>) -> bool {
        self.autosave = None;
        self.conflict = None;
        let text = self.editor.read(cx).value();
        let saved = match self.session.save(&text) {
            Ok(_) => {
                self.error = None;
                true
            }
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                false
            }
        };
        cx.notify();
        saved
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
                self.notice = Some(format!("Your edits were kept in {copy}").into());
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    /// Notes where the cursor is, so coming back to this note finds it.
    fn remember_cursor(&mut self, cx: &mut Context<Self>) {
        let cursor = self.editor.read(cx).cursor();
        self.history.set_cursor(cursor);
    }

    /// Goes back to the note that was open before this one.
    pub fn go_back(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.step(true, window, cx);
    }

    /// Goes forward again after going back.
    pub fn go_forward(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.step(false, window, cx);
    }

    fn step(&mut self, back: bool, window: &mut Window, cx: &mut Context<Self>) {
        self.notice = None;
        self.remember_cursor(cx);
        // Notes deleted since they were visited are stepped over.
        self.history.prune(|path| self.session.is_note(path));
        let place = if back {
            self.history.back()
        } else {
            self.history.forward()
        };
        if let Some(place) = place
            && self.show_note(&place.path, window, cx)
        {
            self.editor.update(cx, |editor, cx| {
                editor.set_selected_range(place.cursor..place.cursor, cx);
            });
        }
        cx.notify();
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
        if self.reading.take().is_none() {
            self.reading = Some(Default::default());
            self.refresh_reading(cx);
        }
        self.focus_content(window, cx);
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

    /// Gives the keyboard to whatever shows the note: the editor, or the
    /// window itself in the reading view.
    fn focus_content(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.reading.is_some() {
            self.focus.focus(window, cx);
        } else {
            self.editor
                .update(cx, |editor, cx| editor.focus(window, cx));
        }
    }

    /// Leaves the reading view, for actions that need the editor.
    fn start_editing(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.reading = None;
        self.editor
            .update(cx, |editor, cx| editor.focus(window, cx));
    }

    /// Creates an empty note in `folder`, or at the vault root, and opens it.
    pub fn new_note(&mut self, folder: Option<&str>, window: &mut Window, cx: &mut Context<Self>) {
        match self.session.new_note(folder) {
            Ok(path) => {
                self.reveal_in_tree(&path, cx);
                self.open_note(&path, window, cx);
                // A new note is for writing in.
                self.start_editing(window, cx);
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Opens today's daily note, creating it from its template if needed.
    pub fn open_daily_note(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match self.session.daily_note(Moment::now()) {
            Ok((path, created)) => {
                if created {
                    self.reveal_in_tree(&path, cx);
                }
                self.open_note(&path, window, cx);
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Inserts a template at the cursor, with its placeholders filled in
    /// for the open note.
    pub fn insert_template(
        &mut self,
        template: &VaultPath,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.session.current().is_none() {
            self.error = Some("Open a note to insert the template into".into());
            cx.notify();
            return;
        }
        match self.session.template_text(template, Moment::now()) {
            Ok(text) => {
                self.error = None;
                self.start_editing(window, cx);
                // Goes through the editor's own editing path, so it can be
                // undone and is saved like anything typed.
                self.editor
                    .update(cx, |editor, cx| editor.insert(text, window, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Puts the cursor at a byte offset in the open note, for a click on a
    /// heading in the outline. The reading view cannot show a position yet,
    /// so this switches to the editor.
    pub fn jump_to(&mut self, offset: usize, window: &mut Window, cx: &mut Context<Self>) {
        self.start_editing(window, cx);
        self.editor.update(cx, |editor, cx| {
            editor.set_selected_range(offset..offset, cx);
        });
        cx.notify();
    }

    /// Switches between light and dark.
    pub fn toggle_theme(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let changed = crate::app::toggle_appearance(Some(window), cx);
        self.report_setting(changed, cx);
    }

    /// Goes back to following the system's light or dark setting.
    pub fn use_system_theme(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let changed = crate::app::set_appearance(Appearance::System, Some(window), cx);
        self.report_setting(changed, cx);
    }

    fn report_setting(&mut self, changed: Result<(), String>, cx: &mut Context<Self>) {
        match changed {
            Ok(()) => self.error = None,
            Err(problem) => self.error = Some(problem.into()),
        }
        cx.notify();
    }

    /// Reads the vault's settings file again.
    pub fn reload_settings(&mut self, cx: &mut Context<Self>) {
        self.session.reload_settings();
        self.error = None;
        self.notice = self
            .session
            .settings_problem()
            .is_none()
            .then(|| "Vault settings reloaded".into());
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
                self.notice = Some(format!("Moved {path} to the trash").into());
                self.history.removed(path);
                if closed_open_note {
                    self.conflict = None;
                    self.autosave = None;
                    self.set_editor_text("", window, cx);
                }
                self.refresh_tree(cx);
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
        cx.notify();
    }

    /// Opens the field for typing a new name for a file or folder.
    pub fn start_rename(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        let name = self.session.display_name(path).to_owned();
        let input = cx.new(|cx| {
            let mut input = InputState::new(window, cx);
            input.set_value(name, window, cx);
            input.select_all(window, cx);
            input
        });
        let subscription =
            cx.subscribe_in(&input, window, |this, _, event: &InputEvent, window, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.confirm_rename(window, cx);
                }
            });
        input.update(cx, |input, cx| input.focus(window, cx));
        self.overlay = Some(Overlay::Rename(RenameBox {
            path: path.clone(),
            input,
            _subscription: subscription,
        }));
        cx.notify();
    }

    /// Renames the entry to what was typed in the rename field.
    fn confirm_rename(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(Overlay::Rename(rename)) = self.overlay.take() else {
            return;
        };
        let name = rename.input.read(cx).value();
        self.focus_content(window, cx);
        self.rename_entry(&rename.path, &name, window, cx);
    }

    /// Renames or moves a file or folder to `name`, as typed, and rewrites
    /// the links that lead to it.
    pub fn rename_entry(
        &mut self,
        from: &VaultPath,
        name: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.notify();
        self.notice = None;
        // Links are rewritten in each note's saved text, so the open note
        // has to be on disk first, and must not be in doubt.
        if self.conflict.is_some() {
            self.error = Some("Save the open note first: it changed on disk".into());
            return;
        }
        if !self.save(cx) {
            return;
        }
        let to = match self.session.renamed_path(from, name) {
            Ok(to) => to,
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                return;
            }
        };
        if to == *from {
            return;
        }
        match self.session.rename(from, &to) {
            Ok(renamed) => {
                self.history.renamed(from, &to);
                self.rename_expanded(from, &to);
                if let Some(text) = renamed.open_text {
                    self.replace_editor_text(text, window, cx);
                }
                self.reveal_in_tree(&to, cx);
                self.notice = Some(
                    match renamed.notes_updated {
                        0 => format!("Renamed to {to}"),
                        1 => format!("Renamed to {to}; links updated in 1 note"),
                        n => format!("Renamed to {to}; links updated in {n} notes"),
                    }
                    .into(),
                );
            }
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                // The rename itself may have happened before the failure.
                self.refresh_tree(cx);
            }
        }
    }

    /// Keeps opened folders open when they, or a folder above them, move.
    fn rename_expanded(&mut self, from: &VaultPath, to: &VaultPath) {
        let under = format!("{}/", from.as_str());
        self.expanded = self
            .expanded
            .drain()
            .map(|folder| {
                if folder.as_ref() == from.as_str() {
                    to.to_string().into()
                } else if let Some(rest) = folder.strip_prefix(&under) {
                    format!("{to}/{rest}").into()
                } else {
                    folder
                }
            })
            .collect();
    }

    /// Dismisses the palette or rename field and hands the keyboard back.
    fn close_overlay(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.overlay.take().is_some() {
            self.focus_content(window, cx);
            cx.notify();
        }
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
