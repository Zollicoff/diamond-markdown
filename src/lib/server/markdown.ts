/**
 * Markdown → HTML, with:
 *   - wikilink resolution against the current vault index (rendered as
 *     <a class="wikilink" href="..."> or <span class="wikilink--broken">)
 *   - inline tag rendering (#foo → <a class="tag" href="...">)
 *   - DOMPurify sanitization (server-side via isomorphic-dompurify if needed)
 *
 * The server-rendered HTML is returned to the client already sanitized so
 * the client can `{@html ...}` it directly.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { replaceWikilinks } from './wikilink';
import type { VaultIndex } from './indexer';
import { resolveTarget } from './indexer';
import type { Vault } from './vault';

// DOMPurify needs a DOM on the server. JSDOM is the standard shim.
const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

marked.setOptions({ gfm: true, breaks: false });

export interface RenderResult {
	html: string;
	outgoingLinks: { target: string; resolved: string | null }[];
}

/**
 * Render `body` (markdown without frontmatter) to sanitized HTML.
 * Wikilinks are resolved against `idx`; tags are linked to the tag page.
 */
export function renderMarkdown(vault: Vault, idx: VaultIndex, body: string): RenderResult {
	const outgoing: { target: string; resolved: string | null }[] = [];

	// Replace wikilinks + inline tags, but skip code fences and inline code
	// so examples in the docs render as-written.
	const processed = processOutsideCode(body, (chunk) => {
		const withLinks = replaceWikilinks(chunk, (link) => {
			const resolved = resolveTarget(idx, link.target);
			outgoing.push({ target: link.target, resolved });
			const display = link.display ?? link.target;
			if (!resolved) {
				return `<a class="wikilink wikilink--broken" href="/vault/${vault.id}/create?title=${encodeURIComponent(link.target)}" data-target="${escAttr(link.target)}">${escHtml(display)}</a>`;
			}
			const hash = link.heading ? `#${slugifyHeading(link.heading)}` : '';
			const href = `/vault/${vault.id}/note/${encodeURI(resolved)}${hash}`;
			return `<a class="wikilink" href="${href}" data-target="${escAttr(resolved)}">${escHtml(display)}</a>`;
		});
		return replaceInlineTagsInChunk(withLinks, (tag) => {
			return `<a class="tag" href="/vault/${vault.id}/tag/${encodeURIComponent(tag)}">#${escHtml(tag)}</a>`;
		});
	});

	const withTags = processed;

	const raw = marked.parse(withTags) as string;
	const clean = purify.sanitize(raw, {
		ALLOWED_ATTR: ['href', 'class', 'data-target', 'title', 'src', 'alt', 'id', 'target', 'rel'],
		ADD_ATTR: ['target']
	});
	return { html: clean, outgoingLinks: outgoing };
}

/**
 * Run `transform` on every chunk of `src` that lies OUTSIDE a code fence
 * (``` ... ```) or inline code (`...`). Leaves code verbatim.
 */
function processOutsideCode(src: string, transform: (chunk: string) => string): string {
	const boundaryRe = /(```[\s\S]*?```|`[^`\n]+`)/g;
	const parts: string[] = [];
	let last = 0;
	for (const m of src.matchAll(boundaryRe)) {
		if (m.index! > last) parts.push(transform(src.slice(last, m.index!)));
		parts.push(m[0]);
		last = m.index! + m[0].length;
	}
	parts.push(transform(src.slice(last)));
	return parts.join('');
}

function replaceInlineTagsInChunk(chunk: string, render: (tag: string) => string): string {
	// Skip rendered anchor tags we already emitted for wikilinks.
	const parts: string[] = [];
	const boundaryRe = /(<a\b[^>]*>.*?<\/a>|\[[^\]]+\]\([^)]+\))/g;
	let last = 0;
	for (const m of chunk.matchAll(boundaryRe)) {
		if (m.index! > last) parts.push(tagSub(chunk.slice(last, m.index!), render));
		parts.push(m[0]);
		last = m.index! + m[0].length;
	}
	parts.push(tagSub(chunk.slice(last), render));
	return parts.join('');
}

function tagSub(chunk: string, render: (tag: string) => string): string {
	return chunk.replace(/(^|[^\w`])#([a-zA-Z][\w/-]*)/g, (_whole, pre: string, tag: string) => {
		return `${pre}${render(tag)}`;
	});
}

function slugifyHeading(h: string): string {
	return h.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function escHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[c]!);
}

function escAttr(s: string): string {
	return escHtml(s);
}
