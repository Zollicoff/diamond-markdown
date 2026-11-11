//! Files that are not notes. An image opens in a tab; anything else is
//! handed to the app the system uses for it.

use std::path::PathBuf;
use std::rc::Rc;

use diamond_vault::VaultPath;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::*;

use crate::plugin::{Plugin, Run};
use crate::session::is_image;

/// The files plugin. It takes any file no other plugin shows, so it comes
/// last among them.
#[derive(Default)]
pub struct Files;

impl Plugin for Files {
    fn id(&self) -> &'static str {
        "files"
    }

    fn opener(&self, path: &VaultPath) -> Option<Run> {
        let path = path.clone();
        Some(Rc::new(move |workspace, window, cx| {
            let file = match workspace.session().absolute(&path) {
                Ok(file) => file,
                Err(problem) => {
                    workspace.report(problem.to_string(), cx);
                    return;
                }
            };
            if is_image(&path) {
                let name = path.file_name().to_owned();
                workspace.open_view(format!("image:{path}"), name, window, cx, |_, cx| {
                    cx.new(|_| ImageView { file })
                });
            } else {
                cx.open_with_system(&file);
                workspace.note(format!("Opened {path} in its own app"), cx);
            }
        }))
    }
}

/// An image, shown in a tab at the largest size that fits.
pub struct ImageView {
    file: PathBuf,
}

impl Render for ImageView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("image-view")
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .p_4()
            .bg(cx.theme().background)
            .test_support()
            .child(
                img(self.file.clone())
                    .max_w_full()
                    .max_h_full()
                    .object_fit(ObjectFit::Contain),
            )
    }
}
