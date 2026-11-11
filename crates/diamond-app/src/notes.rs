//! Daily notes, templates and text statistics.
//!
//! Where daily notes go and where templates are kept comes from the vault's
//! own settings; see [`crate::settings`].

// The window does not use this module yet; the workspace wiring that follows
// does, and this goes away with it.
#![allow(dead_code)]

use diamond_vault::{VaultError, VaultPath};

use crate::settings::VaultSettings;

/// The local date and time, passed in so the logic can be tested.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Moment {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
}

impl Moment {
    /// The current local date and time.
    pub fn now() -> Self {
        use chrono::{Datelike as _, Timelike as _};
        let now = chrono::Local::now();
        Self {
            year: now.year(),
            month: now.month(),
            day: now.day(),
            hour: now.hour(),
            minute: now.minute(),
        }
    }

    /// `2026-11-11`
    pub fn date(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// `09:05`
    pub fn time(&self) -> String {
        format!("{:02}:{:02}", self.hour, self.minute)
    }
}

/// A folder setting as the start of a vault path: `""` for the vault root,
/// otherwise the folder with a trailing slash.
fn folder_prefix(folder: &str) -> String {
    match folder.trim().trim_matches('/') {
        "" => String::new(),
        folder => format!("{folder}/"),
    }
}

/// Where the daily note for `moment` lives: a note named after the date,
/// `2026-11-11.md`, in the daily-notes folder.
pub fn daily_note_path(settings: &VaultSettings, moment: Moment) -> Result<VaultPath, VaultError> {
    VaultPath::new(&format!(
        "{}{}.md",
        folder_prefix(&settings.daily.folder),
        moment.date()
    ))
}

/// The template a new daily note starts from, if the settings name one.
///
/// A bare name is a note in the templates folder; a name with a `/` in it is
/// a path from the vault root. `.md` may be left off either way.
pub fn daily_template_path(settings: &VaultSettings) -> Option<VaultPath> {
    let written = settings.daily.template.trim().trim_matches('/');
    if written.is_empty() {
        return None;
    }
    let extension = if written.to_lowercase().ends_with(".md") {
        ""
    } else {
        ".md"
    };
    let folder = if written.contains('/') {
        String::new()
    } else {
        templates_prefix(settings)
    };
    VaultPath::new(&format!("{folder}{written}{extension}")).ok()
}

/// The templates folder as the start of a vault path, with a trailing slash.
/// A vault whose templates folder is set to nothing has no templates, which
/// is reported as a prefix no path starts with.
pub fn templates_prefix(settings: &VaultSettings) -> String {
    match folder_prefix(&settings.templates.folder) {
        prefix if prefix.is_empty() => "/".to_owned(),
        prefix => prefix,
    }
}

/// Fills in a template's placeholders: `{{title}}`, `{{date}}` and
/// `{{time}}`, with optional spaces inside the braces. Anything else in
/// double braces is left as written.
pub fn fill_template(template: &str, title: &str, moment: Moment) -> String {
    let mut output = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find("{{") {
        output.push_str(&rest[..open]);
        let after = &rest[open + 2..];
        let Some(close) = after.find("}}") else {
            output.push_str(&rest[open..]);
            return output;
        };
        match after[..close].trim() {
            "title" => output.push_str(title),
            "date" => output.push_str(&moment.date()),
            "time" => output.push_str(&moment.time()),
            _ => output.push_str(&rest[open..open + 2 + close + 2]),
        }
        rest = &after[close + 2..];
    }
    output.push_str(rest);
    output
}

/// Words and characters in a note, not counting the properties block.
pub fn counts(text: &str) -> (usize, usize) {
    let body = match diamond_parse::parse(text).frontmatter {
        Some(frontmatter) => &text[frontmatter.range.end.min(text.len())..],
        None => text,
    };
    (body.split_whitespace().count(), body.trim().chars().count())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOMENT: Moment = Moment {
        year: 2026,
        month: 3,
        day: 7,
        hour: 9,
        minute: 5,
    };

    fn settings(daily_folder: &str, daily_template: &str, templates: &str) -> VaultSettings {
        let mut settings = VaultSettings::default();
        daily_folder.clone_into(&mut settings.daily.folder);
        daily_template.clone_into(&mut settings.daily.template);
        templates.clone_into(&mut settings.templates.folder);
        settings
    }

    #[test]
    fn moment_formats_with_leading_zeros() {
        assert_eq!(MOMENT.date(), "2026-03-07");
        assert_eq!(MOMENT.time(), "09:05");
    }

    #[test]
    fn daily_notes_default_to_a_daily_folder_and_a_daily_template() {
        let defaults = VaultSettings::default();
        assert_eq!(
            daily_note_path(&defaults, MOMENT).unwrap().as_str(),
            "Daily/2026-03-07.md"
        );
        assert_eq!(
            daily_template_path(&defaults).unwrap().as_str(),
            "Templates/Daily.md"
        );
        assert_eq!(templates_prefix(&defaults), "Templates/");
    }

    #[test]
    fn daily_notes_follow_the_vault_settings() {
        let custom = settings("/Journal/Days/", "Day.md", " Meta/Templates ");
        assert_eq!(
            daily_note_path(&custom, MOMENT).unwrap().as_str(),
            "Journal/Days/2026-03-07.md"
        );
        assert_eq!(
            daily_template_path(&custom).unwrap().as_str(),
            "Meta/Templates/Day.md"
        );
        assert_eq!(templates_prefix(&custom), "Meta/Templates/");

        // A template written with a folder is a path from the vault root.
        let rooted = settings("", "Meta/Day", "Templates");
        assert_eq!(
            daily_note_path(&rooted, MOMENT).unwrap().as_str(),
            "2026-03-07.md"
        );
        assert_eq!(
            daily_template_path(&rooted).unwrap().as_str(),
            "Meta/Day.md"
        );
    }

    #[test]
    fn empty_and_escaping_settings_are_harmless() {
        let none = settings("Daily", "  ", "");
        assert_eq!(daily_template_path(&none), None);
        // No path starts with a slash, so nothing is offered as a template.
        assert_eq!(templates_prefix(&none), "/");

        let escaping = settings("../outside", "../../secret", "Templates");
        assert!(daily_note_path(&escaping, MOMENT).is_err());
        assert_eq!(daily_template_path(&escaping), None);
    }

    #[test]
    fn fill_template_replaces_known_placeholders_only() {
        assert_eq!(
            fill_template(
                "# {{title}}\n{{ date }} at {{time}}\n{{unknown}} {{date:YYYY}} {{",
                "My Note",
                MOMENT
            ),
            "# My Note\n2026-03-07 at 09:05\n{{unknown}} {{date:YYYY}} {{"
        );
        assert_eq!(
            fill_template("no placeholders", "T", MOMENT),
            "no placeholders"
        );
    }

    #[test]
    fn counts_skip_the_properties_block() {
        assert_eq!(
            counts("---\ntitle: Many words here\n---\nfour words in body\n"),
            (4, 18)
        );
        assert_eq!(counts(""), (0, 0));
        assert_eq!(counts("日本語 text"), (2, 8));
    }
}
