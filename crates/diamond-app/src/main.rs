//! Diamond Markdown desktop application.

mod session;
mod workspace;

use std::path::PathBuf;

use gpui_kit::*;

use crate::session::Session;
use crate::workspace::Workspace;

actions!(diamond, [Quit]);

/// The vault to open: the first command-line argument, then the
/// `DIAMOND_VAULT` environment variable. A vault picker replaces this once
/// the app remembers vaults.
fn vault_path() -> Option<PathBuf> {
    std::env::args_os()
        .nth(1)
        .or_else(|| std::env::var_os("DIAMOND_VAULT"))
        .map(PathBuf::from)
}

fn main() {
    let Some(path) = vault_path() else {
        eprintln!("usage: diamond <vault folder>");
        std::process::exit(2);
    };
    let (session, report) = match Session::open(&path) {
        Ok(opened) => opened,
        Err(error) => {
            eprintln!("diamond: {error}");
            std::process::exit(1);
        }
    };
    eprintln!(
        "indexed {} notes and {} links in {:.1?}",
        report.notes,
        report.links,
        report.total()
    );
    for (path, reason) in &report.skipped {
        eprintln!("skipped {path}: {reason}");
    }

    gpui_kit::application().run(move |cx| {
        gpui_kit::init(cx);
        workspace::init(cx);
        cx.bind_keys([KeyBinding::new(workspace::primary!("q"), Quit, None)]);
        cx.on_action(|_: &Quit, cx| cx.quit());

        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size(px(1200.), px(800.)),
                cx,
            ))),
            titlebar: Some(TitlebarOptions {
                title: Some(format!("{} — Diamond Markdown", session.vault_name()).into()),
                ..TitlebarOptions::default()
            }),
            ..WindowOptions::default()
        };
        gpui_kit::open_window(options, cx, |window, cx| {
            cx.new(|cx| {
                let mut workspace = Workspace::new(session, window, cx);
                workspace.watch(window, cx);
                workspace
            })
        })
        .expect("failed to open the main window");
        cx.activate(true);
    });
}
