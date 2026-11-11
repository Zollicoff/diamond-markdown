//! Daily notes, templates and text statistics.
//!
//! Settings are read from the same files Obsidian's core plugins write
//! (`.obsidian/daily-notes.json`, `.obsidian/templates.json`), so a vault set
//! up there behaves the same here.

// The window does not call into this module yet; its tests do.
#![allow(dead_code)]

use diamond_vault::{Vault, VaultPath};

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

/// Reads one string setting from a JSON file in the vault's `.obsidian`
/// folder. Missing files, invalid JSON and empty values are all "not set".
fn setting(vault: &Vault, file: &str, key: &str) -> Option<String> {
    let path = VaultPath::new(&format!(".obsidian/{file}")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&vault.read(&path).ok()?).ok()?;
    let value = json.get(key)?.as_str()?.trim().trim_matches('/');
    (!value.is_empty()).then(|| value.to_owned())
}

/// Where today's daily note lives and the template to start it from.
///
/// Obsidian's default is a note named `YYYY-MM-DD` at the vault root. The
/// `folder` and `template` settings are honoured. A custom date `format` is
/// not: such vaults get the default name.
pub fn daily_note(vault: &Vault, moment: Moment) -> (Option<VaultPath>, Option<VaultPath>) {
    let name = format!("{}.md", moment.date());
    let path = match setting(vault, "daily-notes.json", "folder") {
        Some(folder) => VaultPath::new(&format!("{folder}/{name}")),
        None => VaultPath::new(&name),
    };
    let template =
        setting(vault, "daily-notes.json", "template").and_then(|template| note_path(&template));
    (path.ok(), template)
}

/// The folder templates are kept in: the `folder` setting of Obsidian's
/// Templates plugin, or a folder named `Templates` when that is not set.
pub fn templates_folder(vault: &Vault) -> String {
    setting(vault, "templates.json", "folder").unwrap_or_else(|| "Templates".to_owned())
}

/// A setting that names a note, with or without `.md`, as a vault path.
fn note_path(written: &str) -> Option<VaultPath> {
    let with_extension = if written.to_lowercase().ends_with(".md") {
        written.to_owned()
    } else {
        format!("{written}.md")
    };
    VaultPath::new(&with_extension).ok()
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

    fn vault(files: &[(&str, &str)]) -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        for (path, contents) in files {
            let absolute = dir.path().join(path);
            std::fs::create_dir_all(absolute.parent().unwrap()).unwrap();
            std::fs::write(absolute, contents).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    #[test]
    fn moment_formats_with_leading_zeros() {
        assert_eq!(MOMENT.date(), "2026-03-07");
        assert_eq!(MOMENT.time(), "09:05");
    }

    #[test]
    fn daily_note_defaults_to_the_vault_root() {
        let (_dir, vault) = vault(&[]);
        let (path, template) = daily_note(&vault, MOMENT);
        assert_eq!(path.unwrap().as_str(), "2026-03-07.md");
        assert_eq!(template, None);
        assert_eq!(templates_folder(&vault), "Templates");
    }

    #[test]
    fn daily_note_honours_obsidian_settings() {
        let (_dir, vault) = vault(&[
            (
                ".obsidian/daily-notes.json",
                r#"{"folder": "/Journal/Daily/", "template": "Meta/Day", "format": "YYYY-MM-DD"}"#,
            ),
            (
                ".obsidian/templates.json",
                r#"{"folder": "Meta/Templates"}"#,
            ),
        ]);
        let (path, template) = daily_note(&vault, MOMENT);
        assert_eq!(path.unwrap().as_str(), "Journal/Daily/2026-03-07.md");
        assert_eq!(template.unwrap().as_str(), "Meta/Day.md");
        assert_eq!(templates_folder(&vault), "Meta/Templates");
    }

    #[test]
    fn broken_or_empty_settings_fall_back_to_defaults() {
        let (_dir, vault) = vault(&[
            (".obsidian/daily-notes.json", "{ not json"),
            (".obsidian/templates.json", r#"{"folder": "  "}"#),
        ]);
        assert_eq!(
            daily_note(&vault, MOMENT).0.unwrap().as_str(),
            "2026-03-07.md"
        );
        assert_eq!(templates_folder(&vault), "Templates");
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
