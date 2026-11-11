//! Diamond's settings.
//!
//! There are two files, both TOML so they can be read and fixed by hand:
//!
//! - a vault's settings, `.diamond/settings.toml` inside the vault, which
//!   travel with the vault;
//! - the app's settings, `settings.toml` in the platform's settings folder,
//!   which belong to this computer.
//!
//! A key that is missing takes its default, so a file only needs the lines
//! that differ. Keys this version does not know are ignored when reading and
//! kept when the app writes the file. A file that cannot be parsed is
//! reported and left alone: every setting takes its default until it is fixed.

use std::fs;
use std::io::Write as _;
use std::path::Path;

use diamond_vault::{APP_FOLDER, Vault, VaultPath};
use serde::{Deserialize, Serialize};

/// The settings file's name, both in a vault's `.diamond` folder and in the
/// app's settings folder.
const FILE_NAME: &str = "settings.toml";

/// Settings as read from a file.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Loaded<T> {
    /// The settings, all defaults when the file is missing or unusable.
    pub settings: T,
    /// What was wrong with the file, if it exists but could not be used.
    pub problem: Option<String>,
}

fn parse<T: Default + serde::de::DeserializeOwned>(text: &str, origin: &str) -> Loaded<T> {
    match toml::from_str(text) {
        Ok(settings) => Loaded {
            settings,
            problem: None,
        },
        Err(error) => Loaded {
            settings: T::default(),
            problem: Some(format!("{origin}: {}", error.message())),
        },
    }
}

/// One vault's settings.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct VaultSettings {
    /// Daily notes.
    pub daily: Daily,
    /// Templates.
    pub templates: Templates,
    /// The calendar.
    pub calendar: CalendarSettings,
}

/// How the calendar is laid out.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct CalendarSettings {
    /// The day a week starts on.
    pub week_starts: WeekStart,
}

/// The first day of the week.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WeekStart {
    /// Monday first.
    #[default]
    Monday,
    /// Sunday first.
    Sunday,
}

/// Where daily notes go and what they start from.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Daily {
    /// The folder daily notes are created in. Empty means the vault root.
    pub folder: String,
    /// The template a new daily note starts from: a name in the templates
    /// folder, or a path from the vault root when it contains a `/`. Empty
    /// means none. A template that does not exist is the same as none.
    pub template: String,
}

impl Default for Daily {
    fn default() -> Self {
        Self {
            folder: "Daily".to_owned(),
            template: "Daily".to_owned(),
        }
    }
}

/// Where templates are kept.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Templates {
    /// The folder whose notes are offered as templates.
    pub folder: String,
}

impl Default for Templates {
    fn default() -> Self {
        Self {
            folder: "Templates".to_owned(),
        }
    }
}

impl VaultSettings {
    /// Where a vault's settings are, as a path in the vault.
    pub fn path() -> VaultPath {
        VaultPath::new(&format!("{APP_FOLDER}/{FILE_NAME}")).expect("a fixed, valid path")
    }

    /// Reads a vault's settings.
    pub fn load(vault: &Vault) -> Loaded<Self> {
        let path = Self::path();
        if !vault.exists(&path) {
            return Loaded::default();
        }
        match vault.read(&path) {
            Ok(text) => parse(&text, path.as_str()),
            Err(error) => Loaded {
                settings: Self::default(),
                problem: Some(error.to_string()),
            },
        }
    }
}

/// Whether the app is drawn light or dark.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    /// Follow the system's setting.
    #[default]
    System,
    /// Always light.
    Light,
    /// Always dark.
    Dark,
}

/// The app's settings on this computer.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct AppSettings {
    /// Light, dark or whatever the system uses.
    pub appearance: Appearance,
}

impl AppSettings {
    /// Reads the app's settings from the settings folder `dir`.
    pub fn load(dir: &Path) -> Loaded<Self> {
        let file = dir.join(FILE_NAME);
        match fs::read_to_string(&file) {
            Ok(text) => parse(&text, &file.display().to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Loaded::default(),
            Err(error) => Loaded {
                settings: Self::default(),
                problem: Some(format!("{}: {error}", file.display())),
            },
        }
    }

    /// Writes the app's settings to the settings folder `dir`.
    ///
    /// Keys already in the file that this version does not know are kept. A
    /// file that cannot be parsed is not replaced: the error says so, and the
    /// hand-written file stays as it is for its owner to fix.
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        let invalid =
            |message: String| std::io::Error::new(std::io::ErrorKind::InvalidData, message);
        let file = dir.join(FILE_NAME);
        let mut table = match fs::read_to_string(&file) {
            Ok(text) => text.parse::<toml::Table>().map_err(|error| {
                invalid(format!(
                    "{} was not changed because it cannot be read: {}",
                    file.display(),
                    error.message()
                ))
            })?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => toml::Table::new(),
            Err(error) => return Err(error),
        };
        let ours = toml::Table::try_from(self).map_err(|error| invalid(error.to_string()))?;
        table.extend(ours);
        let text = toml::to_string(&table).map_err(|error| invalid(error.to_string()))?;

        fs::create_dir_all(dir)?;
        // Written beside the file and renamed over it, so a crash mid-write
        // leaves the old settings.
        let temporary = dir.join(format!(".{FILE_NAME}.tmp"));
        let mut handle = fs::File::create(&temporary)?;
        handle.write_all(text.as_bytes())?;
        handle.sync_all()?;
        fs::rename(temporary, file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        for (path, contents) in files {
            let absolute = dir.path().join(path);
            fs::create_dir_all(absolute.parent().unwrap()).unwrap();
            fs::write(absolute, contents).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    #[test]
    fn a_vault_without_a_settings_file_gets_the_defaults() {
        let (_dir, vault) = vault(&[]);
        let loaded = VaultSettings::load(&vault);
        assert_eq!(loaded.problem, None);
        assert_eq!(loaded.settings.daily.folder, "Daily");
        assert_eq!(loaded.settings.daily.template, "Daily");
        assert_eq!(loaded.settings.templates.folder, "Templates");
        assert_eq!(loaded.settings.calendar.week_starts, WeekStart::Monday);
    }

    #[test]
    fn the_week_can_start_on_sunday() {
        let (_dir, vault) = vault(&[(
            ".diamond/settings.toml",
            "[calendar]\nweek_starts = \"sunday\"\n",
        )]);
        let loaded = VaultSettings::load(&vault);
        assert_eq!(loaded.problem, None);
        assert_eq!(loaded.settings.calendar.week_starts, WeekStart::Sunday);
    }

    #[test]
    fn a_vault_settings_file_only_needs_the_lines_that_differ() {
        let (_dir, vault) = vault(&[(
            ".diamond/settings.toml",
            "[daily]\nfolder = \"Journal/Days\"\n\n[from_a_newer_version]\nkey = 1\n",
        )]);
        let loaded = VaultSettings::load(&vault);
        assert_eq!(loaded.problem, None);
        assert_eq!(loaded.settings.daily.folder, "Journal/Days");
        assert_eq!(loaded.settings.daily.template, "Daily");
        assert_eq!(loaded.settings.templates.folder, "Templates");
    }

    #[test]
    fn a_broken_vault_settings_file_is_reported_and_ignored() {
        let (dir, vault) = vault(&[(".diamond/settings.toml", "[daily\nfolder = 3\n")]);
        let loaded = VaultSettings::load(&vault);
        assert_eq!(loaded.settings, VaultSettings::default());
        let problem = loaded.problem.expect("a problem is reported");
        assert!(problem.starts_with(".diamond/settings.toml: "), "{problem}");
        // A value of the wrong type is a problem too, not a silent default.
        fs::write(
            dir.path().join(".diamond/settings.toml"),
            "[daily]\nfolder = 3\n",
        )
        .unwrap();
        assert!(VaultSettings::load(&vault).problem.is_some());
    }

    #[test]
    fn app_settings_round_trip_and_keep_unknown_keys() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("nested/config");
        assert_eq!(AppSettings::load(&config), Loaded::default());

        let dark = AppSettings {
            appearance: Appearance::Dark,
        };
        dark.save(&config).unwrap();
        assert_eq!(AppSettings::load(&config).settings, dark);
        assert_eq!(
            fs::read_to_string(config.join(FILE_NAME)).unwrap(),
            "appearance = \"dark\"\n"
        );

        fs::write(
            config.join(FILE_NAME),
            "appearance = \"dark\"\nlater = \"kept\"\n",
        )
        .unwrap();
        AppSettings::default().save(&config).unwrap();
        let text = fs::read_to_string(config.join(FILE_NAME)).unwrap();
        assert!(text.contains("appearance = \"system\""), "{text}");
        assert!(text.contains("later = \"kept\""), "{text}");
        let names: Vec<_> = fs::read_dir(&config)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from(FILE_NAME)]);
    }

    #[test]
    fn a_broken_app_settings_file_is_reported_and_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(FILE_NAME), "appearance = purple").unwrap();
        let loaded = AppSettings::load(dir.path());
        assert_eq!(loaded.settings, AppSettings::default());
        assert!(loaded.problem.is_some());

        assert!(AppSettings::default().save(dir.path()).is_err());
        assert_eq!(
            fs::read_to_string(dir.path().join(FILE_NAME)).unwrap(),
            "appearance = purple"
        );
    }
}
