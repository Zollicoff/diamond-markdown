//! Daily notes, templates and text statistics.
//!
//! Where daily notes go and where templates are kept comes from the vault's
//! own settings; see [`crate::settings`].

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

    /// The same time of day `days` days later, or earlier when negative.
    /// A date that cannot be represented leaves the moment as it is.
    pub fn shifted(&self, days: i64) -> Self {
        use chrono::Datelike as _;
        chrono::NaiveDate::from_ymd_opt(self.year, self.month, self.day)
            .and_then(|date| date.checked_add_signed(chrono::Duration::days(days)))
            .map_or(*self, |date| Self {
                year: date.year(),
                month: date.month(),
                day: date.day(),
                ..*self
            })
    }

    /// `Wednesday`
    pub fn weekday(&self) -> &'static str {
        use chrono::Datelike as _;
        const NAMES: [&str; 7] = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ];
        chrono::NaiveDate::from_ymd_opt(self.year, self.month, self.day).map_or("", |date| {
            NAMES[date.weekday().num_days_from_monday() as usize]
        })
    }
}

/// What a placeholder stands for, or `None` if it is not one of ours.
///
/// Besides the plain names, `date` takes a number of days to add or take
/// away: `date+7`, `date - 1`.
fn placeholder(name: &str, title: &str, moment: Moment) -> Option<String> {
    Some(match name {
        "title" => title.to_owned(),
        "date" => moment.date(),
        "time" => moment.time(),
        "yesterday" => moment.shifted(-1).date(),
        "tomorrow" => moment.shifted(1).date(),
        "weekday" => moment.weekday().to_owned(),
        "year" => format!("{:04}", moment.year),
        "month" => format!("{:02}", moment.month),
        "day" => format!("{:02}", moment.day),
        _ => {
            let rest = name.strip_prefix("date")?.trim_start();
            let (sign, days) = match rest.chars().next()? {
                '+' => (1, &rest[1..]),
                '-' => (-1, &rest[1..]),
                _ => return None,
            };
            let days: i64 = days.trim().parse().ok()?;
            moment.shifted(sign * days).date()
        }
    })
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

/// Fills in a template's placeholders, written in double braces with
/// optional spaces inside: `{{title}}`, `{{date}}`, `{{time}}`,
/// `{{weekday}}`, `{{year}}`, `{{month}}`, `{{day}}`, `{{yesterday}}`,
/// `{{tomorrow}}`, and `{{date+7}}` or `{{date-1}}` for a date some days
/// away. Anything else in double braces is left as written.
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
        match placeholder(after[..close].trim(), title, moment) {
            Some(value) => output.push_str(&value),
            None => output.push_str(&rest[open..open + 2 + close + 2]),
        }
        rest = &after[close + 2..];
    }
    output.push_str(rest);
    output
}

/// Ticks or unticks the task on a zero-based line: `- [ ]` becomes `- [x]`
/// and back. Returns the whole new text, or `None` if the line is not a
/// task.
pub fn toggle_task(text: &str, line: usize) -> Option<String> {
    let mut start = 0;
    for (number, content) in text.split_inclusive('\n').enumerate() {
        if number != line {
            start += content.len();
            continue;
        }
        let indent = content.len() - content.trim_start().len();
        let after_indent = &content[indent..];
        // A bullet (`-`, `*`, `+`) or a number (`1.`, `1)`), then a space.
        let bullet = match after_indent.chars().next()? {
            '-' | '*' | '+' => 1,
            digit if digit.is_ascii_digit() => {
                let digits = after_indent
                    .chars()
                    .take_while(char::is_ascii_digit)
                    .count();
                match after_indent[digits..].chars().next()? {
                    '.' | ')' => digits + 1,
                    _ => return None,
                }
            }
            _ => return None,
        };
        let rest = &after_indent[bullet..];
        let spaces = rest.len() - rest.trim_start_matches(' ').len();
        let marker = start + indent + bullet + spaces;
        let flipped = match text.get(marker..marker + 3)? {
            "[ ]" => "[x]",
            "[x]" | "[X]" => "[ ]",
            _ => return None,
        };
        if spaces == 0 {
            return None;
        }
        return Some(format!(
            "{}{flipped}{}",
            &text[..marker],
            &text[marker + 3..]
        ));
    }
    None
}

/// Words and characters in a note, not counting the properties block.
/// `meta` is what the parser reported for `text`.
///
/// A word is a run of non-space characters with a letter or digit in it, so
/// Markdown markers standing alone (`#`, `-`, `>`) are not counted.
pub fn counts(text: &str, meta: &diamond_parse::NoteMeta) -> (usize, usize) {
    let body = match &meta.frontmatter {
        Some(frontmatter) => &text[frontmatter.range.end.min(text.len())..],
        None => text,
    };
    let words = body
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .count();
    (words, body.trim().chars().count())
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
    fn templates_can_work_with_dates() {
        // 7 March 2026 is a Saturday.
        let filled = |template: &str| fill_template(template, "T", MOMENT);
        assert_eq!(
            filled("{{weekday}} {{year}}/{{month}}/{{day}}"),
            "Saturday 2026/03/07"
        );
        assert_eq!(
            filled("{{yesterday}} to {{tomorrow}}"),
            "2026-03-06 to 2026-03-08"
        );
        assert_eq!(
            filled("{{date+7}} {{ date - 7 }} {{date+0}}"),
            "2026-03-14 2026-02-28 2026-03-07"
        );
        // Across a year, and a leap day.
        assert_eq!(filled("{{date+300}}"), "2027-01-01");
        assert_eq!(MOMENT.shifted(-371).date(), "2025-03-01");
        // Not ours: left exactly as written.
        assert_eq!(
            filled("{{date+}} {{date*2}} {{dates}} {{date+x}}"),
            "{{date+}} {{date*2}} {{dates}} {{date+x}}"
        );
    }

    #[test]
    fn toggle_task_flips_only_the_box_on_the_named_line() {
        let text =
            "# List\n- [ ] one\n  * [x] two [ ] not this\n3. [X] three\n- plain\n-[ ] no space\n";
        assert_eq!(
            toggle_task(text, 1).unwrap(),
            text.replacen("- [ ] one", "- [x] one", 1)
        );
        assert_eq!(
            toggle_task(text, 2).unwrap(),
            text.replacen("* [x] two", "* [ ] two", 1)
        );
        assert_eq!(
            toggle_task(text, 3).unwrap(),
            text.replacen("3. [X] three", "3. [ ] three", 1)
        );
        // Not tasks: a heading, a plain item, a box without its space, and
        // a line past the end.
        for line in [0, 4, 5, 99] {
            assert_eq!(toggle_task(text, line), None, "line {line}");
        }
        assert_eq!(
            toggle_task("- [ ] last line without newline", 0).unwrap(),
            "- [x] last line without newline"
        );
    }

    #[test]
    fn counts_skip_the_properties_block() {
        let counted = |text: &str| counts(text, &diamond_parse::parse(text));
        assert_eq!(
            counted("---\ntitle: Many words here\n---\nfour words in body\n"),
            (4, 18)
        );
        assert_eq!(counted(""), (0, 0));
        assert_eq!(counted("日本語 text"), (2, 8));
        assert_eq!(counted("# Title\n\n- one\n- [ ] two #tag\n> ---\n").0, 4);
    }
}
