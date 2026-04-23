/**
 * Wikilink parsing + rendering.
 *
 * Syntax — matches Obsidian:
 *   [[Note Title]]
 *   [[path/to/note]]
 *   [[Note Title|display text]]
 *   [[Note Title#Heading]]
 *   [[Note Title#Heading|display text]]
 *
 * Resolution lives in indexer.ts — this file is just the syntax parser.
 */

export interface ParsedWikilink {
	/** Exact substring from the source, including `[[` and `]]`. */
	raw: string;
	/** Target identifier — either a title, alias, or vault-relative path. */
	target: string;
	/** Heading anchor after `#`, or null. */
	heading: string | null;
	/** Display text (after `|`), or null to fall back to target. */
	display: string | null;
}

const WIKILINK_RE = /\[\[([^\[\]|\n]+?)(?:#([^\[\]|\n]+?))?(?:\|([^\[\]\n]+?))?\]\]/g;

/**
 * Find every wikilink in the given markdown body.
 * Does not follow code fences — wikilinks inside a triple-backtick block
 * are parsed like any other text. Good enough for v0.1.
 */
export function parseWikilinks(body: string): ParsedWikilink[] {
	const out: ParsedWikilink[] = [];
	for (const match of body.matchAll(WIKILINK_RE)) {
		out.push({
			raw: match[0],
			target: match[1].trim(),
			heading: match[2]?.trim() ?? null,
			display: match[3]?.trim() ?? null
		});
	}
	return out;
}

/**
 * Replace every wikilink in `body` via the given callback. If the callback
 * returns `null`, the wikilink is rendered as broken.
 */
export function replaceWikilinks(
	body: string,
	render: (link: ParsedWikilink) => string
): string {
	return body.replace(WIKILINK_RE, (raw, target, heading, display) => {
		return render({
			raw,
			target: (target as string).trim(),
			heading: (heading as string | undefined)?.trim() ?? null,
			display: (display as string | undefined)?.trim() ?? null
		});
	});
}

/**
 * Pull every `#tag` out of body text. Supports nested tags like `#project/foo`.
 * Also handles frontmatter tags — see `parseFrontmatter`.
 */
const TAG_RE = /(?:^|[^\w`])#([a-zA-Z][\w/-]*)/g;

export function parseInlineTags(body: string): string[] {
	const tags = new Set<string>();
	for (const match of body.matchAll(TAG_RE)) {
		tags.add(match[1]);
	}
	return [...tags];
}

/**
 * Embed syntax: `![[path/to/image.png]]` or `![[image.png|alt text]]`.
 * No heading anchors for embeds.
 */
export interface ParsedEmbed {
	raw: string;
	target: string;
	alt: string | null;
}

const EMBED_RE = /!\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

export function replaceEmbeds(body: string, render: (e: ParsedEmbed) => string): string {
	return body.replace(EMBED_RE, (raw, target, alt) => {
		return render({
			raw,
			target: (target as string).trim(),
			alt: (alt as string | undefined)?.trim() ?? null
		});
	});
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

export function isImagePath(p: string): boolean {
	return IMAGE_EXT_RE.test(p);
}
