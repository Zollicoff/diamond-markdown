import { parseWikilinkSubpath, wikilinkFragment } from '$lib/markdown/wikilinks';
import type { NoteLinkTarget } from '$lib/types';
import {
	canvasFileAssetKind,
	canvasRawAssetHref,
	isCanvasVaultRelativeAssetPath,
	normalizeCanvasFileSubpath,
	splitCanvasAssetReference
} from '$lib/canvas/files';
import type { CanvasFileAssetKind } from '$lib/canvas/files';
import { stripObsidianCommentsOutsideCode } from '$lib/markdown/obsidian-comments';

export type CanvasTextEmbedKind = CanvasFileAssetKind | 'note' | 'canvas';

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight' | 'code' | 'wikilink' | 'link';
export type CanvasTextPreviewCalloutFold = 'open' | 'closed' | null;

export interface CanvasTextInlineTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	subpath: string | null;
	hash: string | null;
}

export interface CanvasTextPreviewInline {
	kind: CanvasTextPreviewInlineKind;
	text: string;
	href?: string;
	target?: CanvasTextInlineTarget;
}

export type CanvasTextWikilinkResolver = (target: string, label: string | undefined) => CanvasTextInlineTarget | null;
export type CanvasTextEmbedResolver = (
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
) => CanvasTextPreviewEmbed | null;

export interface CanvasTextPreviewOptions {
	resolveWikilinkTarget?: CanvasTextWikilinkResolver;
	resolveEmbedTarget?: CanvasTextEmbedResolver;
	sourcePath?: string | null;
}

export interface CanvasTextPreviewListItem {
	inline: CanvasTextPreviewInline[];
	checked?: boolean;
}

export interface CanvasTextPreviewTableCell {
	inline: CanvasTextPreviewInline[];
}

export interface CanvasTextPreviewTable {
	headers: CanvasTextPreviewTableCell[];
	rows: CanvasTextPreviewTableCell[][];
}

export interface CanvasTextPreviewEmbed {
	path: string;
	suffix: string;
	kind: CanvasTextEmbedKind;
	title: string;
	alt: string | null;
	width: number | null;
	height: number | null;
}

export interface CanvasTextEmbedOpenTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	subpath: string | null;
	hash: string | null;
}

export type CanvasTextPreviewBlock =
	| { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inline: CanvasTextPreviewInline[] }
	| { type: 'paragraph'; inline: CanvasTextPreviewInline[] }
	| { type: 'quote'; inline: CanvasTextPreviewInline[] }
	| {
		type: 'callout';
		kind: string;
		title: CanvasTextPreviewInline[];
		fold: CanvasTextPreviewCalloutFold;
		body: CanvasTextPreviewBlock[];
	}
	| { type: 'unordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'ordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'table'; table: CanvasTextPreviewTable }
	| { type: 'embed'; embed: CanvasTextPreviewEmbed }
	| { type: 'thematic-break' }
	| { type: 'code'; language: string; code: string };

export function canvasTextPreviewInlines(value: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewInline[] {
	const inlines: CanvasTextPreviewInline[] = [];
	let remaining = value;
	while (remaining.length > 0) {
		const match = firstInlineMatch(remaining, options);
		if (!match) {
			inlines.push({ kind: 'text', text: remaining });
			break;
		}
		if (match.index > 0) {
			inlines.push({ kind: 'text', text: remaining.slice(0, match.index) });
		}
		inlines.push(match.inline);
		remaining = remaining.slice(match.index + match.raw.length);
	}
	return inlines.filter((inline) => inline.text.length > 0);
}

export function canvasTextPreviewBlocks(text: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewBlock[] {
	const lines = stripObsidianCommentsOutsideCode(text).replace(/\r\n?/g, '\n').split('\n');
	const blocks: CanvasTextPreviewBlock[] = [];
	let paragraphLines: string[] = [];
	let currentList: Extract<CanvasTextPreviewBlock, { type: 'ordered-list' | 'unordered-list' }> | null = null;
	let codeLanguage: string | null = null;
	let codeLines: string[] = [];

	function flushParagraph(): void {
		const paragraph = paragraphLines.join(' ').trim();
		if (paragraph) blocks.push({ type: 'paragraph', inline: canvasTextPreviewInlines(paragraph, options) });
		paragraphLines = [];
	}

	function flushList(): void {
		if (currentList && currentList.items.length > 0) blocks.push(currentList);
		currentList = null;
	}

	function flushCode(): void {
		blocks.push({ type: 'code', language: codeLanguage ?? '', code: codeLines.join('\n') });
		codeLanguage = null;
		codeLines = [];
	}

	for (let index = 0; index < lines.length;) {
		const line = lines[index];
		if (codeLanguage !== null) {
			if (/^\s*```/.test(line)) {
				flushCode();
			} else {
				codeLines.push(line);
			}
			index += 1;
			continue;
		}

		const fence = line.match(/^\s*```([a-z0-9_-]*)\s*$/i);
		if (fence) {
			flushParagraph();
			flushList();
			codeLanguage = fence[1] ?? '';
			codeLines = [];
			index += 1;
			continue;
		}

		if (!line.trim()) {
			flushParagraph();
			flushList();
			index += 1;
			continue;
		}

		const embed = canvasTextEmbedPreview(line, options);
		if (embed) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'embed', embed });
			index += 1;
			continue;
		}
		if (isCanvasStandaloneEmbedSyntax(line)) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'paragraph', inline: [{ kind: 'text', text: line.trim() }] });
			index += 1;
			continue;
		}

		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
		if (heading) {
			flushParagraph();
			flushList();
			blocks.push({
				type: 'heading',
				level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
				inline: canvasTextPreviewInlines(heading[2].trim(), options)
			});
			index += 1;
			continue;
		}

		if (isCanvasThematicBreak(line)) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'thematic-break' });
			index += 1;
			continue;
		}

		const table = canvasTablePreviewAt(lines, index, options);
		if (table) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'table', table: table.table });
			index = table.nextIndex;
			continue;
		}

		const callout = line.match(/^\s{0,3}>\s?\[!([a-z][a-z0-9_-]*)](?:([+-])?)\s*(.*)$/i);
		if (callout) {
			flushParagraph();
			flushList();
			const bodyLines: string[] = [];
			index += 1;
			while (index < lines.length) {
				const body = lines[index].match(/^\s{0,3}>\s?(.*)$/);
				if (!body) break;
				bodyLines.push(body[1]);
				index += 1;
			}
			const kind = canvasCalloutKind(callout[1]);
			blocks.push({
				type: 'callout',
				kind,
				title: canvasTextPreviewInlines(canvasCalloutTitle(kind, callout[3]), options),
				fold: callout[2] === '-' ? 'closed' : callout[2] === '+' ? 'open' : null,
				body: canvasTextPreviewBlocks(bodyLines.join('\n'), options)
			});
			continue;
		}

		const quote = line.match(/^\s{0,3}>\s?(.*)$/);
		if (quote) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'quote', inline: canvasTextPreviewInlines(quote[1].trim(), options) });
			index += 1;
			continue;
		}

		const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+)$/);
		const unordered = task ? null : line.match(/^\s*[-*]\s+(.+)$/);
		const ordered = task || unordered ? null : line.match(/^\s*\d+[.)]\s+(.+)$/);
		if (task || unordered || ordered) {
			const type = ordered ? 'ordered-list' : 'unordered-list';
			flushParagraph();
			if (!currentList || currentList.type !== type) {
				flushList();
				currentList = { type, items: [] };
			}
			currentList!.items.push({
				inline: canvasTextPreviewInlines((task?.[2] ?? unordered?.[1] ?? ordered?.[1] ?? '').trim(), options),
				checked: task ? task[1].toLowerCase() === 'x' : undefined
			});
			index += 1;
			continue;
		}

		flushList();
		paragraphLines.push(line.trim());
		index += 1;
	}

	if (codeLanguage !== null) flushCode();
	flushParagraph();
	flushList();
	return blocks;
}

export function canvasTextEmbedHref(
	vaultId: string,
	embed: Pick<CanvasTextPreviewEmbed, 'path' | 'suffix'> & Partial<Pick<CanvasTextPreviewEmbed, 'kind'>>
): string | null {
	if (embed.kind === 'note' || embed.kind === 'canvas') return null;
	return canvasRawAssetHref(vaultId, `${embed.path}${embed.suffix}`);
}

export function canvasTextEmbedOpenTarget(embed: CanvasTextPreviewEmbed): CanvasTextEmbedOpenTarget | null {
	if (embed.kind !== 'note' && embed.kind !== 'canvas') return null;
	return canvasTextInternalTarget(embed.kind, embed.path, embed.suffix, embed.title);
}

export function canvasTextEmbedRouteHref(vaultId: string, embed: CanvasTextPreviewEmbed): string | null {
	const target = canvasTextEmbedOpenTarget(embed);
	return target ? canvasTextInternalTargetHref(vaultId, target) : null;
}

export function canvasTextInlineTargetHref(vaultId: string, inline: CanvasTextPreviewInline): string | null {
	return inline.target ? canvasTextInternalTargetHref(vaultId, inline.target) : null;
}

export function canvasTextNoteWikilinkResolver(targets: NoteLinkTarget[]): CanvasTextWikilinkResolver {
	const lookup = canvasNoteLinkTargetLookup(targets);
	return (target, label) => {
		const { note, ref } = canvasNoteLinkTargetFor(lookup, target);
		if (!note) return null;
		return canvasTextInternalTarget('note', note.path, ref.suffix, label?.trim() || note.title);
	};
}

export function canvasTextNoteEmbedResolver(targets: NoteLinkTarget[]): CanvasTextEmbedResolver {
	const lookup = canvasNoteLinkTargetLookup(targets);
	return (target, meta) => {
		const { note, ref } = canvasNoteLinkTargetFor(lookup, target);
		if (!note) return null;
		if (ref.suffix && !normalizeCanvasFileSubpath(ref.suffix)) return null;
		return {
			path: note.path,
			suffix: ref.suffix,
			kind: 'note',
			title: meta.alt ?? note.title,
			...meta
		};
	};
}

function canvasNoteLinkTargetLookup(targets: NoteLinkTarget[]): Map<string, NoteLinkTarget> {
	const lookup = new Map<string, NoteLinkTarget>();
	for (const target of targets) {
		for (const key of canvasNoteLinkTargetKeys(target)) {
			lookup.set(key, target);
		}
	}
	return lookup;
}

function canvasNoteLinkTargetFor(
	lookup: Map<string, NoteLinkTarget>,
	target: string
): { note: NoteLinkTarget | null; ref: { path: string; suffix: string } } {
	const ref = splitCanvasWikilinkTarget(target);
	if (target.includes('?') || !ref.path) return { note: null, ref };
	const key = ref.path.trim().toLowerCase();
	return { note: lookup.get(key) ?? lookup.get(`${key}.md`) ?? null, ref };
}

function canvasNoteLinkTargetKeys(target: NoteLinkTarget): string[] {
	const path = target.path.trim().toLowerCase();
	const keys = [
		path,
		path.replace(/\.md$/i, ''),
		target.stem.trim().toLowerCase(),
		target.title.trim().toLowerCase(),
		...target.aliases.map((alias) => alias.trim().toLowerCase())
	].filter(Boolean);
	return [...new Set(keys)];
}

function canvasTextInternalTargetHref(vaultId: string, target: CanvasTextInlineTarget): string {
	const encodedPath = target.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	const base = `/vault/${encodeURIComponent(vaultId)}/${target.kind === 'canvas' ? 'canvas' : 'note'}/${encodedPath}`;
	return target.hash ? `${base}#${encodeURIComponent(target.hash)}` : base;
}

function canvasTextInternalTarget(
	kind: 'note' | 'canvas',
	path: string,
	suffix: string,
	title: string
): CanvasTextInlineTarget | null {
	if (!isCanvasVaultRelativeAssetPath(path)) return null;
	const subpath = suffix ? normalizeCanvasFileSubpath(suffix) : null;
	if (suffix && !subpath) return null;
	if (kind === 'canvas' && subpath) return null;
	return {
		kind,
		path,
		title,
		subpath,
		hash: kind === 'note' && subpath ? wikilinkFragment(parseWikilinkSubpath(subpath.slice(1))).slice(1) || null : null
	};
}

function canvasTextInlineTargetFromWikilink(target: string, label: string | undefined): CanvasTextInlineTarget | null {
	if (target.includes('?')) return null;
	const ref = splitCanvasWikilinkTarget(target);
	if (!ref.path) return null;
	const title = label?.trim() || ref.path.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || ref.path;
	if (/\.(md|markdown)$/i.test(ref.path)) return canvasTextInternalTarget('note', ref.path, ref.suffix, title);
	if (/\.canvas$/i.test(ref.path)) return canvasTextInternalTarget('canvas', ref.path, ref.suffix, title);
	return null;
}

function canvasTextInlineFromMarkdownLink(
	label: string,
	rawHref: string,
	sourcePath: string | null | undefined
): CanvasTextPreviewInline | null {
	const text = label.trim();
	const href = rawHref.trim();
	if (!text || !href) return null;
	if (/^https?:\/\/[^)\s]+$/i.test(href)) return { kind: 'link', text, href };
	const ref = canvasTextMarkdownReference(href, sourcePath);
	if (!ref) return null;
	if (/\.(md|markdown)$/i.test(ref.path)) {
		const target = canvasTextInternalTarget('note', ref.path, ref.suffix, text);
		return target ? { kind: 'link', text, target } : null;
	}
	if (/\.canvas$/i.test(ref.path)) {
		const target = canvasTextInternalTarget('canvas', ref.path, ref.suffix, text);
		return target ? { kind: 'link', text, target } : null;
	}
	return null;
}

function canvasTextMarkdownReference(
	rawHref: string,
	sourcePath: string | null | undefined
): { path: string; suffix: string } | null {
	let href = rawHref.trim();
	if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1).trim();
	if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null;
	const ref = splitCanvasAssetReference(href);
	if (!ref.path) return null;
	const vaultRootPath = ref.path.startsWith('/');
	const rawPath = vaultRootPath ? ref.path.slice(1) : ref.path;
	const path = normalizeCanvasMarkdownRelativePath(
		safeDecodeUri(rawPath),
		vaultRootPath ? null : sourcePath
	);
	return path ? { path, suffix: ref.suffix } : null;
}

function normalizeCanvasMarkdownRelativePath(rawPath: string, sourcePath: string | null | undefined): string | null {
	const normalizedSource = sourcePath?.trim().replace(/\\/g, '/') ?? '';
	const slash = normalizedSource.lastIndexOf('/');
	const base = slash >= 0 ? normalizedSource.slice(0, slash) : '';
	const stack: string[] = [];
	for (const segment of `${base ? `${base}/` : ''}${rawPath}`.replace(/\\/g, '/').split('/')) {
		if (!segment || segment === '.') continue;
		if (segment === '..') {
			if (stack.length === 0) return null;
			stack.pop();
			continue;
		}
		stack.push(segment);
	}
	const path = stack.join('/');
	return path && isCanvasVaultRelativeAssetPath(path) ? path : null;
}

function safeDecodeUri(input: string): string {
	try {
		return decodeURI(input);
	} catch {
		return input;
	}
}

function splitCanvasWikilinkTarget(target: string): { path: string; suffix: string } {
	const normalized = target.trim().replace(/\\/g, '/');
	const marker = normalized.indexOf('#');
	if (marker < 0) return { path: normalized, suffix: '' };
	return {
		path: normalized.slice(0, marker),
		suffix: normalized.slice(marker)
	};
}

function canvasCalloutKind(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'note';
}

function canvasCalloutTitle(kind: string, title: string | undefined): string {
	const cleanedTitle = title?.trim();
	if (cleanedTitle) return cleanedTitle;
	return kind.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isCanvasThematicBreak(line: string): boolean {
	const trimmed = line.trim();
	return /^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed);
}

function canvasTablePreviewAt(
	lines: string[],
	index: number,
	options: CanvasTextPreviewOptions
): { table: CanvasTextPreviewTable; nextIndex: number } | null {
	const header = canvasTableRow(lines[index]);
	const separator = canvasTableSeparator(lines[index + 1]);
	if (!header || !separator || header.length < 2) return null;

	const columnCount = header.length;
	const rows: CanvasTextPreviewTableCell[][] = [];
	let nextIndex = index + 2;
	while (nextIndex < lines.length) {
		const row = canvasTableRow(lines[nextIndex]);
		if (!row) break;
		rows.push(canvasTableCells(row, columnCount, options));
		nextIndex += 1;
	}

	return {
		table: {
			headers: canvasTableCells(header, columnCount, options),
			rows
		},
		nextIndex
	};
}

function canvasTableRow(line: string | undefined): string[] | null {
	if (!line || !line.includes('|')) return null;
	const trimmed = line.trim();
	if (!trimmed || /^[-:|\s]+$/.test(trimmed)) return null;
	const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
	const cells = body.split('|').map((cell) => cell.trim());
	return cells.length >= 2 ? cells : null;
}

function canvasTableSeparator(line: string | undefined): boolean {
	if (!line || !line.includes('|')) return false;
	const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	const cells = body.split('|').map((cell) => cell.trim());
	return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function canvasTableCells(values: string[], columnCount: number, options: CanvasTextPreviewOptions): CanvasTextPreviewTableCell[] {
	return Array.from({ length: columnCount }, (_, index) => ({
		inline: canvasTextPreviewInlines(values[index] ?? '', options)
	}));
}

function canvasImageSizeSpec(raw: string): Pick<CanvasTextPreviewEmbed, 'width' | 'height'> | null {
	const size = raw.trim().match(/^(\d{1,5})(?:\s*x\s*(\d{1,5}))?$/i);
	if (!size) return null;
	const width = Number.parseInt(size[1], 10);
	const height = size[2] ? Number.parseInt(size[2], 10) : null;
	if (!Number.isFinite(width) || width <= 0 || (height != null && (!Number.isFinite(height) || height <= 0))) {
		return null;
	}
	return { width, height };
}

function canvasObsidianEmbedMeta(raw: string | undefined): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const meta = raw?.trim();
	if (!meta) return { alt: null, width: null, height: null };
	const parts = meta.split('|').map((part) => part.trim());
	const size = canvasImageSizeSpec(parts.at(-1) ?? '');
	if (!size) return { alt: meta, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

function canvasMarkdownImageMeta(raw: string): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const directSize = canvasImageSizeSpec(raw);
	if (directSize) return { alt: null, ...directSize };
	const parts = raw.split('|').map((part) => part.trim());
	const size = parts.length > 1 ? canvasImageSizeSpec(parts.at(-1) ?? '') : null;
	if (!size) return { alt: raw.trim() || null, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

function canvasTextEmbedFromTarget(
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	const ref = splitCanvasAssetReference(target);
	if (!ref.path || !isCanvasVaultRelativeAssetPath(ref.path)) return null;
	const title = meta.alt ?? ref.path.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') ?? ref.path;
	if (/\.(md|markdown)$/i.test(ref.path)) {
		if (ref.suffix && !normalizeCanvasFileSubpath(ref.suffix)) return null;
		return {
			path: ref.path,
			suffix: ref.suffix,
			kind: 'note',
			title,
			...meta
		};
	}
	if (/\.canvas$/i.test(ref.path)) {
		if (ref.suffix) return null;
		return {
			path: ref.path,
			suffix: '',
			kind: 'canvas',
			title,
			...meta
		};
	}
	const kind = canvasFileAssetKind(ref.path);
	return {
		path: ref.path,
		suffix: ref.suffix,
		kind,
		title,
		...meta
	};
}

function canvasTextEmbedPreview(line: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewEmbed | null {
	const trimmed = line.trim();
	const obsidian = trimmed.match(/^!\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?]]$/);
	if (obsidian) {
		const target = obsidian[1].trim();
		const meta = canvasObsidianEmbedMeta(obsidian[2]);
		const direct = canvasTextEmbedFromTarget(target, meta);
		if (direct && (direct.kind !== 'file' || canvasAssetReferenceHasExtension(target))) return direct;
		return options.resolveEmbedTarget?.(target, meta) ?? null;
	}

	const markdown = trimmed.match(/^!\[([^\]\n]*)]\(([^)\s]+)\)$/);
	if (markdown) {
		return canvasTextEmbedFromTarget(markdown[2].trim(), canvasMarkdownImageMeta(markdown[1]));
	}

	return null;
}

function canvasAssetReferenceHasExtension(target: string): boolean {
	const ref = splitCanvasAssetReference(target);
	return /\.[^./]+$/.test(ref.path);
}

function isCanvasStandaloneEmbedSyntax(line: string): boolean {
	const trimmed = line.trim();
	return /^!\[\[[^\[\]\n]+]]$/.test(trimmed) || /^!\[[^\]\n]*]\([^\n)]+\)$/.test(trimmed);
}

function firstInlineMatch(
	value: string,
	options: CanvasTextPreviewOptions
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const candidates = [
		inlineCandidate(value, /`([^`]+)`/, (match) => ({ kind: 'code', text: match[1] })),
		inlineCandidate(value, /\*\*([^*\n]+)\*\*/, (match) => ({ kind: 'strong', text: match[1] })),
		inlineCandidate(value, /~~([^~\n]+)~~/, (match) => ({ kind: 'strikethrough', text: match[1] })),
		inlineCandidate(value, /==([^=\n]+)==/, (match) => ({ kind: 'highlight', text: match[1] })),
		inlineCandidate(value, /\[([^\]\n]+)]\(([^)\n]+)\)/, (match) =>
			canvasTextInlineFromMarkdownLink(match[1], match[2], options.sourcePath)
		),
		inlineCandidate(value, /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?]]/, (match) => {
			const rawTarget = match[1].trim();
			const label = match[2]?.trim();
			const target = canvasTextInlineTargetFromWikilink(rawTarget, label) ?? options.resolveWikilinkTarget?.(rawTarget, label);
			const displayTarget = splitCanvasWikilinkTarget(rawTarget).path || rawTarget;
			return {
				kind: 'wikilink',
				text: label || displayTarget,
				...(target ? { target } : {})
			};
		}),
		inlineCandidate(value, /\*([^*\n]+)\*/, (match) => ({ kind: 'emphasis', text: match[1] }))
	].filter((candidate): candidate is { index: number; raw: string; inline: CanvasTextPreviewInline } => Boolean(candidate));

	return candidates.sort((a, b) => a.index - b.index || inlinePriority(a.inline.kind) - inlinePriority(b.inline.kind))[0] ?? null;
}

function inlineCandidate(
	value: string,
	pattern: RegExp,
	createInline: (match: RegExpMatchArray) => CanvasTextPreviewInline | null
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const match = value.match(pattern);
	if (!match || match.index === undefined || !match[0]) return null;
	const inline = createInline(match);
	return inline ? { index: match.index, raw: match[0], inline } : null;
}

function inlinePriority(kind: CanvasTextPreviewInlineKind): number {
	const priorities: Record<CanvasTextPreviewInlineKind, number> = {
		code: 0,
		strong: 1,
		strikethrough: 2,
		highlight: 3,
		link: 4,
		wikilink: 5,
		emphasis: 6,
		text: 7
	};
	return priorities[kind];
}
