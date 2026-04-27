/**
 * Markdown → HTML, with:
 *   - wikilink resolution against the current vault index
 *   - inline tag rendering (#foo → <a class="tag">)
 *   - note embeds (![[Note]] → inlined rendered content, cycle-safe)
 *   - image / file embeds (![[image.png]] → <img>)
 *   - inline + block math via KaTeX (server-rendered)
 *   - syntax-highlighted code via highlight.js (server-rendered)
 *   - footnotes via marked-footnote
 *   - mermaid placeholder divs (rendered client-side, lazy-loaded)
 *   - DOMPurify sanitization (server-side via JSDOM)
 *
 * The server-rendered HTML is returned to the client already sanitized so
 * the client can {@html ...} it directly.
 */

import fs from 'node:fs';
import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import katex from 'katex';
import hljs from 'highlight.js';
import { replaceWikilinks, replaceEmbeds, isImagePath } from './wikilink';
import type { VaultIndex } from './indexer';
import { resolveTarget } from './indexer';
import type { Vault } from './vault';
import { resolveInVault } from './paths';
import { splitFrontmatter } from './frontmatter';
import { slugifyHeading, escHtml, escAttr } from '$lib/util/strings';

// DOMPurify needs a DOM on the server. JSDOM is the standard shim.
const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

marked.setOptions({ gfm: true, breaks: false });
marked.use(markedFootnote());

// Custom renderer: highlight code blocks + flag mermaid blocks for client.
marked.use({
	renderer: {
		code({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
			const language = (lang ?? '').trim().toLowerCase();
			if (language === 'mermaid') {
				// Encode the source so the client can pull it back out and feed it to mermaid.
				const encoded = Buffer.from(text, 'utf-8').toString('base64');
				return `<div class="mermaid-block" data-mermaid-source="${encoded}"><pre class="mermaid-fallback">${escHtml(text)}</pre></div>\n`;
			}
			let highlighted = '';
			if (language && hljs.getLanguage(language)) {
				try {
					highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
				} catch {
					highlighted = escHtml(text);
				}
			} else {
				try {
					highlighted = hljs.highlightAuto(text).value;
				} catch {
					highlighted = escHtml(text);
				}
			}
			const cls = language ? `hljs language-${language}` : 'hljs';
			return `<pre><code class="${cls}">${highlighted}</code></pre>\n`;
		}
	}
});

const ALLOWED_ATTR = [
	'href', 'class', 'data-target', 'data-mermaid-source', 'title', 'src', 'alt',
	'id', 'target', 'rel', 'loading', 'width', 'height', 'role', 'aria-hidden',
	'style' // KaTeX emits a few inline styles; safe under DOMPurify's CSS sanitization
];

export interface RenderResult {
	html: string;
	outgoingLinks: { target: string; resolved: string | null }[];
}

/**
 * Render `body` (markdown without frontmatter) to sanitized HTML.
 */
export function renderMarkdown(vault: Vault, idx: VaultIndex, body: string): RenderResult {
	const outgoing: { target: string; resolved: string | null }[] = [];
	const html = renderInner(vault, idx, body, outgoing, new Set());
	return { html, outgoingLinks: outgoing };
}

/** Inner recursive renderer — `visited` is the chain of paths currently being
 *  embedded, so a cycle (A embeds B embeds A) is rendered as a stub. */
function renderInner(
	vault: Vault,
	idx: VaultIndex,
	body: string,
	outgoing: { target: string; resolved: string | null }[],
	visited: Set<string>
): string {
	// 1. Math first — replace $...$ and $$...$$ with rendered HTML so marked
	//    passes them through unchanged. Done outside code regions only.
	const mathReplaced = processOutsideCode(body, (chunk) => renderMathInChunk(chunk));

	// 2. Embeds + wikilinks + tags — also outside code regions.
	const processed = processOutsideCode(mathReplaced, (chunk) => {
		const withEmbeds = replaceEmbeds(chunk, (e) => {
			if (isImagePath(e.target)) {
				const src = `/api/vaults/${vault.id}/raw/${encodeURI(e.target)}`;
				const alt = e.alt ?? e.target.split('/').pop() ?? '';
				return `<img src="${src}" alt="${escAttr(alt)}" class="embed-image" loading="lazy">`;
			}
			// Note embed — try to resolve to a markdown note + inline its body.
			const resolved = resolveTarget(idx, e.target);
			if (resolved && resolved.endsWith('.md')) {
				if (visited.has(resolved)) {
					return `<div class="embed-note embed-cycle" data-target="${escAttr(resolved)}"><a class="wikilink" href="/vault/${vault.id}/note/${encodeURI(resolved)}">${escHtml(e.alt ?? resolved)}</a> <span class="hint">↺ already embedded above</span></div>`;
				}
				try {
					const abs = resolveInVault(vault, resolved);
					const raw = fs.readFileSync(abs, 'utf-8');
					const { body: childBody } = splitFrontmatter(raw);
					const nextVisited = new Set(visited);
					nextVisited.add(resolved);
					const childHtml = renderInner(vault, idx, childBody, outgoing, nextVisited);
					const title = e.alt ?? resolved.split('/').pop()!.replace(/\.md$/, '');
					return `<div class="embed-note" data-target="${escAttr(resolved)}"><div class="embed-note-head"><a class="wikilink" href="/vault/${vault.id}/note/${encodeURI(resolved)}">${escHtml(title)}</a></div><div class="embed-note-body">${childHtml}</div></div>`;
				} catch {
					// Fall through to broken-embed display.
				}
			}
			// Non-image, non-resolvable, or unreadable — render as a soft broken span.
			const display = e.alt ?? e.target;
			return `<span class="embed-broken" title="not found in vault">${escHtml(display)}</span>`;
		});
		const withLinks = replaceWikilinks(withEmbeds, (link) => {
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

	// 3. Marked → HTML (with our custom code renderer + footnotes ext + GFM).
	const raw = marked.parse(processed, { async: false }) as string;

	// 4. Add id attributes to headings so `[[Note#Heading]]` deep-links work.
	const withHeadingIds = addHeadingIds(raw);

	// 5. Sanitize.
	return purify.sanitize(withHeadingIds, {
		ALLOWED_ATTR,
		ADD_ATTR: ['target']
	});
}

/** Replace `$$...$$` (block) and `$...$` (inline) with KaTeX-rendered HTML.
 *
 * Inline rule: opening $ must not be preceded by word-char or backslash, and
 * closing $ must not be followed by a digit. Keeps prices like `$5 and $10`
 * out of math mode (the second `$` would be followed by `1`).
 */
function renderMathInChunk(chunk: string): string {
	let out = chunk.replace(/\$\$([\s\S]+?)\$\$/g, (_w, src: string) => {
		try {
			return '\n\n' + katex.renderToString(src.trim(), { displayMode: true, throwOnError: false, output: 'html' }) + '\n\n';
		} catch {
			return `<span class="math-error">$$${escHtml(src)}$$</span>`;
		}
	});
	out = out.replace(/(?<![\\\w])\$([^$\n]+?)\$(?!\d)/g, (_w, src: string) => {
		try {
			return katex.renderToString(src, { displayMode: false, throwOnError: false, output: 'html' });
		} catch {
			return `<span class="math-error">$${escHtml(src)}$</span>`;
		}
	});
	return out;
}

/** Turn <h1..6>Title</h1> into <h1 id="title">Title</h1> for anchor jumps. */
function addHeadingIds(html: string): string {
	return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_w, level: string, inner: string) => {
		// Strip tags from the inner text before slugifying so links / formatting don't pollute the id.
		const text = inner.replace(/<[^>]+>/g, '').trim();
		const id = slugifyHeading(text);
		return `<h${level} id="${escAttr(id)}">${inner}</h${level}>`;
	});
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
	const parts: string[] = [];
	const boundaryRe = /(<a\b[^>]*>.*?<\/a>|<span\b[^>]*>.*?<\/span>|\[[^\]]+\]\([^)]+\))/g;
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

