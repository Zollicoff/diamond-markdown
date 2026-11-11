//! The palette: one search field over a list. It jumps to a note by name,
//! searches the text of every note, runs a command or picks a template.

use diamond_vault::VaultPath;
use gpui_kit::component::{
    ActiveTheme as _,
    command::{Command, CommandItem, CommandState},
};
use gpui_kit::*;

use super::{Overlay, Workspace};
use crate::plugin::RunCommand;

/// How many notes the palette lists at once.
const LIMIT: usize = 50;

/// What the palette is looking through.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PaletteMode {
    /// Note names, for jumping to a note.
    Notes,
    /// The text of every note.
    Search,
    /// Everything the app can do.
    Commands,
    /// The notes in the templates folder, to insert one.
    Templates,
}

impl PaletteMode {
    /// Whether the list is fixed and the palette narrows it as the user
    /// types. Otherwise each keystroke asks the index for a new list.
    fn filters_locally(self) -> bool {
        matches!(self, Self::Commands | Self::Templates)
    }
}

/// What choosing a row does.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum RowTarget {
    /// Opens a note, at a line for a search result.
    Note {
        path: VaultPath,
        line: Option<usize>,
    },
    /// Runs the command at this position in the window's list.
    Command(usize),
    /// Inserts this template into the open note.
    Template(VaultPath),
}

/// One row in the palette.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct PaletteRow {
    pub label: SharedString,
    pub target: RowTarget,
}

/// The palette while it is open.
pub(super) struct Palette {
    pub mode: PaletteMode,
    pub state: Entity<CommandState>,
    /// The rows currently offered, best match first.
    pub rows: Vec<PaletteRow>,
}

impl Workspace {
    /// Opens the palette in `mode` with `query` already typed.
    pub(super) fn open_palette(
        &mut self,
        mode: PaletteMode,
        query: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let state = cx.new(|cx| CommandState::new(window, cx));
        state.update(cx, |state, cx| {
            if !query.is_empty() {
                state.set_query(query.to_owned(), window, cx);
            }
            state.focus(window, cx);
        });
        self.overlay = Some(Overlay::Palette(Palette {
            mode,
            state,
            rows: self.palette_rows(mode, query),
        }));
        cx.notify();
    }

    /// Asks for a note to go to, by name.
    pub fn find_note(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_palette(PaletteMode::Notes, "", window, cx);
    }

    /// Asks for words to search every note for.
    pub fn search_notes(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_palette(PaletteMode::Search, "", window, cx);
    }

    /// Lists every command.
    pub fn show_commands(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_palette(PaletteMode::Commands, "", window, cx);
    }

    /// Asks for a template to insert at the cursor.
    pub fn choose_template(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_palette(PaletteMode::Templates, "", window, cx);
    }

    /// Lists the notes carrying a tag, for a click on the tag.
    pub fn search_tag(&mut self, tag: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.open_palette(PaletteMode::Search, &format!("tag:{tag}"), window, cx);
    }

    fn palette_rows(&self, mode: PaletteMode, query: &str) -> Vec<PaletteRow> {
        match mode {
            PaletteMode::Notes => self
                .session
                .quick_switch(query, LIMIT)
                .into_iter()
                .map(|(path, label)| PaletteRow {
                    label: label.into(),
                    target: RowTarget::Note { path, line: None },
                })
                .collect(),
            PaletteMode::Search => self
                .session
                .search(query, LIMIT)
                .into_iter()
                .map(|(path, label, line)| PaletteRow {
                    label: label.into(),
                    target: RowTarget::Note { path, line },
                })
                .collect(),
            PaletteMode::Commands => self
                .commands
                .iter()
                .enumerate()
                .map(|(index, command)| PaletteRow {
                    label: command.title.into(),
                    target: RowTarget::Command(index),
                })
                .collect(),
            PaletteMode::Templates => self
                .session
                .templates()
                .into_iter()
                .map(|(path, name)| PaletteRow {
                    label: name.into(),
                    target: RowTarget::Template(path),
                })
                .collect(),
        }
    }

    /// Lists the rows for what has been typed, in the modes that ask the
    /// index on every keystroke.
    fn requery_palette(&mut self, id: EntityId, query: &str, cx: &mut Context<Self>) {
        let Some(Overlay::Palette(palette)) = &self.overlay else {
            return;
        };
        if palette.state.entity_id() != id {
            return;
        }
        let rows = self.palette_rows(palette.mode, query);
        if let Some(Overlay::Palette(palette)) = &mut self.overlay {
            palette.rows = rows;
        }
        cx.notify();
    }

    /// Acts on the row that was chosen in the palette `id`.
    fn confirm_palette(
        &mut self,
        id: EntityId,
        row: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(Overlay::Palette(palette)) = &self.overlay else {
            return;
        };
        // A command that put something else over the window, such as the
        // rename field, has already taken this palette's place.
        if palette.state.entity_id() != id {
            return;
        }
        let target = palette.rows.get(row).map(|row| row.target.clone());
        self.close_overlay(window, cx);
        match target {
            Some(RowTarget::Note { path, line }) => self.open_at(&path, line, window, cx),
            Some(RowTarget::Template(path)) => self.insert_template(&path, window, cx),
            // The palette dispatched the command's action itself.
            Some(RowTarget::Command(_)) | None => {}
        }
    }

    /// Opens a note and, given a line, puts the cursor at its start.
    pub fn open_at(
        &mut self,
        path: &VaultPath,
        line: Option<usize>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.open_note(path, window, cx);
        let Some(line) = line else {
            return;
        };
        self.tab().editor.update(cx, |editor, cx| {
            let text = editor.value();
            let offset: usize = text.split_inclusive('\n').take(line).map(str::len).sum();
            editor.set_selected_range(offset..offset, cx);
        });
    }

    pub(super) fn render_palette(
        &self,
        palette: &Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let view = cx.entity();
        let id = palette.state.entity_id();
        let mode = palette.mode;

        let items = palette.rows.iter().map(|row| {
            let item = CommandItem::new().label(row.label.clone());
            match row.target {
                // Carrying the action makes the row show its shortcut, and
                // makes the palette dispatch it when the row is chosen.
                RowTarget::Command(index) => {
                    let command = &self.commands[index];
                    item.keywords(command.keywords.iter().copied())
                        .action(Box::new(RunCommand { index }))
                }
                _ => item,
            }
        });
        let mut command = Command::new(&palette.state)
            .filterable(mode.filters_locally())
            .placeholder(match mode {
                PaletteMode::Notes => "Find a note",
                PaletteMode::Search => "Search in all notes",
                PaletteMode::Commands => "Run a command",
                PaletteMode::Templates => "Insert a template",
            })
            .max_h(px(420.))
            .items(items)
            .on_confirm({
                let view = view.clone();
                move |chosen, window, cx| {
                    view.update(cx, |this, cx| {
                        this.confirm_palette(id, chosen.row, window, cx);
                    });
                }
            })
            .on_cancel({
                let view = view.clone();
                move |window, cx| {
                    view.update(cx, |this, cx| this.close_overlay(window, cx));
                }
            });
        if !mode.filters_locally() {
            command = command.on_query(move |query, _, cx| {
                view.update(cx, |this, cx| this.requery_palette(id, query, cx));
            });
        }
        if mode == PaletteMode::Templates && palette.rows.is_empty() {
            let folder = self.session.settings().templates.folder.clone();
            command = command.empty(move |_, _, cx| {
                div()
                    .p_4()
                    .text_sm()
                    .text_color(cx.theme().muted_foreground)
                    .child(format!(
                        "No templates yet. Notes in the {folder} folder are offered here."
                    ))
            });
        }
        command
    }
}
