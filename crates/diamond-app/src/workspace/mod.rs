//! The main window: file tree, notes in tabs and panes, and the context
//! panel for the note in front.
//!
//! This file holds what the window does. How it is drawn is in `panels`,
//! tabs and panes are described in `tab`, and the palette that finds notes,
//! text, commands and templates is in `palette`.

mod palette;
mod panels;
mod tab;
#[cfg(test)]
mod tests;

use std::collections::HashSet;
use std::time::Duration;

use diamond_vault::{EntryKind, VaultPath, VaultWatcher};
use gpui_kit::component::{
    input::{EditorState, InputEvent, InputState},
    tree::{TreeEvent, TreeItem, TreeState},
};
use gpui_kit::*;

use crate::history::History;
use crate::notes::{self, Moment};
use crate::plugin::{Command, Plugin};
use crate::session::{Follow, NOTE_SCHEME, OpenChange, Session, TreeNode, is_at_or_under};
use crate::settings::Appearance;
use palette::Palette;
use tab::{Live, Pane, Tab, ViewTab};

/// Starting width of the sidebar and of the context panel.
const SIDE_PANEL_WIDTH: f32 = 260.;

/// How long after the last keystroke an edited note is written to disk.
const AUTOSAVE_DELAY: Duration = Duration::from_millis(800);

/// How long to keep collecting file-change reports before acting on them.
/// One save by another program arrives as several reports.
const WATCH_SETTLE: Duration = Duration::from_millis(150);

/// What to do with the text typed into a prompt.
type Answer = Box<dyn FnOnce(&mut Workspace, String, &mut Window, &mut Context<Workspace>)>;

/// A one-line question: a title, a field and what to do with the answer.
struct Prompt {
    title: SharedString,
    /// A line under the field saying what Enter does.
    hint: SharedString,
    input: Entity<InputState>,
    answer: Answer,
    _subscription: Subscription,
}

/// Something shown over the window that takes the keyboard until it is
/// confirmed or dismissed. Only one is open at a time.
enum Overlay {
    Palette(Palette),
    Prompt(Prompt),
}

/// The main window's root view.
pub struct Workspace {
    session: Session,
    tree: Entity<TreeState>,
    /// The panes, left to right. Never empty.
    panes: Vec<Pane>,
    /// The pane the keyboard and the context panel belong to.
    active_pane: usize,
    next_tab_id: usize,
    /// Keeps keyboard focus inside the window when no editor is shown, so
    /// shortcuts keep working in the reading view.
    focus: FocusHandle,
    /// Folders the user has opened in the sidebar, by vault path, so the
    /// tree can be rebuilt after a file change without collapsing.
    expanded: HashSet<SharedString>,
    /// The last failure, shown in the status line until the next success.
    error: Option<SharedString>,
    /// What the last action did, when that is worth a line: "Renamed…".
    /// Shown in the status line until the user does something else.
    notice: Option<SharedString>,
    overlay: Option<Overlay>,
    /// The features built on the plugin interface.
    plugins: Vec<Box<dyn Plugin>>,
    /// The commands the plugins added, in the order of the plugins.
    commands: Vec<Command>,
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

        let subscriptions = vec![
            cx.subscribe(&tree, |this, _, event: &TreeEvent, _| match event {
                TreeEvent::Expanded(id) => {
                    this.expanded.insert(id.clone());
                }
                TreeEvent::Collapsed(id) => {
                    this.expanded.remove(id);
                }
            }),
            // Whatever changed, the sidebar marks the note in front.
            cx.observe_self(|this, cx| this.mark_current_in_tree(cx)),
            // Only matters while the setting is to follow the system.
            cx.observe_window_appearance(window, |_, window, cx| {
                crate::app::apply(Some(window), cx);
            }),
            // Edits typed in the last moments before the window or the app
            // goes away must not wait for the autosave that will never run.
            cx.on_release(|this, cx| this.save_on_the_way_out(cx)),
            cx.on_app_quit(|this, cx| {
                this.save_on_the_way_out(cx);
                async {}
            }),
        ];

        let mut plugins = crate::plugins::core();
        for plugin in &mut plugins {
            plugin.load(&session);
        }
        let commands = plugins
            .iter()
            .flat_map(|plugin| plugin.commands())
            .collect();

        let mut workspace = Self {
            session,
            tree,
            panes: Vec::new(),
            active_pane: 0,
            next_tab_id: 0,
            focus: cx.focus_handle(),
            expanded,
            error,
            notice: None,
            overlay: None,
            plugins,
            commands,
            watcher: None,
            _subscriptions: subscriptions,
        };
        let first = workspace.make_tab(window, cx);
        workspace.panes.push(Pane {
            tabs: vec![first],
            active: 0,
        });
        // Shortcuts work from the first moment, before anything is clicked.
        workspace.focus.focus(window, cx);
        workspace
    }

    // ---- What plugins work with -------------------------------------------

    /// The open vault.
    pub fn session(&self) -> &Session {
        &self.session
    }

    /// Shows a failure in the status line.
    pub fn report(&mut self, problem: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.error = Some(problem.into());
        cx.notify();
    }

    /// Shows what just happened in the status line.
    pub fn note(&mut self, notice: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.error = None;
        self.notice = Some(notice.into());
        cx.notify();
    }

    /// A plugin, by its type.
    #[allow(dead_code)] // Part of the interface; not every core plugin needs it.
    pub fn plugin<T: Plugin>(&self) -> Option<&T> {
        self.plugins.iter().find_map(|plugin| {
            let any: &dyn std::any::Any = plugin.as_ref();
            any.downcast_ref::<T>()
        })
    }

    /// Changes what a plugin keeps and writes it to the vault.
    pub fn update_plugin<T: Plugin, R>(
        &mut self,
        cx: &mut Context<Self>,
        change: impl FnOnce(&mut T) -> R,
    ) -> Option<R> {
        let plugin = self.plugins.iter_mut().find_map(|plugin| {
            let any: &mut dyn std::any::Any = plugin.as_mut();
            any.downcast_mut::<T>()
        })?;
        let result = change(plugin);
        if let Err(problem) = plugin.store(&self.session) {
            self.error = Some(problem.into());
        }
        cx.notify();
        Some(result)
    }

    /// Shows a plugin's view in a tab. `key` names the view: if a tab
    /// already shows it, that tab comes to the front and `build` is not
    /// called.
    pub fn open_view<V: Render>(
        &mut self,
        key: &'static str,
        title: &'static str,
        window: &mut Window,
        cx: &mut Context<Self>,
        build: impl FnOnce(&mut Self, &mut Context<Self>) -> Entity<V>,
    ) {
        let existing = self.panes.iter().enumerate().find_map(|(pane_ix, pane)| {
            let tab_ix = pane
                .tabs
                .iter()
                .position(|tab| tab.view.as_ref().is_some_and(|view| view.key == key))?;
            Some((pane_ix, tab_ix))
        });
        if let Some((pane, tab)) = existing {
            self.activate(pane, tab, window, cx);
            return;
        }
        // An empty tab is used as it is; anything else is left alone.
        if self.tab().document.is_some() || self.tab().view.is_some() {
            self.new_tab(window, cx);
        }
        let content = build(self, cx);
        self.tab_mut().view = Some(ViewTab {
            key: key.into(),
            title: title.into(),
            content: content.into(),
        });
        self.focus_content(window, cx);
        cx.notify();
    }

    /// Ticks or unticks the task on a line of a note, in the editor if the
    /// note is open and in its file otherwise.
    pub fn toggle_task(
        &mut self,
        path: &VaultPath,
        line: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.notify();
        let Some((pane, tab)) = self.locate_note(path) else {
            if let Err(failure) = self.session.toggle_task(path, line) {
                self.error = Some(failure.to_string().into());
            }
            return;
        };
        let tab = &self.panes[pane].tabs[tab];
        let id = tab.id;
        let text = tab.editor.read(cx).value();
        if let Some(toggled) = notes::toggle_task(&text, line) {
            self.replace_tab_text(id, toggled, window, cx);
            self.mirror(id, window, cx);
            self.save_tab(id, window, cx);
        }
    }

    /// Opens the daily note for a date, creating it if needed.
    pub fn open_daily_note_for(
        &mut self,
        moment: Moment,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match self.session.daily_note(moment) {
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

    /// Runs the plugin command at `index` in the window's command list.
    pub fn run_command(&mut self, index: usize, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(command) = self.commands.get(index) {
            let run = command.run.clone();
            run(self, window, cx);
        }
    }

    /// Tells every plugin about a rename or a delete, and writes what any
    /// of them changed in response.
    fn tell_plugins(&mut self, tell: impl Fn(&mut dyn Plugin) -> bool) {
        for plugin in &mut self.plugins {
            if tell(plugin.as_mut())
                && let Err(problem) = plugin.store(&self.session)
            {
                self.error = Some(problem.into());
            }
        }
    }

    // ---- Tabs and panes ---------------------------------------------------

    /// Makes an empty tab. The caller puts it in a pane.
    fn make_tab(&mut self, window: &mut Window, cx: &mut Context<Self>) -> Tab {
        let id = self.next_tab_id;
        self.next_tab_id += 1;
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language("markdown")
                .soft_wrap(true)
                .line_number(false)
                .placeholder("Open a note from the sidebar")
        });
        let subscription = cx.subscribe_in(
            &editor,
            window,
            move |this, _, event: &InputEvent, window, cx| match event {
                InputEvent::Change => this.tab_edited(id, window, cx),
                // A click into another pane's editor makes that pane the
                // one in front.
                InputEvent::Focus => this.tab_focused(id, cx),
                _ => {}
            },
        );
        Tab {
            id,
            document: None,
            view: None,
            editor,
            dirty: false,
            conflict: None,
            autosave: None,
            reading: None,
            history: History::default(),
            live: Live::default(),
            _subscription: subscription,
        }
    }

    /// The tab in front: the one showing in the active pane.
    fn tab(&self) -> &Tab {
        self.panes[self.active_pane].tab()
    }

    fn tab_mut(&mut self) -> &mut Tab {
        let pane = &mut self.panes[self.active_pane];
        &mut pane.tabs[pane.active]
    }

    /// Where the tab named `id` is: its pane and its place in the pane.
    fn locate(&self, id: usize) -> Option<(usize, usize)> {
        self.panes.iter().enumerate().find_map(|(pane_ix, pane)| {
            let tab_ix = pane.tabs.iter().position(|tab| tab.id == id)?;
            Some((pane_ix, tab_ix))
        })
    }

    fn tab_by_id(&self, id: usize) -> Option<&Tab> {
        let (pane, tab) = self.locate(id)?;
        Some(&self.panes[pane].tabs[tab])
    }

    fn tab_by_id_mut(&mut self, id: usize) -> Option<&mut Tab> {
        let (pane, tab) = self.locate(id)?;
        Some(&mut self.panes[pane].tabs[tab])
    }

    /// Every tab's name, left to right. Collected so the tabs can be changed
    /// while walking over them.
    fn tab_ids(&self) -> Vec<usize> {
        self.panes
            .iter()
            .flat_map(|pane| pane.tabs.iter().map(|tab| tab.id))
            .collect()
    }

    /// A tab that shows the note at `path`, if any does.
    fn locate_note(&self, path: &VaultPath) -> Option<(usize, usize)> {
        self.panes.iter().enumerate().find_map(|(pane_ix, pane)| {
            let tab_ix = pane.tabs.iter().position(|tab| tab.path() == Some(path))?;
            Some((pane_ix, tab_ix))
        })
    }

    /// The note in the tab in front.
    pub fn current(&self) -> Option<&VaultPath> {
        self.tab().path()
    }

    /// Notes that link to the note in front, as `(path, title)`.
    fn backlinks(&self) -> Vec<(VaultPath, String)> {
        self.current()
            .map(|path| self.session.backlinks(path))
            .unwrap_or_default()
    }

    /// Brings a tab to the front and gives it the keyboard. The tab being
    /// left is saved, as when switching notes.
    fn activate(&mut self, pane: usize, tab: usize, window: &mut Window, cx: &mut Context<Self>) {
        if self
            .panes
            .get(pane)
            .is_none_or(|pane| tab >= pane.tabs.len())
        {
            return;
        }
        let leaving = self.tab().id;
        if self.panes[pane].tabs[tab].id != leaving && self.tab().conflict.is_none() {
            self.save_tab(leaving, window, cx);
        }
        self.active_pane = pane;
        self.panes[pane].active = tab;
        self.notice = None;
        self.focus_content(window, cx);
        cx.notify();
    }

    /// Follows the keyboard when it lands in a tab's editor.
    fn tab_focused(&mut self, id: usize, cx: &mut Context<Self>) {
        if let Some((pane, tab)) = self.locate(id)
            && (self.active_pane, self.panes[pane].active) != (pane, tab)
        {
            self.active_pane = pane;
            self.panes[pane].active = tab;
            cx.notify();
        }
    }

    /// Makes a pane the one in front, for a click anywhere in it.
    fn activate_pane(&mut self, pane: usize, cx: &mut Context<Self>) {
        if pane < self.panes.len() && self.active_pane != pane {
            self.active_pane = pane;
            cx.notify();
        }
    }

    /// Opens an empty tab beside the one in front.
    pub fn new_tab(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let fresh = self.make_tab(window, cx);
        let pane = &mut self.panes[self.active_pane];
        let at = pane.active + 1;
        pane.tabs.insert(at, fresh);
        self.activate(self.active_pane, at, window, cx);
    }

    /// Closes a tab, saving its note first. The last tab of the window is
    /// replaced by an empty one; closing that closes the window.
    pub fn close_tab(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) {
        let Some((pane_ix, tab_ix)) = self.locate(id) else {
            return;
        };
        self.leave_tab(id, window, cx);
        if self.panes.len() == 1 && self.panes[0].tabs.len() == 1 {
            if self.panes[0].tabs[0].document.is_none() {
                window.remove_window();
                return;
            }
            let fresh = self.make_tab(window, cx);
            self.panes[0].tabs[0] = fresh;
        } else if self.panes[pane_ix].tabs.len() == 1 {
            // A pane goes with its last tab.
            self.panes.remove(pane_ix);
            if self.active_pane >= pane_ix && self.active_pane > 0 {
                self.active_pane -= 1;
            }
        } else {
            let pane = &mut self.panes[pane_ix];
            pane.tabs.remove(tab_ix);
            if pane.active > tab_ix || pane.active == pane.tabs.len() {
                pane.active -= 1;
            }
        }
        self.focus_content(window, cx);
        cx.notify();
    }

    /// Closes the tab in front.
    pub fn close_current_tab(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.close_tab(self.tab().id, window, cx);
    }

    /// Brings the next or previous tab of the active pane to the front,
    /// wrapping around at the ends.
    pub fn cycle_tab(&mut self, forward: bool, window: &mut Window, cx: &mut Context<Self>) {
        let pane = &self.panes[self.active_pane];
        let count = pane.tabs.len();
        let next = if forward {
            (pane.active + 1) % count
        } else {
            (pane.active + count - 1) % count
        };
        self.activate(self.active_pane, next, window, cx);
    }

    /// Opens a pane to the right showing the same note, so two parts of it,
    /// or it and another note, can be seen side by side.
    pub fn split_right(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let leaving = self.tab().id;
        if self.tab().conflict.is_none() {
            self.save_tab(leaving, window, cx);
        }
        let path = self.current().cloned();
        let fresh = self.make_tab(window, cx);
        let at = self.active_pane + 1;
        self.panes.insert(
            at,
            Pane {
                tabs: vec![fresh],
                active: 0,
            },
        );
        self.active_pane = at;
        if let Some(path) = path
            && self.show_note(&path, window, cx)
        {
            self.tab_mut().history.visit(&path);
        }
        self.focus_content(window, cx);
        cx.notify();
    }

    /// Moves the keyboard to the next or previous pane.
    pub fn cycle_pane(&mut self, forward: bool, window: &mut Window, cx: &mut Context<Self>) {
        let count = self.panes.len();
        let next = if forward {
            (self.active_pane + 1) % count
        } else {
            (self.active_pane + count - 1) % count
        };
        self.activate(next, self.panes[next].active, window, cx);
    }

    // ---- Following the disk -----------------------------------------------

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
        cx.notify();
        match self.session.apply_changes(paths) {
            Ok(true) => self.refresh_tree(cx),
            Ok(false) => {}
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                return;
            }
        }
        for id in self.tab_ids() {
            let change = self
                .tab_by_id(id)
                .and_then(|tab| tab.document.as_ref())
                .map(|document| self.session.disk_change(document));
            if let Some(change) = change {
                self.reconcile(id, change, window, cx);
            }
        }
    }

    /// Brings one tab in line with what its note's file now holds, without
    /// ever discarding unsaved edits.
    fn reconcile(
        &mut self,
        id: usize,
        change: OpenChange,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(tab) = self.tab_by_id_mut(id) else {
            return;
        };
        let Some(document) = tab.document.as_mut() else {
            return;
        };
        let in_editor = tab.editor.read(cx).value();
        let unsaved = document.is_dirty(&in_editor);
        match change {
            OpenChange::Unchanged => {}
            OpenChange::Changed(on_disk) if on_disk == in_editor.as_ref() => {
                // The editor already shows what is on disk: nothing is in
                // doubt, whatever was thought before.
                document.accept_disk_text(&on_disk);
                tab.dirty = false;
                tab.conflict = None;
            }
            OpenChange::Changed(_) if unsaved => {
                tab.autosave = None;
                tab.conflict = Some("Changed on disk. Save to keep this version.".into());
            }
            OpenChange::Changed(on_disk) => {
                document.accept_disk_text(&on_disk);
                self.replace_tab_text(id, on_disk, window, cx);
            }
            OpenChange::Removed if unsaved => {
                tab.autosave = None;
                tab.conflict = Some("Removed on disk. Save to keep this note.".into());
            }
            OpenChange::Removed => {
                tab.document = None;
                self.set_tab_text(id, "", window, cx);
            }
        }
    }

    // ---- Opening, saving and leaving notes --------------------------------

    /// Opens a note in the tab in front, saving the note it replaces, and
    /// adds it to the tab's back-and-forward history. A note already open in
    /// another tab is brought to the front instead.
    pub fn open_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        self.notice = None;
        if self.current() != Some(path)
            && let Some((pane, tab)) = self.locate_note(path)
        {
            self.activate(pane, tab, window, cx);
            return;
        }
        // A plugin's view keeps its tab; the note goes beside it.
        if self.tab().view.is_some() {
            self.new_tab(window, cx);
        }
        self.remember_cursor(cx);
        if self.show_note(path, window, cx) {
            self.tab_mut().history.visit(path);
        }
        cx.notify();
    }

    /// Opens a note in a new tab beside the one in front, unless it is
    /// already open, in which case that tab is brought to the front.
    pub fn open_in_new_tab(
        &mut self,
        path: &VaultPath,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Some((pane, tab)) = self.locate_note(path) {
            self.activate(pane, tab, window, cx);
            return;
        }
        self.new_tab(window, cx);
        if self.show_note(path, window, cx) {
            self.tab_mut().history.visit(path);
        }
        cx.notify();
    }

    /// Puts a note in the tab in front without touching its history.
    /// Returns whether it could be opened.
    fn show_note(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) -> bool {
        let id = self.tab().id;
        self.leave_tab(id, window, cx);
        match self.session.open_note(path) {
            Ok(document) => {
                self.error = None;
                let text = document.saved().to_owned();
                self.tab_mut().document = Some(document);
                self.set_tab_text(id, text, window, cx);
                self.focus_content(window, cx);
                true
            }
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                false
            }
        }
    }

    /// Shows `text` in a tab's editor as a note just read from disk: the
    /// cursor goes to the start and there is nothing to undo.
    fn set_tab_text(
        &mut self,
        id: usize,
        text: impl Into<SharedString>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(tab) = self.tab_by_id(id) else {
            return;
        };
        let text: SharedString = text.into();
        tab.editor
            .update(cx, |editor, cx| editor.set_value(text, window, cx));
        self.refresh_live(id, cx);
    }

    /// Shows a new version of a tab's note, leaving the cursor as near as
    /// possible to where it was.
    fn replace_tab_text(
        &mut self,
        id: usize,
        text: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(tab) = self.tab_by_id(id) else {
            return;
        };
        let editor = tab.editor.clone();
        let cursor = editor.read(cx).cursor().min(text.len());
        self.set_tab_text(id, text, window, cx);
        editor.update(cx, |editor, cx| {
            editor.set_selected_range(cursor..cursor, cx);
        });
    }

    /// Re-reads a tab's outline, tags, counts and unsaved state from its
    /// editor's text.
    fn refresh_live(&mut self, id: usize, cx: &mut Context<Self>) {
        let Some(tab) = self.tab_by_id_mut(id) else {
            return;
        };
        let text = tab.editor.read(cx).value();
        let meta = diamond_parse::parse(&text);
        let (words, characters) = notes::counts(&text, &meta);
        tab.dirty = tab.is_dirty(&text);
        tab.live = Live {
            meta,
            words,
            characters,
        };
    }

    /// Something was typed, pasted or inserted in a tab.
    fn tab_edited(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) {
        self.notice = None;
        self.refresh_live(id, cx);
        self.mirror(id, window, cx);
        self.schedule_autosave(id, window, cx);
    }

    /// Shows what was just typed in every other tab that has the same note
    /// open, so two views of one note never drift apart. The other views
    /// keep their own cursors.
    fn mirror(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) {
        let Some(tab) = self.tab_by_id(id) else {
            return;
        };
        let Some(path) = tab.path() else {
            return;
        };
        let copies: Vec<usize> = self
            .panes
            .iter()
            .flat_map(|pane| &pane.tabs)
            .filter(|other| other.id != id && other.path() == Some(path))
            .map(|other| other.id)
            .collect();
        if copies.is_empty() {
            return;
        }
        let text = tab.editor.read(cx).value().to_string();
        for copy in copies {
            self.replace_tab_text(copy, text.clone(), window, cx);
        }
    }

    fn schedule_autosave(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) {
        if self.tab_by_id(id).is_none_or(|tab| tab.conflict.is_some()) {
            return;
        }
        let task = cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(AUTOSAVE_DELAY).await;
            _ = this.update_in(cx, |this, window, cx| {
                if this.tab_by_id(id).is_some_and(|tab| tab.conflict.is_none()) {
                    this.save_tab(id, window, cx);
                }
            });
        });
        // Replacing the task drops the previous one, which cancels it.
        if let Some(tab) = self.tab_by_id_mut(id) {
            tab.autosave = Some(task);
        }
        cx.notify();
    }

    /// Writes the note in front now if it has unsaved changes. This is the
    /// user's explicit save: it settles a conflict in the editor's favour.
    /// Returns whether the note is now on disk as the editor shows it.
    pub fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        self.save_tab(self.tab().id, window, cx)
    }

    /// Writes one tab's note if it has unsaved changes, and shows the new
    /// text in any other tab that has the same note open.
    fn save_tab(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) -> bool {
        cx.notify();
        let Some((pane_ix, tab_ix)) = self.locate(id) else {
            return true;
        };
        let tab = &mut self.panes[pane_ix].tabs[tab_ix];
        tab.autosave = None;
        tab.conflict = None;
        let Some(document) = tab.document.as_mut() else {
            return true;
        };
        let text = tab.editor.read(cx).value();
        match self.session.save(document, &text) {
            Ok(written) => {
                tab.dirty = false;
                self.error = None;
                if written {
                    let path = document.path().clone();
                    let copies: Vec<usize> = self
                        .panes
                        .iter()
                        .flat_map(|pane| &pane.tabs)
                        .filter(|other| other.id != id && other.path() == Some(&path))
                        .map(|other| other.id)
                        .collect();
                    for copy in copies {
                        self.reconcile(copy, OpenChange::Changed(text.to_string()), window, cx);
                    }
                }
                true
            }
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                false
            }
        }
    }

    /// Writes every tab's unsaved changes. Returns whether all of them are
    /// now on disk.
    fn save_all(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        let mut all_saved = true;
        for id in self.tab_ids() {
            all_saved &= self.save_tab(id, window, cx);
        }
        all_saved
    }

    /// Writes unsaved changes when there is no window left to report to: on
    /// closing the window and on quitting. A note in conflict is left as it
    /// is on disk, as always.
    fn save_on_the_way_out(&mut self, cx: &mut App) {
        for tab in self.panes.iter_mut().flat_map(|pane| &mut pane.tabs) {
            if tab.conflict.is_some() {
                continue;
            }
            if let Some(document) = tab.document.as_mut() {
                let text = tab.editor.read(cx).value();
                // Nowhere to show a failure; the file is as it was.
                let _ = self.session.save(document, &text);
            }
        }
    }

    /// Makes sure a tab's edits are on disk before it shows something else
    /// or closes. In a conflict the edits go to a copy beside the note, so
    /// neither version is lost.
    fn leave_tab(&mut self, id: usize, window: &mut Window, cx: &mut Context<Self>) {
        let Some((pane_ix, tab_ix)) = self.locate(id) else {
            return;
        };
        let tab = &mut self.panes[pane_ix].tabs[tab_ix];
        if tab.conflict.take().is_none() {
            self.save_tab(id, window, cx);
            return;
        }
        tab.autosave = None;
        let Some(document) = tab.document.as_ref() else {
            return;
        };
        let text = tab.editor.read(cx).value();
        match self.session.save_conflict_copy(document, &text) {
            Ok(copy) => {
                self.reveal_in_tree(&copy, cx);
                self.notice = Some(format!("Your edits were kept in {copy}").into());
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    // ---- Moving around ----------------------------------------------------

    /// Notes where the cursor is, so coming back to this note finds it.
    fn remember_cursor(&mut self, cx: &mut Context<Self>) {
        let tab = self.tab_mut();
        let cursor = tab.editor.read(cx).cursor();
        tab.history.set_cursor(cursor);
    }

    /// Goes back to the note this tab showed before.
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
        let pane = &mut self.panes[self.active_pane];
        let history = &mut pane.tabs[pane.active].history;
        // Notes deleted since they were visited are stepped over.
        history.prune(|path| self.session.is_note(path));
        let place = if back {
            history.back()
        } else {
            history.forward()
        };
        if let Some(place) = place
            && self.show_note(&place.path, window, cx)
        {
            self.tab().editor.update(cx, |editor, cx| {
                editor.set_selected_range(place.cursor..place.cursor, cx);
            });
        }
        cx.notify();
    }

    /// Opens the note that the link under the cursor leads to, creating it
    /// if the link names a note that does not exist yet.
    pub fn follow_link(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(from) = self.current().cloned() else {
            return;
        };
        let (text, cursor) = {
            let editor = self.tab().editor.read(cx);
            (editor.value(), editor.cursor())
        };
        let followed = self.session.follow(&from, &text, cursor);
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
        let Some(from) = self.current().cloned() else {
            return;
        };
        let followed = self.session.follow_target(&from, &target);
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

    /// Switches the tab in front between editing its note and reading it
    /// rendered.
    pub fn toggle_reading(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let tab = self.tab_mut();
        if tab.reading.take().is_none() {
            tab.reading = Some(Default::default());
        }
        self.refresh_reading(cx);
        self.focus_content(window, cx);
        cx.notify();
    }

    /// Re-renders the Markdown of every reading view on screen whose note's
    /// text changed.
    fn refresh_reading(&mut self, cx: &mut Context<Self>) {
        for pane in &mut self.panes {
            let tab = &mut pane.tabs[pane.active];
            let Some((source, _)) = &tab.reading else {
                continue;
            };
            let text = tab.editor.read(cx).value();
            if *source != text || text.is_empty() {
                let rendered = match tab.document.as_ref() {
                    Some(document) => self.session.reading_markdown(document.path(), &text),
                    None => String::new(),
                };
                tab.reading = Some((text, rendered.into()));
            }
        }
    }

    /// Gives the keyboard to whatever shows the note in front: its editor,
    /// or the window itself in the reading view and in an empty tab.
    fn focus_content(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let tab = self.tab();
        if tab.reading.is_some() || tab.document.is_none() {
            self.focus.focus(window, cx);
        } else {
            self.tab()
                .editor
                .update(cx, |editor, cx| editor.focus(window, cx));
        }
    }

    /// Leaves the reading view, for actions that need the editor.
    fn start_editing(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.tab_mut().reading = None;
        self.focus_content(window, cx);
    }

    /// Puts the cursor at a byte offset in the note in front, for a click
    /// on a heading in the outline. The reading view cannot show a position
    /// yet, so this switches to the editor.
    pub fn jump_to(&mut self, offset: usize, window: &mut Window, cx: &mut Context<Self>) {
        self.start_editing(window, cx);
        self.tab().editor.update(cx, |editor, cx| {
            editor.set_selected_range(offset..offset, cx);
        });
        cx.notify();
    }

    // ---- Making, filling, renaming and deleting ---------------------------

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
        self.open_daily_note_for(Moment::now(), window, cx);
    }

    /// Inserts a template at the cursor, with its placeholders filled in
    /// for the note in front.
    pub fn insert_template(
        &mut self,
        template: &VaultPath,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.notify();
        let Some(into) = self.current() else {
            self.error = Some("Open a note to insert the template into".into());
            return;
        };
        match self.session.template_text(template, into, Moment::now()) {
            Ok(text) => {
                self.error = None;
                self.start_editing(window, cx);
                // Goes through the editor's own editing path, so it can be
                // undone and is saved like anything typed.
                self.tab()
                    .editor
                    .update(cx, |editor, cx| editor.insert(text, window, cx));
            }
            Err(failure) => self.error = Some(failure.to_string().into()),
        }
    }

    /// Moves a file or folder to the vault's trash.
    pub fn delete_entry(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        cx.notify();
        // Unsaved edits to a note that is about to go are written first, so
        // the trashed copy is the latest text.
        let going: Vec<usize> = self
            .panes
            .iter()
            .flat_map(|pane| &pane.tabs)
            .filter(|tab| tab.path().is_some_and(|open| is_at_or_under(path, open)))
            .map(|tab| tab.id)
            .collect();
        for &id in &going {
            if self.tab_by_id(id).is_some_and(|tab| tab.conflict.is_none()) {
                self.save_tab(id, window, cx);
            }
        }
        if let Err(failure) = self.session.delete(path) {
            self.error = Some(failure.to_string().into());
            return;
        }
        self.error = None;
        self.notice = Some(format!("Moved {path} to the trash").into());
        self.tell_plugins(|plugin| plugin.removed(path));
        for pane in &mut self.panes {
            for tab in &mut pane.tabs {
                tab.history.removed(path);
            }
        }
        for id in going {
            if let Some(tab) = self.tab_by_id_mut(id) {
                tab.document = None;
                tab.conflict = None;
                tab.autosave = None;
            }
            self.set_tab_text(id, "", window, cx);
        }
        self.refresh_tree(cx);
    }

    /// Asks a one-line question over the window. `answer` gets what was
    /// typed when Enter is pressed; Escape dismisses the question.
    pub fn prompt(
        &mut self,
        title: impl Into<SharedString>,
        hint: impl Into<SharedString>,
        initial: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
        answer: impl FnOnce(&mut Self, String, &mut Window, &mut Context<Self>) + 'static,
    ) {
        let initial = initial.to_owned();
        let input = cx.new(|cx| {
            let mut input = InputState::new(window, cx);
            input.set_value(initial, window, cx);
            // Selected, so typing replaces it.
            input.select_all(window, cx);
            input
        });
        let subscription =
            cx.subscribe_in(&input, window, |this, _, event: &InputEvent, window, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.confirm_prompt(window, cx);
                }
            });
        input.update(cx, |input, cx| input.focus(window, cx));
        self.overlay = Some(Overlay::Prompt(Prompt {
            title: title.into(),
            hint: hint.into(),
            input,
            answer: Box::new(answer),
            _subscription: subscription,
        }));
        cx.notify();
    }

    /// Hands what was typed in the prompt to whoever asked.
    fn confirm_prompt(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(Overlay::Prompt(prompt)) = self.overlay.take() else {
            return;
        };
        let typed = prompt.input.read(cx).value().to_string();
        self.focus_content(window, cx);
        (prompt.answer)(self, typed, window, cx);
        cx.notify();
    }

    /// Asks for a new name for a file or folder.
    pub fn start_rename(&mut self, path: &VaultPath, window: &mut Window, cx: &mut Context<Self>) {
        let name = self.session.display_name(path).to_owned();
        let from = path.clone();
        self.prompt(
            format!("Rename or move {path}"),
            "Enter to rename. A name with a / in it is a path from the vault root.",
            &name,
            window,
            cx,
            move |this, name, window, cx| this.rename_entry(&from, &name, window, cx),
        );
    }

    /// Changes the text of the note in front the way typing would: the
    /// change can be undone and is saved like anything typed. `change` gets
    /// the note's text and the cursor, and returns the range to replace and
    /// what to put there, or `None` to leave the note alone. Returns whether
    /// anything was changed.
    pub fn edit_note(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        change: impl FnOnce(&str, usize) -> Option<(std::ops::Range<usize>, String)>,
    ) -> bool {
        if self.current().is_none() {
            self.report("Open a note first", cx);
            return false;
        }
        self.start_editing(window, cx);
        let editor = self.tab().editor.clone();
        let (text, cursor) = {
            let editor = editor.read(cx);
            (editor.value(), editor.cursor())
        };
        let Some((range, replacement)) = change(&text, cursor) else {
            return false;
        };
        editor.update(cx, |editor, cx| {
            editor.set_selected_range(range, cx);
            editor.replace(replacement, window, cx);
        });
        cx.notify();
        true
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
        // Links are rewritten in each note's saved text, so every open note
        // has to be on disk first, and none may be in doubt.
        let in_conflict = self
            .panes
            .iter()
            .flat_map(|pane| &pane.tabs)
            .any(|tab| tab.conflict.is_some());
        if in_conflict {
            self.error = Some("Save the note that changed on disk first".into());
            return;
        }
        if !self.save_all(window, cx) {
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
        let renamed = match self.session.rename(from, &to) {
            Ok(renamed) => renamed,
            Err(failure) => {
                self.error = Some(failure.to_string().into());
                return;
            }
        };
        self.rename_expanded(from, &to);
        self.tell_plugins(|plugin| plugin.renamed(from, &to));
        for id in self.tab_ids() {
            let Some(tab) = self.tab_by_id_mut(id) else {
                continue;
            };
            tab.history.renamed(from, &to);
            let rewritten = tab
                .document
                .as_mut()
                .and_then(|document| document.follow_rename(&renamed))
                .map(str::to_owned);
            if let Some(text) = rewritten {
                self.replace_tab_text(id, text, window, cx);
            }
        }
        self.reveal_in_tree(&to, cx);
        match &renamed.failed {
            Some(failure) => {
                self.error = Some(format!("Renamed, but not every link: {failure}").into());
            }
            None => {
                self.notice = Some(
                    match renamed.edits.len() {
                        0 => format!("Renamed to {to}"),
                        1 => format!("Renamed to {to}; links updated in 1 note"),
                        count => format!("Renamed to {to}; links updated in {count} notes"),
                    }
                    .into(),
                );
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

    // ---- Settings ---------------------------------------------------------

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

    // ---- The sidebar and what is shown over the window --------------------

    /// Dismisses the palette or rename field and hands the keyboard back.
    fn close_overlay(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.overlay.take().is_some() {
            self.focus_content(window, cx);
            cx.notify();
        }
    }

    /// Handles a click on a sidebar row. With the platform's main modifier
    /// held, the note opens in a new tab.
    fn open_entry(&mut self, id: &str, new_tab: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Ok(path) = VaultPath::new(id) else {
            return;
        };
        if !self.session.is_note(&path) {
            if path.extension().is_some() {
                self.error = Some(format!("{path} is not a note; it cannot be opened yet").into());
                cx.notify();
            }
        } else if new_tab {
            self.open_in_new_tab(&path, window, cx);
        } else {
            self.open_note(&path, window, cx);
        }
    }

    /// Selects the note in front in the sidebar, if its row is showing.
    fn mark_current_in_tree(&mut self, cx: &mut Context<Self>) {
        let current: Option<SharedString> = self.current().map(|path| path.to_string().into());
        self.tree.update(cx, |tree, cx| {
            let row = current.and_then(|id| tree.index_of(&id));
            if tree.selected_index() != row {
                tree.set_selected_index(row, cx);
            }
        });
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
