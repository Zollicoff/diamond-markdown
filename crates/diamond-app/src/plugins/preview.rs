//! Preview: the note rendered beside its editor, following every keystroke.
//!
//! This is the reading view in a second pane on the same note. It is what
//! there is until the editor itself renders Markdown in place.

use crate::plugin::{Command, Plugin};

/// The preview plugin.
#[derive(Default)]
pub struct Preview;

impl Plugin for Preview {
    fn id(&self) -> &'static str {
        "preview"
    }

    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new(
                "Open a live preview to the side",
                &["render", "split", "reading", "side by side"],
                |workspace, window, cx| {
                    if workspace.current().is_none() {
                        workspace.report("Open a note to preview it", cx);
                        return;
                    }
                    workspace.split_right(window, cx);
                    workspace.toggle_reading(window, cx);
                    // The keyboard goes back to the editor: the preview is
                    // for looking at while typing.
                    workspace.cycle_pane(false, window, cx);
                },
            )
            .shortcut(crate::actions::primary!("shift-e")),
        ]
    }
}
