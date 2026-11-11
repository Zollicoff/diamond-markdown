//! State shared by every window: the app's settings and how it looks.

use std::path::PathBuf;

use gpui_kit::component::theme::{Theme, ThemeMode};
use gpui_kit::{App, Global, Window};

use crate::settings::{AppSettings, Appearance};

/// The app's settings and where they are kept.
#[derive(Default)]
pub struct AppState {
    /// The settings folder, when one could be worked out. Without it the
    /// settings still apply but are not remembered.
    config_dir: Option<PathBuf>,
    settings: AppSettings,
}

impl Global for AppState {}

/// Loads the app's settings from `config_dir` and applies them. Returns what
/// is wrong with the settings file, if it exists but cannot be used.
pub fn init(config_dir: Option<PathBuf>, cx: &mut App) -> Option<String> {
    let loaded = config_dir
        .as_deref()
        .map(AppSettings::load)
        .unwrap_or_default();
    cx.set_global(AppState {
        config_dir,
        settings: loaded.settings,
    });
    apply(None, cx);
    loaded.problem
}

/// The appearance the settings ask for.
pub fn appearance(cx: &App) -> Appearance {
    cx.try_global::<AppState>()
        .map(|state| state.settings.appearance)
        .unwrap_or_default()
}

/// Makes the app look the way the settings say. `window` is the window whose
/// system appearance is followed when the setting is to follow the system.
pub fn apply(window: Option<&mut Window>, cx: &mut App) {
    match appearance(cx) {
        Appearance::System => Theme::sync_system_appearance(window, cx),
        Appearance::Light => Theme::change(ThemeMode::Light, window, cx),
        Appearance::Dark => Theme::change(ThemeMode::Dark, window, cx),
    }
}

/// Changes the appearance in every window and remembers the choice.
///
/// The change always takes effect. The error, if any, is why it could not be
/// written to the settings file and so will not survive a restart.
pub fn set_appearance(
    appearance: Appearance,
    window: Option<&mut Window>,
    cx: &mut App,
) -> Result<(), String> {
    if !cx.has_global::<AppState>() {
        cx.set_global(AppState::default());
    }
    let state = cx.global_mut::<AppState>();
    state.settings.appearance = appearance;
    let saved = match &state.config_dir {
        Some(dir) => state.settings.save(dir).map_err(|error| error.to_string()),
        None => Ok(()),
    };
    apply(window, cx);
    saved
}

/// Switches between light and dark, whichever is not showing now.
pub fn toggle_appearance(window: Option<&mut Window>, cx: &mut App) -> Result<(), String> {
    let next = if Theme::global(cx).is_dark() {
        Appearance::Light
    } else {
        Appearance::Dark
    };
    set_appearance(next, window, cx)
}
