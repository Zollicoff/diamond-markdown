//! Diamond Markdown desktop application.

mod notes;
mod recent;
mod session;
mod settings;
mod workspace;

use std::path::{Path, PathBuf};

use gpui_kit::*;

use crate::session::Session;
use crate::workspace::Workspace;

actions!(diamond, [Quit, OpenVault]);

/// A vault named on the command line or in `DIAMOND_VAULT`, which takes
/// precedence over the remembered ones.
fn requested_vault() -> Option<PathBuf> {
    std::env::args_os()
        .nth(1)
        .or_else(|| std::env::var_os("DIAMOND_VAULT"))
        .map(PathBuf::from)
}

/// Opens a window on the vault at `path` and remembers the vault.
fn open_vault(path: &Path, cx: &mut App) -> Result<(), String> {
    let (session, report) = Session::open(path).map_err(|error| error.to_string())?;
    eprintln!(
        "{}: indexed {} notes and {} links in {:.1?}",
        session.vault_name(),
        report.notes,
        report.links,
        report.total()
    );
    for (skipped, reason) in &report.skipped {
        eprintln!("skipped {skipped}: {reason}");
    }
    if let Some(config) = recent::config_dir()
        && let Err(error) = recent::remember(&config, session.vault_root())
    {
        eprintln!("could not remember this vault: {error}");
    }

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
    .map_err(|error| error.to_string())?;
    cx.activate(true);
    Ok(())
}

/// Asks for a folder with the system's folder picker and opens it as a vault
/// in a new window. With `quit_if_cancelled`, backing out of the picker ends
/// the app, for the case where there is no other window to return to.
fn choose_vault(quit_if_cancelled: bool, cx: &mut App) {
    let chosen = cx.prompt_for_paths(PathPromptOptions {
        files: false,
        directories: true,
        multiple: false,
        prompt: Some("Open Vault".into()),
    });
    cx.spawn(async move |cx| {
        let folder = match chosen.await {
            Ok(Ok(Some(mut paths))) => paths.pop(),
            _ => None,
        };
        cx.update(|cx| {
            let opened = folder.map(|folder| open_vault(&folder, cx));
            match opened {
                Some(Ok(())) => {}
                Some(Err(error)) => {
                    eprintln!("diamond: {error}");
                    if quit_if_cancelled {
                        cx.quit();
                    }
                }
                None if quit_if_cancelled => cx.quit(),
                None => {}
            }
        })
    })
    .detach();
}

fn main() {
    let requested = requested_vault();

    gpui_kit::application().run(move |cx| {
        gpui_kit::init(cx);
        workspace::init(cx);
        cx.bind_keys([
            KeyBinding::new(workspace::primary!("q"), Quit, None),
            KeyBinding::new(workspace::primary!("shift-o"), OpenVault, None),
        ]);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_action(|_: &OpenVault, cx| choose_vault(false, cx));

        // A vault named at launch must open or the launch fails loudly.
        if let Some(path) = requested {
            if let Err(error) = open_vault(&path, cx) {
                eprintln!("diamond: {error}");
                std::process::exit(1);
            }
            return;
        }
        // Otherwise reopen the last vault, and ask if there is none.
        let last = recent::config_dir().and_then(|config| recent::latest_existing(&config));
        match last {
            Some(path) if open_vault(&path, cx).is_ok() => {}
            _ => choose_vault(true, cx),
        }
    });
}
