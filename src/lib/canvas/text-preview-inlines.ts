import type { NoteLinkTarget } from '$lib/types';
import { canvasMarkdownInlineSyntaxCandidate } from '$lib/canvas/markdown-destinations';
import type { CanvasMarkdownInlineSyntax } from '$lib/canvas/markdown-destinations';
import {
	canvasMarkdownImageMeta,
	canvasTextEmbedFromMarkdownTarget
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

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight' | 'code' | 'wikilink' | 'link' | 'image';

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

export function canvasMarkdownUnescapeText(value: string): string {
	return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
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
