//! Tabs and panes.
//!
//! A tab holds one note with its own editor, history and unsaved state. A
//! pane is a row of tabs with one of them showing. The window holds one or
//! more panes side by side.

use diamond_parse::NoteMeta;
use diamond_vault::VaultPath;
use gpui_kit::component::input::EditorState;
use gpui_kit::{Entity, SharedString, Subscription, Task};

use crate::history::History;
use crate::session::Document;

/// What a note's text says right now, as opposed to at its last save.
#[derive(Default)]
pub(super) struct Live {
    /// Headings, tags and the rest, parsed from the editor's text.
    pub meta: NoteMeta,
    pub words: usize,
    pub characters: usize,
}

/// One tab.
pub(super) struct Tab {
    /// Names the tab for as long as the window is open. Positions change as
    /// tabs are opened, closed and moved; this does not.
    pub id: usize,
    /// The note in the tab. A new tab has none until one is opened in it.
    pub document: Option<Document>,
    pub editor: Entity<EditorState>,
    /// Whether the editor holds changes that are not on disk yet. Kept up
    /// to date as the text changes, so drawing the window never has to
    /// compare whole notes.
    pub dirty: bool,
    /// Set when the note changed or vanished on disk, or was saved from
    /// another tab, while this editor held unsaved edits. Nothing is written
    /// automatically until the user saves, so neither version is lost
    /// without a decision.
    pub conflict: Option<SharedString>,
    pub autosave: Option<Task<()>>,
    /// When set, the note is shown rendered and read-only. Holds the editor
    /// text the rendering was made from and the Markdown handed to the
    /// renderer, so the conversion runs only when the text changes.
    pub reading: Option<(SharedString, SharedString)>,
    /// Back and forward through the notes this tab has shown.
    pub history: History,
    pub live: Live,
    pub(super) _subscription: Subscription,
}

impl Tab {
    /// The note in the tab.
    pub fn path(&self) -> Option<&VaultPath> {
        self.document.as_ref().map(Document::path)
    }

    /// Whether `text` differs from the note as last read or saved. A tab
    /// without a note has nothing to save.
    pub fn is_dirty(&self, text: &str) -> bool {
        self.document
            .as_ref()
            .is_some_and(|document| document.is_dirty(text))
    }
}

/// A row of tabs, one of them showing.
pub(super) struct Pane {
    /// Never empty.
    pub tabs: Vec<Tab>,
    /// Which tab is showing.
    pub active: usize,
}

impl Pane {
    /// The tab that is showing.
    pub fn tab(&self) -> &Tab {
        &self.tabs[self.active]
    }
}
