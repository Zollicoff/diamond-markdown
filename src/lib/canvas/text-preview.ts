import type { NoteLinkTarget } from '$lib/types';
import {
	canvasFileAssetKind,
	canvasRawAssetHref,
	isCanvasVaultRelativeAssetPath,
	normalizeCanvasFileSubpath,
	splitCanvasAssetReference
} from '$lib/canvas/files';
import type { CanvasFileAssetKind } from '$lib/canvas/files';
import { canvasMarkdownInlineSyntaxCandidate } from '$lib/canvas/markdown-destinations';
import type { CanvasMarkdownInlineSyntax } from '$lib/canvas/markdown-destinations';
import {
	canvasNoteLinkTargetFor,
	canvasNoteLinkTargetLookup,
	canvasTextInlineTargetFromWikilink,
	canvasTextInternalTarget,
	canvasTextMarkdownReference,
	canvasTextTargetRouteHref,
	splitCanvasWikilinkTarget
} from '$lib/canvas/text-preview-references';
import type { CanvasTextInlineTarget } from '$lib/canvas/text-preview-references';
import { stripObsidianCommentsOutsideCode } from '$lib/markdown/obsidian-comments';

export type { CanvasTextInlineTarget } from '$lib/canvas/text-preview-references';

export type CanvasTextEmbedKind = CanvasFileAssetKind | 'note' | 'canvas';

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight' | 'code' | 'wikilink' | 'link' | 'image';
export type CanvasTextPreviewCalloutFold = 'open' | 'closed' | null;
export type CanvasTextPreviewTableAlignment = 'left' | 'center' | 'right' | null;

export interface CanvasTextPreviewInline {
	kind: CanvasTextPreviewInlineKind;
	text: string;
	href?: string;
	target?: CanvasTextInlineTarget;
	embed?: CanvasTextPreviewEmbed;
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
	align: CanvasTextPreviewTableAlignment;
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
	return target ? canvasTextTargetRouteHref(vaultId, target) : null;
}

export function canvasTextInlineTargetHref(vaultId: string, inline: CanvasTextPreviewInline): string | null {
	return inline.target ? canvasTextTargetRouteHref(vaultId, inline.target) : null;
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

function canvasTextInlineFromMarkdownImage(
	label: string,
	rawHref: string,
	sourcePath: string | null | undefined
): CanvasTextPreviewInline | null {
	const embed = canvasTextEmbedFromMarkdownTarget(rawHref, sourcePath, canvasMarkdownImageMeta(label));
	if (!embed || embed.kind !== 'image') return null;
	return { kind: 'image', text: embed.title, embed };
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
	const alignments = canvasTableSeparator(lines[index + 1]);
	if (!header || !alignments || header.length < 2) return null;

	const columnCount = header.length;
	const rows: CanvasTextPreviewTableCell[][] = [];
	let nextIndex = index + 2;
	while (nextIndex < lines.length) {
		const row = canvasTableRow(lines[nextIndex]);
		if (!row) break;
		rows.push(canvasTableCells(row, columnCount, options, alignments));
		nextIndex += 1;
	}

	return {
		table: {
			headers: canvasTableCells(header, columnCount, options, alignments),
			rows
		},
		nextIndex
	};
}

function canvasTableRow(line: string | undefined): string[] | null {
	if (!line || !line.includes('|')) return null;
	const trimmed = line.trim();
	if (!trimmed || /^[-:|\s]+$/.test(trimmed)) return null;
	const cells = canvasTableSplitCells(trimmed).map((cell) => cell.trim());
	return cells.length >= 2 ? cells : null;
}

function canvasTableSeparator(line: string | undefined): CanvasTextPreviewTableAlignment[] | null {
	if (!line || !line.includes('|')) return null;
	const cells = canvasTableSplitCells(line.trim()).map((cell) => cell.trim());
	if (cells.length < 2) return null;
	const alignments: CanvasTextPreviewTableAlignment[] = [];
	for (const cell of cells) {
		if (!/^:?-{3,}:?$/.test(cell)) return null;
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		alignments.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
	}
	return alignments;
}

function canvasTableSplitCells(row: string): string[] {
	const body = canvasTableBody(row);
	const cells: string[] = [];
	let cell = '';
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (char === '|' && !canvasPipeEscaped(body, index)) {
			cells.push(cell);
			cell = '';
			continue;
		}
		if (char === '|' && canvasPipeEscaped(body, index)) {
			cell = cell.slice(0, -1) + '|';
			continue;
		}
		cell += char;
	}
	cells.push(cell);
	return cells;
}

function canvasTableBody(row: string): string {
	let start = 0;
	let end = row.length;
	if (row[start] === '|') start += 1;
	if (end > start && row[end - 1] === '|' && !canvasPipeEscaped(row, end - 1)) end -= 1;
	return row.slice(start, end);
}

function canvasPipeEscaped(value: string, pipeIndex: number): boolean {
	let slashCount = 0;
	for (let index = pipeIndex - 1; index >= 0 && value[index] === '\\'; index -= 1) {
		slashCount += 1;
	}
	return slashCount % 2 === 1;
}

function canvasTableCells(
	values: string[],
	columnCount: number,
	options: CanvasTextPreviewOptions,
	alignments: CanvasTextPreviewTableAlignment[] = []
): CanvasTextPreviewTableCell[] {
	return Array.from({ length: columnCount }, (_, index) => ({
		inline: canvasTextPreviewInlines(values[index] ?? '', options),
		align: alignments[index] ?? null
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
	return canvasTextEmbedFromReference(ref, meta);
}

function canvasTextEmbedFromMarkdownTarget(
	target: string,
	sourcePath: string | null | undefined,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	const ref = canvasTextMarkdownReference(target, sourcePath);
	return ref ? canvasTextEmbedFromReference(ref, meta) : null;
}

function canvasTextEmbedFromReference(
	ref: { path: string; suffix: string },
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	if (!isCanvasVaultRelativeAssetPath(ref.path)) return null;
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

	const markdown = canvasMarkdownInlineSyntaxCandidate(trimmed, true);
	if (markdown && markdown.index === 0 && markdown.raw.length === trimmed.length) {
		return canvasTextEmbedFromMarkdownTarget(
			markdown.href.trim(),
			options.sourcePath,
			canvasMarkdownImageMeta(markdown.label)
		);
	}

	return null;
}

function canvasAssetReferenceHasExtension(target: string): boolean {
	const ref = splitCanvasAssetReference(target);
	return /\.[^./]+$/.test(ref.path);
}

function isCanvasStandaloneEmbedSyntax(line: string): boolean {
	const trimmed = line.trim();
	const markdown = canvasMarkdownInlineSyntaxCandidate(trimmed, true);
	return /^!\[\[[^\[\]\n]+]]$/.test(trimmed) || Boolean(markdown && markdown.index === 0 && markdown.raw.length === trimmed.length);
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
		inlineMarkdownCandidate(value, true, (match) =>
			canvasTextInlineFromMarkdownImage(match.label, match.href, options.sourcePath)
		),
		inlineMarkdownCandidate(value, false, (match) =>
			canvasTextInlineFromMarkdownLink(match.label, match.href, options.sourcePath)
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

function inlineMarkdownCandidate(
	value: string,
	image: boolean,
	createInline: (match: CanvasMarkdownInlineSyntax) => CanvasTextPreviewInline | null
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	let searchIndex = 0;
	while (searchIndex < value.length) {
		const match = canvasMarkdownInlineSyntaxCandidate(value, image, searchIndex);
		if (!match) return null;
		const inline = createInline(match);
		if (inline) return { index: match.index, raw: match.raw, inline };
		searchIndex = match.index + 1;
	}
	return null;
}

function inlinePriority(kind: CanvasTextPreviewInlineKind): number {
	const priorities: Record<CanvasTextPreviewInlineKind, number> = {
		code: 0,
		strong: 1,
		strikethrough: 2,
		highlight: 3,
		image: 4,
		link: 5,
		wikilink: 6,
		emphasis: 7,
		text: 8
	};
	return priorities[kind];
}
