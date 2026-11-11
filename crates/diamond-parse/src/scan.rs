//! Scanners for syntax the Markdown parser does not know about: tags and
//! block identifiers. They run only over ranges the parser reported as prose,
//! so code, links, math and HTML are already excluded.

use std::ops::Range;

use crate::InlineTag;

/// Maps byte offsets to zero-based line numbers.
pub(crate) struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    pub(crate) fn new(source: &str) -> Self {
        let mut starts = vec![0];
        starts.extend(
            source
                .bytes()
                .enumerate()
                .filter(|(_, byte)| *byte == b'\n')
                .map(|(offset, _)| offset + 1),
        );
        Self { starts }
    }

    pub(crate) fn line_of(&self, offset: usize) -> usize {
        self.starts.partition_point(|start| *start <= offset) - 1
    }
}

/// Characters allowed in a tag: letters and digits in any script, `_`, `-`,
/// `/` for nesting, and other non-ASCII symbols such as emoji.
fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/') || (!c.is_ascii() && !c.is_whitespace())
}

/// Finds `#tags` in one prose run and appends them to `out`.
///
/// A tag starts at a `#` that begins the source or follows whitespace, and it
/// must contain at least one character that is not a digit, so `#1` and issue
/// numbers are not tags.
pub(crate) fn tags(source: &str, run: Range<usize>, out: &mut Vec<InlineTag>) {
    let text = &source[run.clone()];
    let mut search_from = 0;
    while let Some(found) = text[search_from..].find('#') {
        let hash = search_from + found;
        let absolute = run.start + hash;
        search_from = hash + 1;

        let preceded_by_space = source[..absolute]
            .chars()
            .next_back()
            .is_none_or(char::is_whitespace);
        if !preceded_by_space {
            continue;
        }

        let body = &text[hash + 1..];
        let length = body
            .char_indices()
            .find(|(_, c)| !is_tag_char(*c))
            .map_or(body.len(), |(index, _)| index);
        let name = body[..length].trim_end_matches('/');
        if name.is_empty() || name.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        out.push(InlineTag {
            name: name.to_owned(),
            range: absolute..absolute + 1 + name.len(),
        });
        search_from = hash + 1 + length;
    }
}

/// Finds a `^block-id` that ends a prose run sitting at the end of its line.
pub(crate) fn block_id(source: &str, run: Range<usize>) -> Option<(String, Range<usize>)> {
    let at_line_end = source[run.end..]
        .chars()
        .next()
        .is_none_or(|c| c == '\n' || c == '\r');
    if !at_line_end {
        return None;
    }

    let text = source[run.clone()].trim_end();
    let caret = text.rfind('^')?;
    let id = &text[caret + 1..];
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    let absolute = run.start + caret;
    let preceded_by_space = source[..absolute]
        .chars()
        .next_back()
        .is_none_or(char::is_whitespace);
    if !preceded_by_space {
        return None;
    }
    Some((id.to_owned(), absolute..absolute + 1 + id.len()))
}

/// Whether a link destination is a URL with a scheme (`https:`, `mailto:`)
/// and so points outside the vault.
pub fn is_external(destination: &str) -> bool {
    let scheme_end = destination
        .find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')))
        .unwrap_or(destination.len());
    // A scheme needs at least two letters so `C:` style paths are not URLs.
    scheme_end >= 2 && destination[scheme_end..].starts_with(':')
}

/// Encodes text for use in a Markdown link destination: everything except
/// letters, digits and `-._~/` becomes a `%XX` escape, so spaces and brackets
/// cannot end the link early.
pub fn percent_encode(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

/// Decodes `%20` style escapes, which Markdown links need for spaces.
/// Malformed escapes are left as written.
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok();
            if let Some(byte) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                decoded.push(byte);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(decoded).unwrap_or_else(|_| input.to_owned())
}
