//! Note properties: the YAML block at the top of a note.

use std::ops::Range;

use yaml_rust2::{Yaml, YamlLoader};

/// A property value, reduced to the shapes notes use in practice.
#[derive(Clone, Debug, PartialEq)]
pub enum PropertyValue {
    /// An empty value (`key:`).
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A whole or decimal number.
    Number(f64),
    /// Text, including dates, which YAML does not distinguish from text.
    Text(String),
    /// A list of values.
    List(Vec<PropertyValue>),
    /// A nested mapping, kept in source order.
    Map(Vec<(String, PropertyValue)>),
}

impl PropertyValue {
    /// The value as a list of strings: a single text value becomes a
    /// one-item list, and non-text items are skipped.
    fn strings(&self) -> Vec<String> {
        match self {
            PropertyValue::Text(text) => vec![text.clone()],
            PropertyValue::Number(number) => vec![format_number(*number)],
            PropertyValue::List(items) => items.iter().flat_map(Self::strings).collect(),
            _ => Vec::new(),
        }
    }
}

/// A value on one line, as it would be written in a list of properties:
/// `open`, `3`, `true`, `[a, b]`, `{k: v}`. An empty value is nothing.
impl std::fmt::Display for PropertyValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PropertyValue::Null => Ok(()),
            PropertyValue::Bool(value) => write!(f, "{value}"),
            PropertyValue::Number(number) => f.write_str(&format_number(*number)),
            PropertyValue::Text(text) => f.write_str(text),
            PropertyValue::List(items) => {
                f.write_str("[")?;
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        f.write_str(", ")?;
                    }
                    write!(f, "{item}")?;
                }
                f.write_str("]")
            }
            PropertyValue::Map(entries) => {
                f.write_str("{")?;
                for (index, (key, value)) in entries.iter().enumerate() {
                    if index > 0 {
                        f.write_str(", ")?;
                    }
                    write!(f, "{key}: {value}")?;
                }
                f.write_str("}")
            }
        }
    }
}

/// The parsed properties block.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Frontmatter {
    /// Byte range of the whole block in the note, including both `---` lines.
    pub range: Range<usize>,
    /// Every property in source order.
    pub properties: Vec<(String, PropertyValue)>,
    /// The `title` property, if set.
    pub title: Option<String>,
    /// Other names the note answers to, from `aliases` or `alias`.
    pub aliases: Vec<String>,
    /// Tags from `tags` or `tag`, without a leading `#`.
    pub tags: Vec<String>,
    /// Set when the block is not valid YAML. The other fields are then empty.
    pub error: Option<String>,
}

impl Frontmatter {
    /// Looks up a property by name, ignoring case.
    pub fn get(&self, key: &str) -> Option<&PropertyValue> {
        self.properties
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, value)| value)
    }
}

pub(crate) fn parse(yaml: &str, range: Range<usize>) -> Frontmatter {
    let mut frontmatter = Frontmatter {
        range,
        ..Frontmatter::default()
    };

    let documents = match YamlLoader::load_from_str(yaml) {
        Ok(documents) => documents,
        Err(error) => {
            frontmatter.error = Some(error.to_string());
            return frontmatter;
        }
    };
    let Some(Yaml::Hash(map)) = documents.into_iter().next() else {
        // An empty block, or YAML that is not a mapping, has no properties.
        return frontmatter;
    };

    for (key, value) in &map {
        if let Some(key) = key_text(key) {
            frontmatter.properties.push((key, convert(value)));
        }
    }

    frontmatter.title = match frontmatter.get("title") {
        Some(PropertyValue::Text(title)) if !title.trim().is_empty() => {
            Some(title.trim().to_owned())
        }
        _ => None,
    };
    frontmatter.aliases = ["aliases", "alias"]
        .iter()
        .filter_map(|key| frontmatter.get(key))
        .flat_map(PropertyValue::strings)
        .map(|alias| alias.trim().to_owned())
        .filter(|alias| !alias.is_empty())
        .collect();
    frontmatter.tags = ["tags", "tag"]
        .iter()
        .filter_map(|key| frontmatter.get(key))
        .flat_map(PropertyValue::strings)
        // `tags: a, b` and `tags: a b` are both written in the wild.
        .flat_map(|tags| {
            tags.split([',', ' '])
                .map(|tag| tag.trim().trim_start_matches('#').to_owned())
                .collect::<Vec<_>>()
        })
        .filter(|tag| !tag.is_empty())
        .collect();

    frontmatter
}

fn key_text(key: &Yaml) -> Option<String> {
    match key {
        Yaml::String(text) => Some(text.clone()),
        Yaml::Integer(number) => Some(number.to_string()),
        Yaml::Real(text) => Some(text.clone()),
        Yaml::Boolean(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn convert(value: &Yaml) -> PropertyValue {
    match value {
        Yaml::Null | Yaml::BadValue => PropertyValue::Null,
        Yaml::Boolean(flag) => PropertyValue::Bool(*flag),
        Yaml::Integer(number) => PropertyValue::Number(*number as f64),
        Yaml::Real(text) => text
            .parse()
            .map_or_else(|_| PropertyValue::Text(text.clone()), PropertyValue::Number),
        Yaml::String(text) => PropertyValue::Text(text.clone()),
        Yaml::Array(items) => PropertyValue::List(items.iter().map(convert).collect()),
        Yaml::Hash(map) => PropertyValue::Map(
            map.iter()
                .filter_map(|(key, value)| Some((key_text(key)?, convert(value))))
                .collect(),
        ),
        Yaml::Alias(_) => PropertyValue::Null,
    }
}

fn format_number(number: f64) -> String {
    if number.fract() == 0.0 && number.abs() < 1e15 {
        format!("{}", number as i64)
    } else {
        number.to_string()
    }
}
