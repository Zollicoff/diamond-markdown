//! Diamond's plugin interface.
//!
//! A plugin is a feature kept in its own module: bookmarks, the calendar,
//! tasks. It adds to the app only through what is declared here: commands
//! for the palette and the keyboard, sections in the context panel, views
//! that open in a tab, and files of its own in the vault's `.diamond`
//! folder. The core plugins in `crate::plugins` are compiled into the app
//! and use nothing else, which keeps the interface honest for the day
//! plugins come from outside.

use std::any::Any;
use std::rc::Rc;

use diamond_vault::VaultPath;
use gpui_kit::{Action, Context, Window};

use crate::session::Session;
use crate::workspace::Workspace;

/// What a command or a click on a row does.
pub type Run = Rc<dyn Fn(&mut Workspace, &mut Window, &mut Context<Workspace>)>;

/// Runs the plugin command at this position in the window's command list.
/// One action carries every plugin command, so a plugin needs no action
/// types of its own to appear in the palette or to have a shortcut.
#[derive(Clone, PartialEq, Debug, Action)]
#[action(namespace = diamond, no_json)]
pub struct RunCommand {
    /// Position in the list built when the window opened.
    pub index: usize,
}

/// A command a plugin adds.
#[derive(Clone)]
pub struct Command {
    /// The name shown and searched in the palette.
    pub title: &'static str,
    /// Other words that find it.
    pub keywords: &'static [&'static str],
    /// The default shortcut, in the main window, if it has one.
    pub shortcut: Option<&'static str>,
    /// What it does.
    pub run: Run,
}

impl Command {
    /// A command without a shortcut.
    pub fn new(
        title: &'static str,
        keywords: &'static [&'static str],
        run: impl Fn(&mut Workspace, &mut Window, &mut Context<Workspace>) + 'static,
    ) -> Self {
        Self {
            title,
            keywords,
            shortcut: None,
            run: Rc::new(run),
        }
    }

    /// Gives the command a default shortcut.
    pub fn shortcut(mut self, keys: &'static str) -> Self {
        self.shortcut = Some(keys);
        self
    }
}

/// What a click on a row in a plugin's section does.
#[derive(Clone)]
pub enum RowAction {
    /// Opens a note.
    Open(VaultPath),
    /// Anything else.
    Run(Run),
}

/// One row in a plugin's section of the context panel.
#[derive(Clone)]
pub struct Row {
    /// The row's text.
    pub label: String,
    /// What a click does.
    pub action: RowAction,
}

/// A titled list a plugin adds to the context panel.
#[derive(Clone)]
pub struct Section {
    /// The heading, shown in capitals with the number of rows.
    pub title: &'static str,
    /// The rows, top to bottom.
    pub rows: Vec<Row>,
}

/// A feature of the app.
///
/// Every method but [`Plugin::id`] has a default that adds nothing, so a
/// plugin implements only what it uses.
pub trait Plugin: Any {
    /// A short, stable name: `bookmarks`. It names the plugin's file in the
    /// vault, so it must not change.
    fn id(&self) -> &'static str;

    /// Called when a vault is opened, to read whatever the plugin keeps.
    fn load(&mut self, _session: &Session) {}

    /// The commands the plugin adds. Called once, when the window opens.
    fn commands(&self) -> Vec<Command> {
        Vec::new()
    }

    /// Sections for the context panel, given the note in front.
    fn sections(&self, _session: &Session, _current: Option<&VaultPath>) -> Vec<Section> {
        Vec::new()
    }

    /// What opens a file that is not a note, if this plugin shows files
    /// like it. Asked when such a file is clicked in the sidebar.
    fn opener(&self, _path: &VaultPath) -> Option<Run> {
        None
    }

    /// A file or folder was renamed or moved. Returns whether the plugin
    /// changed something it keeps, so it can be written.
    fn renamed(&mut self, _from: &VaultPath, _to: &VaultPath) -> bool {
        false
    }

    /// A file or folder was deleted. Returns as [`Plugin::renamed`] does.
    fn removed(&mut self, _path: &VaultPath) -> bool {
        false
    }

    /// Writes what the plugin keeps. Called after it reports a change.
    fn store(&self, _session: &Session) -> Result<(), String> {
        Ok(())
    }
}
