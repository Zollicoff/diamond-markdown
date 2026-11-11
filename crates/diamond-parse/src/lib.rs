//! Note metadata extraction.
//!
//! [`parse`] reads one note's Markdown source and reports what the rest of
//! the app needs to know about it without rendering it: properties
//! (frontmatter), headings, links and embeds, tags, block identifiers and
//! tasks. Positions are byte ranges into the source.
//!
//! The syntax follows what Obsidian documents for its Markdown flavour, so a
//! vault written in Obsidian reads the same here.

mod frontmatter;
mod scan;

use std::ops::Range;

use pulldown_cmark::{Event, LinkType, MetadataBlockKind, Options, Parser, Tag, TagEnd};

pub use frontmatter::{Frontmatter, PropertyValue};
pub use scan::{is_external, percent_decode, percent_encode};

/// Everything extracted from one note.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct NoteMeta {
    /// The YAML properties block at the top of the note, if there is one.
    pub frontmatter: Option<Frontmatter>,
    /// Headings in document order.
    pub headings: Vec<Heading>,
    /// Internal links and embeds in document order. External URLs are not
    /// included.
    pub links: Vec<Link>,
    /// Inline `#tags` in document order. Tags from properties are in
    /// [`Frontmatter::tags`]; [`NoteMeta::all_tags`] combines both.
    pub tags: Vec<InlineTag>,
    /// Block identifiers (`^id`) that other notes can link to.
    pub blocks: Vec<BlockId>,
    /// Task list items.
    pub tasks: Vec<Task>,
}

impl NoteMeta {
    /// Every tag on the note, from properties and from the body, without the
    /// leading `#`, in first-seen order and without duplicates. Comparison is
    /// case-insensitive; the first spelling wins.
    pub fn all_tags(&self) -> Vec<&str> {
        let mut seen: Vec<String> = Vec::new();
        let mut tags = Vec::new();
        let from_properties = self
            .frontmatter
            .iter()
            .flat_map(|frontmatter| frontmatter.tags.iter().map(String::as_str));
        for tag in from_properties.chain(self.tags.iter().map(|tag| tag.name.as_str())) {
            let key = tag.to_lowercase();
            if !seen.contains(&key) {
                seen.push(key);
                tags.push(tag);
            }
        }
        tags
    }
}

/// A heading such as `## Plan`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Heading {
    /// 1 for `#` through 6 for `######`.
    pub level: u8,
    /// The heading's text without Markdown markers.
    pub text: String,
    /// Zero-based line the heading starts on.
    pub line: usize,
    /// Byte range of the whole heading in the source.
    pub range: Range<usize>,
}

/// How a link was written.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkSyntax {
    /// `[[Note]]`
    Wiki,
    /// `[text](Note.md)`
    Markdown,
}

/// The part of a link after `#`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Subpath {
    /// `[[Note#Heading]]`
    Heading(String),
    /// `[[Note#^block-id]]`
    Block(String),
}

/// An internal link or embed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Link {
    /// The note or file the link names, as written: `Note`, `Folder/Note`
    /// or `image.png`. Empty for a link within the same note (`[[#Heading]]`).
    pub target: String,
    /// The heading or block inside the target, if the link names one.
    pub subpath: Option<Subpath>,
    /// Display text, when the link sets one (`[[Note|shown]]`).
    pub display: Option<String>,
    /// `true` for `![[Note]]` and `![alt](file)`, which show the target inline.
    pub embed: bool,
    /// How the link was written.
    pub syntax: LinkSyntax,
    /// Byte range of the whole link in the source.
    pub range: Range<usize>,
}

/// A `#tag` in the note body.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InlineTag {
    /// The tag without the leading `#`, such as `project/active`.
    pub name: String,
    /// Byte range in the source, including the `#`.
    pub range: Range<usize>,
}

/// A `^block-id` marker at the end of a block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BlockId {
    /// The identifier without the `^`.
    pub id: String,
    /// Zero-based line the marker is on.
    pub line: usize,
    /// Byte range of the marker in the source, including the `^`.
    pub range: Range<usize>,
}

/// A task list item such as `- [ ] Call Sam`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    /// Whether the box is ticked.
    pub checked: bool,
    /// Zero-based line the task is on.
    pub line: usize,
    /// Byte range of the `[ ]` marker in the source.
    pub range: Range<usize>,
}

/// Extracts metadata from a note's Markdown source.
pub fn parse(source: &str) -> NoteMeta {
    let lines = scan::LineIndex::new(source);
    let mut meta = NoteMeta::default();

    let mut options = Options::empty();
    options.insert(Options::ENABLE_WIKILINKS);
    options.insert(Options::ENABLE_YAML_STYLE_METADATA_BLOCKS);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_MATH);

    // Byte ranges of plain prose: the only places tags and block ids occur.
    let mut prose: Vec<Range<usize>> = Vec::new();

    let mut heading: Option<(u8, String, Range<usize>)> = None;
    let mut link: Option<PendingLink> = None;
    let mut in_code_block = false;
    let mut in_metadata = false;
    let mut metadata_text = String::new();
    let mut metadata_range = 0..0;

    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        match event {
            Event::Start(Tag::MetadataBlock(MetadataBlockKind::YamlStyle)) => {
                in_metadata = true;
                metadata_range = range;
            }
            Event::End(TagEnd::MetadataBlock(_)) if in_metadata => {
                in_metadata = false;
                // Only a block that opens the note is the note's properties.
                if meta.frontmatter.is_none() && source[..metadata_range.start].trim().is_empty() {
                    meta.frontmatter =
                        Some(frontmatter::parse(&metadata_text, metadata_range.clone()));
                }
                metadata_text.clear();
            }
            Event::Text(text) if in_metadata => metadata_text.push_str(&text),

            Event::Start(Tag::CodeBlock(_)) => in_code_block = true,
            Event::End(TagEnd::CodeBlock) => in_code_block = false,

            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some((level as u8, String::new(), range));
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((level, text, range)) = heading.take() {
                    meta.headings.push(Heading {
                        level,
                        text: text.trim().to_owned(),
                        line: lines.line_of(range.start),
                        range,
                    });
                }
            }

            Event::Start(Tag::Link {
                link_type,
                dest_url,
                ..
            }) => {
                link = PendingLink::start(link_type, &dest_url, false, range);
            }
            Event::Start(Tag::Image {
                link_type,
                dest_url,
                ..
            }) => {
                link = PendingLink::start(link_type, &dest_url, true, range);
            }
            Event::End(TagEnd::Link | TagEnd::Image) => {
                if let Some(pending) = link.take() {
                    meta.links.push(pending.finish());
                }
            }

            Event::TaskListMarker(checked) => meta.tasks.push(Task {
                checked,
                line: lines.line_of(range.start),
                range,
            }),

            Event::Text(text) => {
                if let Some((_, heading_text, _)) = heading.as_mut() {
                    heading_text.push_str(&text);
                }
                match link.as_mut() {
                    Some(pending) => pending.label.push_str(&text),
                    None if !in_code_block => push_prose(&mut prose, range),
                    None => {}
                }
            }
            Event::Code(text) => {
                if let Some((_, heading_text, _)) = heading.as_mut() {
                    heading_text.push_str(&text);
                }
                if let Some(pending) = link.as_mut() {
                    pending.label.push_str(&text);
                }
            }
            _ => {}
        }
    }

    for run in prose {
        scan::tags(source, run.clone(), &mut meta.tags);
        if let Some((id, range)) = scan::block_id(source, run) {
            meta.blocks.push(BlockId {
                id,
                line: lines.line_of(range.start),
                range,
            });
        }
    }

    meta
}

/// Adds a text range, joining it to the previous one when they touch. The
/// Markdown parser splits prose at characters that might start markup, and a
/// tag such as `#snake_case` must be read as one run.
fn push_prose(prose: &mut Vec<Range<usize>>, range: Range<usize>) {
    match prose.last_mut() {
        Some(last) if last.end == range.start => last.end = range.end,
        _ => prose.push(range),
    }
}

struct PendingLink {
    target: String,
    subpath: Option<Subpath>,
    embed: bool,
    syntax: LinkSyntax,
    has_display: bool,
    label: String,
    range: Range<usize>,
}

impl PendingLink {
    /// Returns `None` for links that leave the vault (URLs, `mailto:`), which
    /// are not part of the note graph.
    fn start(
        link_type: LinkType,
        destination: &str,
        embed: bool,
        range: Range<usize>,
    ) -> Option<Self> {
        let (syntax, has_display, destination) = match link_type {
            LinkType::WikiLink { has_pothole } => {
                // Inside a table the pipe is written `\|`, which leaves the
                // backslash on the end of the target.
                let destination = match destination.strip_suffix('\\') {
                    Some(stripped) if has_pothole => stripped,
                    _ => destination,
                };
                (LinkSyntax::Wiki, has_pothole, destination.to_owned())
            }
            LinkType::Autolink | LinkType::Email => return None,
            _ => {
                if scan::is_external(destination) {
                    return None;
                }
                (
                    LinkSyntax::Markdown,
                    true,
                    scan::percent_decode(destination),
                )
            }
        };

        let (target, subpath) = match destination.split_once('#') {
            Some((target, rest)) => {
                let subpath = match rest.strip_prefix('^') {
                    Some(block) => Subpath::Block(block.trim().to_owned()),
                    None => Subpath::Heading(rest.trim().to_owned()),
                };
                (target, Some(subpath))
            }
            None => (destination.as_str(), None),
        };

        Some(Self {
            target: target.trim().to_owned(),
            subpath,
            embed,
            syntax,
            has_display,
            label: String::new(),
            range,
        })
    }

    fn finish(self) -> Link {
        let label = self.label.trim();
        Link {
            target: self.target,
            subpath: self.subpath,
            display: (self.has_display && !label.is_empty()).then(|| label.to_owned()),
            embed: self.embed,
            syntax: self.syntax,
            range: self.range,
        }
    }
}

#[cfg(test)]
mod tests;
