import type { NoteLinkTarget } from '$lib/types';
import { canvasMarkdownInlineSyntaxCandidate } from '$lib/canvas/markdown-destinations';
import type { CanvasMarkdownInlineSyntax } from '$lib/canvas/markdown-destinations';
import {
	canvasMarkdownImageMeta,
	canvasTextEmbedFromMarkdownTarget,
	canvasTextEmbedPreview,
	isCanvasStandaloneEmbedSyntax
} from '$lib/canvas/text-preview-embeds';
import type { CanvasTextEmbedResolver, CanvasTextPreviewEmbed } from '$lib/canvas/text-preview-embeds';
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
import { canvasTextTablePreviewAt } from '$lib/canvas/text-preview-tables';
import type { CanvasTextPreviewTable } from '$lib/canvas/text-preview-tables';
import { stripObsidianCommentsOutsideCode } from '$lib/markdown/obsidian-comments';

export type { CanvasTextInlineTarget } from '$lib/canvas/text-preview-references';
export {
	canvasMarkdownImageMeta,
	canvasObsidianEmbedMeta,
	canvasTextEmbedFromMarkdownTarget,
	canvasTextEmbedFromTarget,
	canvasTextEmbedHref,
	canvasTextEmbedOpenTarget,
	canvasTextEmbedPreview,
	canvasTextEmbedRouteHref,
	canvasTextNoteEmbedResolver,
	isCanvasStandaloneEmbedSyntax
} from '$lib/canvas/text-preview-embeds';
export type {
	CanvasTextEmbedKind,
	CanvasTextEmbedOpenTarget,
	CanvasTextEmbedResolver,
	CanvasTextPreviewEmbed
} from '$lib/canvas/text-preview-embeds';
export type {
	CanvasTextPreviewTable,
	CanvasTextPreviewTableAlignment,
	CanvasTextPreviewTableCell
} from '$lib/canvas/text-preview-tables';

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight' | 'code' | 'wikilink' | 'link' | 'image';
export type CanvasTextPreviewCalloutFold = 'open' | 'closed' | null;

export interface CanvasTextPreviewInline {
	kind: CanvasTextPreviewInlineKind;
	text: string;
	href?: string;
	target?: CanvasTextInlineTarget;
	embed?: CanvasTextPreviewEmbed;
}

export type CanvasTextWikilinkResolver = (target: string, label: string | undefined) => CanvasTextInlineTarget | null;

export interface CanvasTextPreviewOptions {
	resolveWikilinkTarget?: CanvasTextWikilinkResolver;
	resolveEmbedTarget?: CanvasTextEmbedResolver;
	sourcePath?: string | null;
}

export interface CanvasTextPreviewListItem {
	inline: CanvasTextPreviewInline[];
	checked?: boolean;
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
			inlines.push({ kind: 'text', text: canvasMarkdownUnescapeText(remaining) });
			break;
		}
		if (match.index > 0) {
			inlines.push({ kind: 'text', text: canvasMarkdownUnescapeText(remaining.slice(0, match.index)) });
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

		const table = canvasTextTablePreviewAt(lines, index, (value) => canvasTextPreviewInlines(value, options));
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

function canvasTextInlineFromMarkdownLink(
	label: string,
	rawHref: string,
	sourcePath: string | null | undefined
): CanvasTextPreviewInline | null {
	const text = canvasMarkdownUnescapeText(label).trim();
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
	const embed = canvasTextEmbedFromMarkdownTarget(rawHref, sourcePath, canvasMarkdownImageMeta(canvasMarkdownUnescapeText(label)));
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

function firstInlineMatch(
	value: string,
	options: CanvasTextPreviewOptions
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const candidates = [
		inlineCandidate(value, /`([^`]+)`/, (match) => ({ kind: 'code', text: match[1] })),
		inlineCandidate(value, /\*\*([^*\n]+)\*\*/, (match) => ({ kind: 'strong', text: canvasMarkdownUnescapeText(match[1]) })),
		inlineCandidate(value, /~~([^~\n]+)~~/, (match) => ({ kind: 'strikethrough', text: canvasMarkdownUnescapeText(match[1]) })),
		inlineCandidate(value, /==([^=\n]+)==/, (match) => ({ kind: 'highlight', text: canvasMarkdownUnescapeText(match[1]) })),
		inlineMarkdownCandidate(value, true, (match) =>
			canvasTextInlineFromMarkdownImage(match.label, match.href, options.sourcePath)
		),
		inlineMarkdownCandidate(value, false, (match) =>
			canvasTextInlineFromMarkdownLink(match.label, match.href, options.sourcePath)
		),
		inlineCandidate(value, /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?]]/, (match) => {
			const rawTarget = match[1].trim();
			const label = match[2] ? canvasMarkdownUnescapeText(match[2]).trim() : undefined;
			const target = canvasTextInlineTargetFromWikilink(rawTarget, label) ?? options.resolveWikilinkTarget?.(rawTarget, label);
			const displayTarget = splitCanvasWikilinkTarget(rawTarget).path || rawTarget;
			return {
				kind: 'wikilink',
				text: label || displayTarget,
				...(target ? { target } : {})
			};
		}),
		inlineCandidate(value, /\*([^*\n]+)\*/, (match) => ({ kind: 'emphasis', text: canvasMarkdownUnescapeText(match[1]) }))
	].filter((candidate): candidate is { index: number; raw: string; inline: CanvasTextPreviewInline } => Boolean(candidate));

	return candidates.sort((a, b) => a.index - b.index || inlinePriority(a.inline.kind) - inlinePriority(b.inline.kind))[0] ?? null;
}

function inlineCandidate(
	value: string,
	pattern: RegExp,
	createInline: (match: RegExpMatchArray) => CanvasTextPreviewInline | null
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
	let match: RegExpExecArray | null;
	while ((match = matcher.exec(value))) {
		if (!match[0]) continue;
		if (canvasMarkdownDelimiterEscaped(value, match.index)) {
			if (matcher.lastIndex <= match.index) matcher.lastIndex = match.index + 1;
			continue;
		}
		const inline = createInline(match);
		if (inline) return { index: match.index, raw: match[0], inline };
		if (matcher.lastIndex <= match.index) matcher.lastIndex = match.index + 1;
	}
	return null;
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

function canvasMarkdownDelimiterEscaped(value: string, markerIndex: number): boolean {
	const marker = value[markerIndex];
	if (markerIndex >= 2 && value[markerIndex - 1] === marker && value[markerIndex - 2] === '\\') {
		return true;
	}
	let slashCount = 0;
	for (let index = markerIndex - 1; index >= 0 && value[index] === '\\'; index -= 1) {
		slashCount += 1;
	}
	return slashCount % 2 === 1;
}

function canvasMarkdownUnescapeText(value: string): string {
	return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}
