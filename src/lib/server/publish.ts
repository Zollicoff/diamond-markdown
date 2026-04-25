/**
 * Static site export. Walks the vault, filters by `public: true` in
 * frontmatter, renders each public note to an HTML file under a
 * deploy-ready output directory.
 *
 *   vault/
 *     .diamond-publish/
 *       index.html
 *       styles.css
 *       <slug>.html  (one per public note)
 *       images/<copied>
 *
 * Wikilinks from a public note to another public note become
 * <a href="<slug>.html">. Wikilinks to private / missing notes become
 * inert .wikilink--broken spans. Backlinks show public-to-public only.
 * Image embeds are copied into images/ with rewritten src.
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { replaceWikilinks, replaceEmbeds, isImagePath, parseInlineTags } from './wikilink';
import { splitFrontmatter } from './frontmatter';
import type { Vault } from './vault';
import { resolveInVault } from './paths';
import { getIndex, resolveTarget } from './indexer';

const dompWindow = new JSDOM('').window;
const purify = DOMPurify(dompWindow as unknown as Window);

marked.setOptions({ gfm: true, breaks: false });

export interface PublishReport {
	outDir: string;
	totalNotes: number;
	publicNotes: number;
	imagesCopied: number;
	skipped: { path: string; reason: string }[];
}

export async function publishVault(vault: Vault): Promise<PublishReport> {
	const idx = getIndex(vault);

	// Collect public notes + cache their bodies.
	const notes = new Map<string, { title: string; body: string; tags: string[] }>();
	for (const meta of idx.notes.values()) {
		const abs = resolveInVault(vault, meta.notePath);
		let raw: string;
		try {
			raw = fs.readFileSync(abs, 'utf-8');
		} catch {
			continue;
		}
		const { frontmatter, body } = splitFrontmatter(raw);
		if (frontmatter.public !== true) continue;
		notes.set(meta.notePath, {
			title: typeof frontmatter.title === 'string' ? frontmatter.title : meta.title,
			body,
			tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((x): x is string => typeof x === 'string') : parseInlineTags(body)
		});
	}

	// Slug map: notePath → filename-safe slug (no collisions).
	const slugs = new Map<string, string>();
	const seen = new Set<string>();
	for (const notePath of notes.keys()) {
		const base = slugify(notePath.replace(/\.md$/, ''));
		let slug = base;
		let n = 2;
		while (seen.has(slug)) {
			slug = `${base}-${n++}`;
		}
		seen.add(slug);
		slugs.set(notePath, slug);
	}

	// Backlinks, public-to-public only.
	const publicBacklinks = new Map<string, { path: string; title: string }[]>();
	for (const [src] of notes) {
		const outs = idx.linksOut.get(src) ?? new Set();
		for (const tgt of outs) {
			if (!notes.has(tgt)) continue;
			const list = publicBacklinks.get(tgt) ?? [];
			list.push({ path: src, title: notes.get(src)!.title });
			publicBacklinks.set(tgt, list);
		}
	}

	// Prepare output directory — clear + recreate.
	const outDir = resolveInVault(vault, '.diamond-publish');
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.mkdirSync(path.join(outDir, 'images'), { recursive: true });

	// Make sure git ignores the output. Rebuildable artifact, not vault content.
	ensureGitignoreEntry(vault, '.diamond-publish/');

	// Styles.
	fs.writeFileSync(path.join(outDir, 'styles.css'), STYLES);

	// Render each public note, collecting images as we go.
	const imagesCopied = new Set<string>();
	const skipped: PublishReport['skipped'] = [];

	for (const [notePath, data] of notes) {
		const slug = slugs.get(notePath)!;
		try {
			const rendered = renderBodyForPublish(
				vault,
				data.body,
				notePath,
				slugs,
				idx,
				imagesCopied,
				outDir
			);
			const html = wrapPage({
				title: data.title,
				bodyHtml: rendered,
				tags: data.tags,
				backlinks: publicBacklinks.get(notePath) ?? [],
				slugs
			});
			fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
		} catch (err) {
			skipped.push({ path: notePath, reason: (err as Error).message });
		}
	}

	// Index.
	fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(notes, slugs, vault.name));

	return {
		outDir,
		totalNotes: idx.notes.size,
		publicNotes: notes.size,
		imagesCopied: imagesCopied.size,
		skipped
	};
}

function renderBodyForPublish(
	vault: Vault,
	body: string,
	sourcePath: string,
	slugs: Map<string, string>,
	idx: ReturnType<typeof getIndex>,
	imagesCopied: Set<string>,
	outDir: string
): string {
	const processed = processOutsideCode(body, (chunk) => {
		const withEmbeds = replaceEmbeds(chunk, (e) => {
			if (!isImagePath(e.target)) {
				const display = e.alt ?? e.target;
				return escHtml(display);
			}
			// Copy the image into outDir/images and rewrite src to a relative path.
			let copied: string | null = null;
			try {
				const abs = resolveInVault(vault, e.target);
				if (fs.existsSync(abs)) {
					const imgSlug = path.basename(e.target);
					const dest = path.join(outDir, 'images', imgSlug);
					// Collision: prefix with a short hash of the path.
					let finalSlug = imgSlug;
					if (fs.existsSync(dest) && !imagesCopied.has(e.target)) {
						const hash = hashString(e.target).slice(0, 6);
						finalSlug = `${hash}-${imgSlug}`;
					}
					fs.copyFileSync(abs, path.join(outDir, 'images', finalSlug));
					copied = finalSlug;
					imagesCopied.add(e.target);
				}
			} catch { /* ignore */ }
			const alt = e.alt ?? path.basename(e.target);
			if (!copied) {
				return `<span class="broken-embed">[missing: ${escHtml(e.target)}]</span>`;
			}
			return `<img src="images/${encodeURI(copied)}" alt="${escAttr(alt)}" loading="lazy">`;
		});
		const withLinks = replaceWikilinks(withEmbeds, (link) => {
			const resolved = resolveTarget(idx, link.target);
			const display = link.display ?? link.target;
			if (resolved && slugs.has(resolved)) {
				return `<a class="wikilink" href="${slugs.get(resolved)}.html">${escHtml(display)}</a>`;
			}
			return `<span class="wikilink wikilink--broken" title="not published">${escHtml(display)}</span>`;
		});
		// Tags: render as inert styled pills (no tag page in v1 static export).
		return replaceInlineTagsInChunk(withLinks, (tag) => {
			return `<span class="tag">#${escHtml(tag)}</span>`;
		});
	});

	const raw = marked.parse(processed) as string;
	return purify.sanitize(raw, {
		ALLOWED_ATTR: ['href', 'class', 'data-target', 'title', 'src', 'alt', 'id', 'target', 'rel', 'loading', 'width', 'height']
	});
}

function wrapPage(opts: {
	title: string;
	bodyHtml: string;
	tags: string[];
	backlinks: { path: string; title: string }[];
	slugs: Map<string, string>;
}): string {
	const tagRow = opts.tags.length
		? `<div class="tag-row">${opts.tags.map((t) => `<span class="tag">#${escHtml(t)}</span>`).join('')}</div>`
		: '';
	const backlinksSection = opts.backlinks.length
		? `<footer class="backlinks"><h2>Backlinks</h2><ul>${opts.backlinks
				.map((b) => `<li><a href="${opts.slugs.get(b.path)}.html">${escHtml(b.title)}</a></li>`)
				.join('')}</ul></footer>`
		: '';

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(opts.title)}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<nav class="top"><a href="index.html">← Index</a></nav>
<main class="note">
<h1>${escHtml(opts.title)}</h1>
${tagRow}
${opts.bodyHtml}
${backlinksSection}
</main>
</body>
</html>`;
}

function indexPage(
	notes: Map<string, { title: string; body: string; tags: string[] }>,
	slugs: Map<string, string>,
	vaultName: string
): string {
	const entries = [...notes.entries()]
		.sort(([, a], [, b]) => a.title.localeCompare(b.title))
		.map(([p, n]) => `<li><a href="${slugs.get(p)}.html">${escHtml(n.title)}</a></li>`)
		.join('');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(vaultName)}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main class="index">
<h1>${escHtml(vaultName)}</h1>
<p class="count">${notes.size} published ${notes.size === 1 ? 'note' : 'notes'}</p>
<ul class="note-list">${entries}</ul>
<footer class="small">Generated by <a href="https://github.com/Zollicoff/diamondmarkdown">DiamondMD</a></footer>
</main>
</body>
</html>`;
}

/* ---------- helpers ---------- */

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
	return chunk.replace(/(^|[^\w`])#([a-zA-Z][\w/-]*)/g, (_w, pre: string, tag: string) => {
		return `${pre}${render(tag)}`;
	});
}

function ensureGitignoreEntry(vault: Vault, entry: string): void {
	try {
		const gi = resolveInVault(vault, '.gitignore');
		let contents = '';
		if (fs.existsSync(gi)) contents = fs.readFileSync(gi, 'utf-8');
		const lines = contents.split(/\r?\n/).map((l) => l.trim());
		if (lines.includes(entry.trim())) return;
		const next = (contents.length > 0 && !contents.endsWith('\n') ? contents + '\n' : contents) + entry + '\n';
		fs.writeFileSync(gi, next);
	} catch { /* ignore */ }
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'note';
}

function hashString(s: string): string {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}

function escHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function escAttr(s: string): string {
	return escHtml(s);
}

const STYLES = `/* DiamondMD static export — minimal readable defaults */
:root {
	--fg: #1a1a1a;
	--fg-dim: #5f5f5f;
	--bg: #fafafa;
	--bg-soft: #f1f1f1;
	--accent: #5b3df5;
	--border: #e1e1e1;
	--broken: #b00020;
}
@media (prefers-color-scheme: dark) {
	:root {
		--fg: #eaeaea;
		--fg-dim: #9a9a9a;
		--bg: #131416;
		--bg-soft: #1c1d20;
		--accent: #9f8bff;
		--border: #2a2c31;
		--broken: #ff7a88;
	}
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
	background: var(--bg);
	color: var(--fg);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	font-size: 17px;
	line-height: 1.6;
}

.top {
	padding: 14px 24px;
	border-bottom: 1px solid var(--border);
}
.top a { color: var(--fg-dim); text-decoration: none; font-size: 0.9em; }
.top a:hover { color: var(--accent); }

.note, .index {
	max-width: 760px;
	margin: 0 auto;
	padding: 40px 24px 80px;
}
.note h1, .index h1 {
	font-size: 2.1em;
	margin: 0 0 0.6em;
	line-height: 1.15;
	letter-spacing: -0.01em;
}
.note h2 { font-size: 1.5em; margin: 1.8em 0 0.4em; }
.note h3 { font-size: 1.2em; margin: 1.5em 0 0.3em; }
.note p { margin: 0 0 1em; }
.note ul, .note ol { margin: 0 0 1em; padding-left: 1.4em; }
.note li { margin: 0.25em 0; }
.note blockquote {
	margin: 1em 0; padding: 0.4em 1em;
	border-left: 3px solid var(--border); color: var(--fg-dim); font-style: italic;
}
.note code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: var(--bg-soft); padding: 1px 6px; border-radius: 4px; }
.note pre { background: var(--bg-soft); padding: 14px 16px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
.note pre code { background: transparent; padding: 0; }
.note img { max-width: 100%; border-radius: 6px; margin: 0.6em 0; }
.note a { color: var(--accent); }
.note a.wikilink { font-weight: 500; }
.note .wikilink--broken { color: var(--broken); font-style: italic; border-bottom: 1px dotted var(--broken); }
.note .broken-embed { color: var(--broken); font-style: italic; font-size: 0.9em; }

.tag-row { margin: 0 0 1.6em; display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
	font-size: 0.8em;
	padding: 2px 9px;
	border-radius: 99px;
	background: var(--bg-soft);
	color: var(--fg-dim);
}

.backlinks { margin-top: 4em; border-top: 1px solid var(--border); padding-top: 2em; }
.backlinks h2 { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-dim); font-weight: 600; margin: 0 0 0.6em; }
.backlinks ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
.backlinks a { color: var(--fg); text-decoration: none; }
.backlinks a:hover { color: var(--accent); }

.index .count { color: var(--fg-dim); margin-top: -0.4em; }
.index .note-list { list-style: none; padding: 0; margin: 2em 0 0; display: flex; flex-direction: column; gap: 6px; }
.index .note-list a { color: var(--fg); text-decoration: none; padding: 6px 10px; border-radius: 6px; display: block; }
.index .note-list a:hover { background: var(--bg-soft); color: var(--accent); }

.small { margin-top: 4em; color: var(--fg-dim); font-size: 0.8em; }
.small a { color: var(--fg-dim); }
`;
