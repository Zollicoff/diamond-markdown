/**
 * Pure string utilities — safe to import from server *or* client.
 *
 * Lives outside `lib/server/` because none of these need fs/git/etc.
 * Consolidates definitions that had drifted into 2-3 separate copies
 * across the codebase (wikilink regex, slugify, html-escape).
 */

/**
 * Wikilink regex — captures `[[Target#Heading|Display]]` with all parts
 * optional except `Target`. Used by the markdown renderer, the rename
 * link-rewriter, and the CodeMirror live-preview decorator.
 */
export const WIKILINK_RE = /\[\[([^\[\]|\n]+?)(?:#([^\[\]|\n]+?))?(?:\|([^\[\]\n]+?))?\]\]/g;

interface SlugifyOptions {
	/** Truncate the result to this many characters. Default: no cap. */
	maxLength?: number;
	/** Returned when the input slugifies to an empty string. Default: 'note'. */
	fallback?: string;
}

/**
 * URL/path-safe slug — lowercase, non-alphanumerics collapsed to dashes.
 * Used for vault ids (with maxLength: 48, fallback: 'vault') and for
 * publishing notes as static files (no cap, fallback: 'note').
 */
export function slugify(s: string, opts: SlugifyOptions = {}): string {
	const { maxLength, fallback = 'note' } = opts;
	let out = s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (maxLength != null) out = out.slice(0, maxLength);
	return out || fallback;
}

/**
 * Heading-anchor slug used by the markdown renderer + the outline panel.
 * Differs from `slugify` in that it preserves underscores and hyphens
 * already present in the heading (so `[[Note#my_section]]` round-trips
 * cleanly).
 */
export function slugifyHeading(h: string): string {
	return h.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escape characters that are special in HTML text content. */
export function escHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escape for attribute values. Same set as text content for our usage. */
export function escAttr(s: string): string {
	return escHtml(s);
}
