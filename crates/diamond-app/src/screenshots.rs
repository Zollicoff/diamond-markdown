//! Pictures of the real window, for the README and the website.
//!
//! ```sh
//! cargo run -p diamond-app --features screenshots -- --screenshots sample-vault pictures
//! ```
//!
//! Each picture is the window as the app draws it: the same views, drawn off
//! screen by the same code and read back as an image. Nothing is captured
//! from the display, so this works with no screen to look at and without
//! permission to record one. The pictures hold the window's contents only,
//! without the title bar the system adds.
//!
//! The vault is copied first, so making the pictures never changes it.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use diamond_vault::VaultPath;
use gpui_kit::{AppContext as _, Context, VisualTestAppContext, Window, px, size};

use crate::session::Session;
use crate::settings::Appearance;
use crate::workspace::Workspace;

/// A window wide enough for two panes side by side.
const WIDE: (f32, f32) = (1440., 760.);
/// A smaller window for a picture of one view. With both side panels at
/// their starting width, the middle of it is 800 points across.
const VIEW: (f32, f32) = (1320., 600.);

/// What to do in a freshly opened window before its picture is taken.
type Scene = fn(&mut Workspace, &mut Window, &mut Context<Workspace>);

fn open(workspace: &mut Workspace, note: &str, window: &mut Window, cx: &mut Context<Workspace>) {
    if let Ok(path) = VaultPath::new(note) {
        workspace.open_note(&path, window, cx);
    }
}

/// Runs a command by the name the palette lists it under.
fn command(
    workspace: &mut Workspace,
    title: &str,
    window: &mut Window,
    cx: &mut Context<Workspace>,
) {
    let index = crate::plugins::core()
        .iter()
        .flat_map(|plugin| plugin.commands())
        .position(|command| command.title == title);
    match index {
        Some(index) => workspace.run_command(index, window, cx),
        None => eprintln!("screenshots: there is no command named {title:?}"),
    }
}

/// The pictures: a file name, light or dark, the window's size, and how to
/// set the window up. The notes named here are the ones in the repository's
/// `sample-vault`.
const SCENES: &[(&str, Appearance, (f32, f32), Scene)] = &[
    (
        "editor-and-preview",
        Appearance::Dark,
        WIDE,
        |workspace, window, cx| {
            open(workspace, "Projects/Launch.md", window, cx);
            command(workspace, "Open a live preview to the side", window, cx);
        },
    ),
    (
        "editor-and-preview-light",
        Appearance::Light,
        WIDE,
        |workspace, window, cx| {
            open(workspace, "Projects/Launch.md", window, cx);
            command(workspace, "Open a live preview to the side", window, cx);
        },
    ),
    ("board", Appearance::Dark, VIEW, |workspace, window, cx| {
        open(workspace, "Projects/Launch.md", window, cx);
        command(workspace, "Show this note as a board", window, cx);
    }),
    ("tasks", Appearance::Dark, VIEW, |workspace, window, cx| {
        open(workspace, "Home.md", window, cx);
        command(workspace, "Show tasks", window, cx);
    }),
    ("graph", Appearance::Dark, VIEW, |workspace, window, cx| {
        command(workspace, "Show graph", window, cx);
    }),
    ("canvas", Appearance::Dark, VIEW, |workspace, window, cx| {
        if let Ok(path) = VaultPath::new("Map.canvas.toml") {
            workspace.open_file(&path, window, cx);
        }
    }),
    (
        "calendar",
        Appearance::Dark,
        VIEW,
        |workspace, window, cx| {
            command(workspace, "Open today's daily note", window, cx);
            command(workspace, "Show calendar", window, cx);
        },
    ),
    ("query", Appearance::Dark, VIEW, |workspace, window, cx| {
        open(workspace, "Projects/Overview.md", window, cx);
        command(workspace, "Open a live preview to the side", window, cx);
    }),
    (
        "commands",
        Appearance::Dark,
        WIDE,
        |workspace, window, cx| {
            open(workspace, "Home.md", window, cx);
            command(workspace, "Show every command", window, cx);
        },
    ),
];

/// Copies a folder and everything in it, hidden files included.
fn copy_folder(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_folder(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Takes every picture of `vault` and writes them into `out` as PNG files.
/// Must be called on the main thread.
pub fn run(vault: &Path, out: &Path) -> Result<(), String> {
    let text = |error: &dyn std::fmt::Display| error.to_string();
    std::fs::create_dir_all(out).map_err(|error| text(&error))?;
    let scratch: PathBuf =
        std::env::temp_dir().join(format!("diamond-screenshots-{}", std::process::id()));

    let mut cx = VisualTestAppContext::with_asset_source(
        gpui_kit::platform::current_platform(false),
        Arc::new(gpui_kit::assets::Assets),
    );
    cx.update(|cx| {
        gpui_kit::init(cx);
        crate::actions::bind_keys(cx);
        // No settings folder: nothing about this run is remembered.
        crate::app::init(None, cx);
    });

    let outcome = (|| {
        for (name, appearance, (width, height), scene) in SCENES {
            // A fresh copy for each picture, named for what the sidebar shows.
            let copy = scratch.join(name).join("Notes");
            copy_folder(vault, &copy).map_err(|error| text(&error))?;
            let (session, _) = Session::open(&copy).map_err(|error| text(&error))?;
            cx.update(|cx| crate::app::set_appearance(*appearance, None, cx))?;

            let mut session = Some(session);
            let mut workspace = None;
            let window = cx
                .open_offscreen_window(size(px(*width), px(*height)), |window, cx| {
                    let view = cx
                        .new(|cx| Workspace::new(session.take().expect("built once"), window, cx));
                    workspace = Some(view.clone());
                    cx.new(|cx| gpui_kit::base::Root::new(view, window, cx))
                })
                .map_err(|error| text(&error))?;
            let workspace = workspace.expect("the window was built");

            cx.update_window(window.into(), |_, window, cx| {
                workspace.update(cx, |workspace, cx| scene(workspace, window, cx));
            })
            .map_err(|error| text(&error))?;
            // Let highlighting and anything else that finishes a moment later
            // land, then draw once more.
            for _ in 0..4 {
                cx.run_until_parked();
                cx.advance_clock(Duration::from_millis(50));
                cx.update_window(window.into(), |_, window, _| window.refresh())
                    .map_err(|error| text(&error))?;
            }
            cx.run_until_parked();

            let picture = cx
                .capture_screenshot(window.into())
                .map_err(|error| text(&error))?;
            let file = out.join(format!("{name}.png"));
            picture.save(&file).map_err(|error| text(&error))?;
            println!(
                "{} ({} x {})",
                file.display(),
                picture.width(),
                picture.height()
            );

            cx.update_window(window.into(), |_, window, _| window.remove_window())
                .map_err(|error| text(&error))?;
            cx.run_until_parked();
        }
        Ok(())
    })();
    // The copies are scratch; failing to remove them is not worth reporting.
    let _ = std::fs::remove_dir_all(&scratch);
    outcome
}
