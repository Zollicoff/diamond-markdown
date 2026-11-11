//! Every command the app has: its action, its default shortcut and its name
//! in the command palette.

use gpui_kit::{Action, App, KeyBinding, actions};

actions!(
    diamond,
    [
        SaveNote,
        NewNote,
        RenameNote,
        DeleteNote,
        QuickSwitch,
        SearchVault,
        CommandPalette,
        GoBack,
        GoForward,
        FollowLink,
        ToggleReading,
        NewTab,
        CloseTab,
        NextTab,
        PreviousTab,
        SplitRight,
        NextPane,
        PreviousPane,
        OpenDailyNote,
        InsertTemplate,
        ToggleTheme,
        UseSystemTheme,
        ReloadSettings,
        OpenVault,
        Quit,
    ]
);

/// The key context of the main window, which most shortcuts are bound in.
pub const WORKSPACE: &str = "Workspace";

/// The key context of a text input inside the main window. A binding here
/// wins over the input's own binding for the same key, provided it is
/// registered after the input's.
const WORKSPACE_INPUT: &str = "Workspace > Input";

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
// Window tests press the shortcuts by the same names.
#[cfg(test)]
pub(crate) use primary;

/// Back and forward. Alt with an arrow moves by word in a text field on
/// macOS, so the Command key is added there.
#[cfg(target_os = "macos")]
pub(crate) const BACK_FORWARD: (&str, &str) = ("cmd-alt-left", "cmd-alt-right");
#[cfg(not(target_os = "macos"))]
pub(crate) const BACK_FORWARD: (&str, &str) = ("alt-left", "alt-right");

/// Registers the default shortcuts. Call once at startup, after the UI
/// library has registered its own.
pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new(primary!("s"), SaveNote, Some(WORKSPACE)),
        KeyBinding::new(primary!("n"), NewNote, Some(WORKSPACE)),
        KeyBinding::new("f2", RenameNote, Some(WORKSPACE)),
        KeyBinding::new(primary!("o"), QuickSwitch, Some(WORKSPACE)),
        KeyBinding::new(primary!("shift-f"), SearchVault, Some(WORKSPACE)),
        // The text input binds this key to its own find-and-replace.
        KeyBinding::new(primary!("shift-f"), SearchVault, Some(WORKSPACE_INPUT)),
        KeyBinding::new(primary!("shift-p"), CommandPalette, Some(WORKSPACE)),
        KeyBinding::new(BACK_FORWARD.0, GoBack, Some(WORKSPACE)),
        KeyBinding::new(BACK_FORWARD.1, GoForward, Some(WORKSPACE)),
        KeyBinding::new("alt-enter", FollowLink, Some(WORKSPACE)),
        KeyBinding::new(primary!("e"), ToggleReading, Some(WORKSPACE)),
        // Off macOS the text input binds Ctrl-E to "move to end of line".
        #[cfg(not(target_os = "macos"))]
        KeyBinding::new("ctrl-e", ToggleReading, Some(WORKSPACE_INPUT)),
        KeyBinding::new(primary!("t"), NewTab, Some(WORKSPACE)),
        KeyBinding::new(primary!("w"), CloseTab, Some(WORKSPACE)),
        KeyBinding::new("ctrl-tab", NextTab, Some(WORKSPACE)),
        KeyBinding::new("ctrl-shift-tab", PreviousTab, Some(WORKSPACE)),
        KeyBinding::new(primary!("\\"), SplitRight, Some(WORKSPACE)),
        KeyBinding::new("f6", NextPane, Some(WORKSPACE)),
        KeyBinding::new("shift-f6", PreviousPane, Some(WORKSPACE)),
        KeyBinding::new(primary!("shift-d"), OpenDailyNote, Some(WORKSPACE)),
        KeyBinding::new(primary!("shift-t"), InsertTemplate, Some(WORKSPACE)),
        KeyBinding::new(primary!("shift-o"), OpenVault, None),
        KeyBinding::new(primary!("q"), Quit, None),
    ]);
}

/// A command as the palette lists it.
pub struct CommandSpec {
    /// The name shown and searched.
    pub title: &'static str,
    /// Other words that find it.
    pub keywords: &'static [&'static str],
    /// Makes the action the command runs.
    pub action: fn() -> Box<dyn Action>,
}

macro_rules! command {
    ($title:literal, $action:ident, [$($keyword:literal),*]) => {
        CommandSpec {
            title: $title,
            keywords: &[$($keyword),*],
            action: || Box::new($action),
        }
    };
}

/// Every command, in the order the palette lists them.
pub const COMMANDS: &[CommandSpec] = &[
    command!("New note", NewNote, ["create", "add"]),
    command!(
        "Open today's daily note",
        OpenDailyNote,
        ["journal", "diary"]
    ),
    command!("Insert template", InsertTemplate, ["snippet"]),
    command!(
        "Go to note",
        QuickSwitch,
        ["open", "switch", "find", "jump"]
    ),
    command!("Search in all notes", SearchVault, ["find", "grep", "text"]),
    command!("Go back", GoBack, ["previous", "history"]),
    command!("Go forward", GoForward, ["next", "history"]),
    command!("Follow link under cursor", FollowLink, ["open", "jump"]),
    command!(
        "Switch between editing and reading",
        ToggleReading,
        ["preview", "view", "render"]
    ),
    command!("New tab", NewTab, ["open"]),
    command!("Close tab", CloseTab, ["shut"]),
    command!("Next tab", NextTab, ["switch", "right"]),
    command!("Previous tab", PreviousTab, ["switch", "left"]),
    command!(
        "Split right",
        SplitRight,
        ["pane", "side by side", "column", "duplicate"]
    ),
    command!("Next pane", NextPane, ["split", "focus", "other"]),
    command!("Previous pane", PreviousPane, ["split", "focus", "other"]),
    command!("Rename or move this note", RenameNote, ["file", "name"]),
    command!("Delete this note", DeleteNote, ["trash", "remove"]),
    command!("Save", SaveNote, ["write"]),
    command!(
        "Switch between light and dark",
        ToggleTheme,
        ["theme", "appearance", "mode", "night"]
    ),
    command!(
        "Follow the system's light or dark setting",
        UseSystemTheme,
        ["theme", "appearance", "automatic"]
    ),
    command!(
        "Reload vault settings",
        ReloadSettings,
        ["config", "refresh"]
    ),
    command!("Open another vault", OpenVault, ["folder", "switch"]),
    command!("Quit", Quit, ["exit", "close"]),
];
