import {
	canvasTextEmbedPreview,
	isCanvasStandaloneEmbedSyntax
} from '$lib/canvas/text-preview-embeds';
import type { CanvasTextPreviewEmbed } from '$lib/canvas/text-preview-embeds';
import { canvasTextPreviewInlines } from '$lib/canvas/text-preview-inlines';
import type { CanvasTextPreviewInline, CanvasTextPreviewOptions } from '$lib/canvas/text-preview-inlines';
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
export {
	canvasMarkdownUnescapeText,
	canvasTextInlineTargetHref,
	canvasTextNoteWikilinkResolver,
	canvasTextPreviewInlines
} from '$lib/canvas/text-preview-inlines';
export type {
	CanvasTextPreviewInline,
	CanvasTextPreviewInlineKind,
	CanvasTextPreviewOptions,
	CanvasTextWikilinkResolver
} from '$lib/canvas/text-preview-inlines';
export type {
	CanvasTextPreviewTable,
	CanvasTextPreviewTableAlignment,
	CanvasTextPreviewTableCell
} from '$lib/canvas/text-preview-tables';

export type CanvasTextPreviewCalloutFold = 'open' | 'closed' | null;

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
