//! Shortcuts, and the two actions that work without a window.
//!
//! Everything the app can do in a window is a command that a plugin adds
//! (see [`crate::plugin`]), carried by one action, [`RunCommand`]. Opening a
//! vault and quitting are actions of their own because they must also work
//! when no vault window has the keyboard.

use gpui_kit::{App, KeyBinding, actions};

use crate::plugin::RunCommand;

actions!(diamond, [OpenVault, Quit]);

/// The key context of the main window, which commands are bound in.
pub const WORKSPACE: &str = "Workspace";

/// The key context of a text field inside the main window. A binding here
/// wins over the field's own binding for the same key, provided it is
/// registered after the field's. Without it the editor would keep a few of
/// our shortcuts for itself (its own find-and-replace, for one).
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
pub(crate) use primary;

/// Back and forward. Alt with an arrow moves by word in a text field on
/// macOS, so the Command key is added there.
#[cfg(target_os = "macos")]
pub(crate) const BACK_FORWARD: (&str, &str) = ("cmd-alt-left", "cmd-alt-right");
#[cfg(not(target_os = "macos"))]
pub(crate) const BACK_FORWARD: (&str, &str) = ("alt-left", "alt-right");

/// Registers every default shortcut. Call once at startup, after the UI
/// library has registered its own.
pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new(primary!("shift-o"), OpenVault, None),
        KeyBinding::new(primary!("q"), Quit, None),
    ]);

    // Commands are numbered in the order of the core plugins, which is the
    // same in every window.
    let mut shortcuts = Vec::new();
    let commands = crate::plugins::core()
        .into_iter()
        .flat_map(|plugin| plugin.commands());
    for (index, command) in commands.enumerate() {
        let Some(keys) = command.shortcut else {
            continue;
        };
        for context in [WORKSPACE, WORKSPACE_INPUT] {
            shortcuts.push(KeyBinding::new(keys, RunCommand { index }, Some(context)));
        }
    }
    cx.bind_keys(shortcuts);
}
