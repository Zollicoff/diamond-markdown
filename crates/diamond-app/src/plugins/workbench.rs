//! The window's own commands: notes, moving around, tabs and panes, and how
//! the app looks. They reach the palette and the keyboard the same way every
//! other plugin's do.

use gpui_kit::{Context, Window};

use crate::actions::{BACK_FORWARD, OpenVault, primary};
use crate::plugin::{Command, Plugin};
use crate::workspace::Workspace;

/// Runs `act` on the note in front, or says that there is none.
fn on_current(
    workspace: &mut Workspace,
    window: &mut Window,
    cx: &mut Context<Workspace>,
    act: fn(&mut Workspace, &diamond_vault::VaultPath, &mut Window, &mut Context<Workspace>),
) {
    match workspace.current().cloned() {
        Some(path) => act(workspace, &path, window, cx),
        None => workspace.report("Open a note first", cx),
    }
}

/// The plugin that holds the window's own commands.
#[derive(Default)]
pub struct Workbench;

impl Plugin for Workbench {
    fn id(&self) -> &'static str {
        "workbench"
    }

    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new("New note", &["create", "add"], |workspace, window, cx| {
                workspace.new_note(None, window, cx);
            })
            .shortcut(primary!("n")),
            Command::new(
                "Open today's daily note",
                &["journal", "diary"],
                Workspace::open_daily_note,
            )
            .shortcut(primary!("shift-d")),
            Command::new("Insert template", &["snippet"], Workspace::choose_template)
                .shortcut(primary!("shift-t")),
            Command::new(
                "Go to note",
                &["open", "switch", "find", "jump"],
                Workspace::find_note,
            )
            .shortcut(primary!("o")),
            Command::new(
                "Search in all notes",
                &["find", "grep", "text"],
                Workspace::search_notes,
            )
            .shortcut(primary!("shift-f")),
            Command::new(
                "Show every command",
                &["palette", "actions"],
                Workspace::show_commands,
            )
            .shortcut(primary!("shift-p")),
            Command::new("Go back", &["previous", "history"], Workspace::go_back)
                .shortcut(BACK_FORWARD.0),
            Command::new("Go forward", &["next", "history"], Workspace::go_forward)
                .shortcut(BACK_FORWARD.1),
            Command::new(
                "Follow link under cursor",
                &["open", "jump"],
                Workspace::follow_link,
            )
            .shortcut("alt-enter"),
            Command::new(
                "Switch between editing and reading",
                &["preview", "view", "render"],
                Workspace::toggle_reading,
            )
            .shortcut(primary!("e")),
            Command::new("New tab", &["open"], Workspace::new_tab).shortcut(primary!("t")),
            Command::new("Close tab", &["shut"], Workspace::close_current_tab)
                .shortcut(primary!("w")),
            Command::new("Next tab", &["switch", "right"], |workspace, window, cx| {
                workspace.cycle_tab(true, window, cx);
            })
            .shortcut("ctrl-tab"),
            Command::new(
                "Previous tab",
                &["switch", "left"],
                |workspace, window, cx| {
                    workspace.cycle_tab(false, window, cx);
                },
            )
            .shortcut("ctrl-shift-tab"),
            Command::new(
                "Split right",
                &["pane", "side by side", "column", "duplicate"],
                Workspace::split_right,
            )
            .shortcut(primary!("\\")),
            Command::new(
                "Next pane",
                &["split", "focus", "other"],
                |workspace, window, cx| {
                    workspace.cycle_pane(true, window, cx);
                },
            )
            .shortcut("f6"),
            Command::new(
                "Previous pane",
                &["split", "focus", "other"],
                |workspace, window, cx| workspace.cycle_pane(false, window, cx),
            )
            .shortcut("shift-f6"),
            Command::new(
                "Rename or move this note",
                &["file", "name"],
                |workspace, window, cx| on_current(workspace, window, cx, Workspace::start_rename),
            )
            .shortcut("f2"),
            Command::new(
                "Delete this note",
                &["trash", "remove"],
                |workspace, window, cx| on_current(workspace, window, cx, Workspace::delete_entry),
            ),
            Command::new("Save", &["write"], |workspace, window, cx| {
                workspace.save(window, cx);
            })
            .shortcut(primary!("s")),
            Command::new(
                "Switch between light and dark",
                &["theme", "appearance", "mode", "night"],
                Workspace::toggle_theme,
            ),
            Command::new(
                "Follow the system's light or dark setting",
                &["theme", "appearance", "automatic"],
                Workspace::use_system_theme,
            ),
            Command::new(
                "Reload vault settings",
                &["config", "refresh"],
                |workspace, _, cx| workspace.reload_settings(cx),
            ),
            // These two are also bound for the whole app, so they work when
            // no vault window has the keyboard.
            Command::new(
                "Open another vault",
                &["folder", "switch"],
                |_, window, cx| window.dispatch_action(Box::new(OpenVault), cx),
            )
            .shortcut(primary!("shift-o")),
            Command::new("Quit", &["exit", "close"], |_, _, cx| cx.quit()).shortcut(primary!("q")),
        ]
    }
}
