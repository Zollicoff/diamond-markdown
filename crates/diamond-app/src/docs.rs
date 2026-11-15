//! Tests that keep the documentation true.
//!
//! Documentation goes stale quietly: the code changes and nothing fails.
//! These tests fail when the README or the guide disagrees with the code
//! about something that can be checked.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::settings::{AppSettings, VaultSettings};

/// Every document a reader is pointed at.
const DOCUMENTS: [&str; 6] = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "ACKNOWLEDGMENTS.md",
    "docs/guide.md",
    "docs/architecture.md",
];

fn repository() -> PathBuf {
    PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
}

fn read(relative: &str) -> String {
    fs::read_to_string(repository().join(relative))
        .unwrap_or_else(|error| panic!("{relative}: {error}"))
}

/// The text between `<!-- name -->` and `<!-- /name -->`.
fn marked<'a>(text: &'a str, name: &str) -> &'a str {
    let open = format!("<!-- {name} -->");
    let close = format!("<!-- /{name} -->");
    let start = text
        .find(&open)
        .unwrap_or_else(|| panic!("no {open} marker"))
        + open.len();
    let end = text[start..]
        .find(&close)
        .unwrap_or_else(|| panic!("no {close} marker"));
    &text[start..start + end]
}

/// The contents of the first fenced block after `<!-- name -->`.
fn block_after<'a>(text: &'a str, name: &str) -> &'a str {
    let open = format!("<!-- {name} -->");
    let after = &text[text
        .find(&open)
        .unwrap_or_else(|| panic!("no {open} marker"))..];
    let fence = after.find("```").expect("a fenced block after the marker");
    let body = &after[fence..];
    let body = &body[body.find('\n').expect("a line after the fence") + 1..];
    &body[..body.find("```").expect("the end of the fenced block")]
}

/// A shortcut as the guide writes it: `cmd-shift-p` is `Cmd-Shift-P`.
fn written(keys: &str) -> String {
    keys.split('-')
        .map(|part| {
            let mut letters = part.chars();
            letters
                .next()
                .map(|first| first.to_uppercase().chain(letters).collect::<String>())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join("-")
}

#[test]
fn the_guide_lists_every_command_with_its_shortcut() {
    let guide = read("docs/guide.md");
    // The table has a column for each platform's keys.
    let column = if cfg!(target_os = "macos") { 2 } else { 3 };
    let listed: Vec<(String, String)> = marked(&guide, "commands")
        .lines()
        .filter(|line| line.starts_with('|'))
        // The header and the rule under it.
        .skip(2)
        .map(|line| {
            let cells: Vec<&str> = line.split('|').map(str::trim).collect();
            (
                cells[1].to_owned(),
                cells[column].trim_matches('`').to_owned(),
            )
        })
        .collect();
    let in_the_app: Vec<(String, String)> = crate::plugins::core()
        .iter()
        .flat_map(|plugin| plugin.commands())
        .map(|command| {
            (
                command.title.to_owned(),
                command.shortcut.map(written).unwrap_or_default(),
            )
        })
        .collect();
    assert_eq!(
        listed, in_the_app,
        "the command table in docs/guide.md must list what the app has, in the same order"
    );
}

#[test]
fn the_settings_shown_in_the_guide_are_the_defaults() {
    let guide = read("docs/guide.md");
    // Compared as tables, so a setting left out of the guide fails too.
    let shown = |name: &str| -> toml::Table {
        block_after(&guide, name)
            .parse()
            .unwrap_or_else(|error| panic!("the {name} block is not TOML: {error}"))
    };
    assert_eq!(
        shown("vault-settings"),
        toml::Table::try_from(VaultSettings::default()).unwrap()
    );
    assert_eq!(
        shown("app-settings"),
        toml::Table::try_from(AppSettings::default()).unwrap()
    );
    // The sample vault's settings file says it shows the defaults.
    let sample: toml::Table = read("sample-vault/.diamond/settings.toml").parse().unwrap();
    assert_eq!(
        sample,
        toml::Table::try_from(VaultSettings::default()).unwrap()
    );
}

#[test]
fn the_readme_lists_the_linux_packages_ci_installs() {
    // The packages named by the first `apt-get ... install` command.
    let packages = |text: &str| -> BTreeSet<String> {
        let mut found = BTreeSet::new();
        let mut inside = false;
        for line in text.lines() {
            if !inside && !(line.contains("apt-get") && line.contains(" install")) {
                continue;
            }
            inside = line.trim_end().ends_with('\\');
            found.extend(
                line.split_whitespace()
                    .filter(|word| {
                        !word.starts_with(['-', '$'])
                            && !["sudo", "apt-get", "install", "\\"].contains(word)
                    })
                    .map(str::to_owned),
            );
            if !inside {
                break;
            }
        }
        found
    };
    let ci = packages(&read(".github/workflows/ci.yml"));
    assert!(ci.len() > 5, "{ci:?}");
    assert_eq!(packages(&read("README.md")), ci);
}

/// A heading as a link names it: `What Diamond keeps on disk` is
/// `what-diamond-keeps-on-disk`.
fn anchor(heading: &str) -> String {
    heading
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || [' ', '-', '_'].contains(c))
        .map(|c| if c == ' ' { '-' } else { c })
        .collect()
}

/// A document without its code, where things that look like links are
/// examples.
fn prose(text: &str) -> String {
    let mut prose = String::new();
    // The length of the fence that opened the block we are in, if any. A
    // block ends at a fence at least as long, so that a block can show a
    // shorter fence inside it.
    let mut fence: Option<usize> = None;
    for line in text.lines() {
        let ticks = line.trim_start().chars().take_while(|c| *c == '`').count();
        match fence {
            None if ticks >= 3 => fence = Some(ticks),
            Some(open) if ticks >= open => fence = None,
            Some(_) => {}
            None => {
                // Every second piece between backticks is code.
                for piece in line.split('`').step_by(2) {
                    prose.push_str(piece);
                }
                prose.push('\n');
            }
        }
    }
    prose
}

#[test]
fn links_between_the_documents_lead_somewhere() {
    let anchors = |text: &str| -> BTreeSet<String> {
        prose(text)
            .lines()
            .filter(|line| line.starts_with('#'))
            .map(|line| anchor(line.trim_start_matches('#')))
            .collect()
    };
    for document in DOCUMENTS {
        let text = read(document);
        let folder = repository().join(document);
        let folder = folder.parent().unwrap();
        let prose = prose(&text);
        let mut rest = prose.as_str();
        while let Some(open) = rest.find("](") {
            rest = &rest[open + 2..];
            let target = &rest[..rest.find(')').unwrap_or(rest.len())];
            // Links to the web are not checked: tests do not use the network.
            if target.contains("://") || target.starts_with("mailto:") {
                continue;
            }
            let (file, heading) = match target.split_once('#') {
                Some((file, heading)) => (file, Some(heading)),
                None => (target, None),
            };
            let linked = if file.is_empty() {
                text.clone()
            } else {
                let path = folder.join(file);
                assert!(
                    path.exists(),
                    "{document} links to {target}, which is missing"
                );
                fs::read_to_string(&path).unwrap_or_default()
            };
            if let Some(heading) = heading {
                assert!(
                    anchors(&linked).contains(heading),
                    "{document} links to {target}, but there is no such heading"
                );
            }
        }
    }
}

#[test]
fn every_library_depended_on_is_acknowledged() {
    // Names are compared without case, spaces or hyphens, so that
    // `gpui-kit` is found in "GPUI Kit".
    let plain = |text: &str| -> String {
        text.to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect()
    };
    let acknowledged = plain(&read("ACKNOWLEDGMENTS.md"));
    for manifest in ["app", "index", "parse", "vault"] {
        let manifest = format!("crates/diamond-{manifest}/Cargo.toml");
        let parsed: toml::Table = read(&manifest).parse().unwrap();
        for section in ["dependencies", "dev-dependencies"] {
            let Some(toml::Value::Table(dependencies)) = parsed.get(section) else {
                continue;
            };
            for name in dependencies
                .keys()
                .filter(|name| !name.starts_with("diamond-"))
            {
                assert!(
                    acknowledged.contains(&plain(name)),
                    "{manifest} depends on {name}, which ACKNOWLEDGMENTS.md does not name"
                );
            }
        }
    }
}

#[test]
fn shortcuts_are_written_the_way_the_guide_writes_them() {
    assert_eq!(written("cmd-shift-p"), "Cmd-Shift-P");
    assert_eq!(written("ctrl-shift-tab"), "Ctrl-Shift-Tab");
    assert_eq!(written("cmd-alt-left"), "Cmd-Alt-Left");
    assert_eq!(written("f6"), "F6");
    assert_eq!(written("cmd-\\"), "Cmd-\\");
    assert_eq!(
        anchor(" Calendar, graph and bookmarks"),
        "calendar-graph-and-bookmarks"
    );
    assert_eq!(anchor("A vault's settings"), "a-vaults-settings");
    // Code is not prose, including a fenced block that shows a fence.
    assert_eq!(
        prose("a `[x](y)` b\n````\n```\n[in](code)\n```\n````\nafter [l](m)\n"),
        "a  b\nafter [l](m)\n"
    );
}
