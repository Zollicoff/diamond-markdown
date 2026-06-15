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
import {
	canvasNoteLinkTargetFor,
	canvasNoteLinkTargetLookup,
	canvasTextInternalTarget,
	canvasTextMarkdownReference,
	canvasTextTargetRouteHref
} from '$lib/canvas/text-preview-references';
import type { CanvasTextInlineTarget } from '$lib/canvas/text-preview-references';

export type CanvasTextEmbedKind = CanvasFileAssetKind | 'note' | 'canvas';

export interface CanvasTextPreviewEmbed {
	path: string;
	suffix: string;
	kind: CanvasTextEmbedKind;
	title: string;
	alt: string | null;
	width: number | null;
	height: number | null;
}

export type CanvasTextEmbedOpenTarget = CanvasTextInlineTarget;

export type CanvasTextEmbedResolver = (
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
) => CanvasTextPreviewEmbed | null;

export interface CanvasTextEmbedPreviewOptions {
	resolveEmbedTarget?: CanvasTextEmbedResolver;
	sourcePath?: string | null;
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

export function canvasTextEmbedPreview(
	line: string,
	options: CanvasTextEmbedPreviewOptions = {}
): CanvasTextPreviewEmbed | null {
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

export function isCanvasStandaloneEmbedSyntax(line: string): boolean {
	const trimmed = line.trim();
	const markdown = canvasMarkdownInlineSyntaxCandidate(trimmed, true);
	return /^!\[\[[^\[\]\n]+]]$/.test(trimmed) || Boolean(markdown && markdown.index === 0 && markdown.raw.length === trimmed.length);
}

export function canvasMarkdownImageMeta(raw: string): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const directSize = canvasImageSizeSpec(raw);
	if (directSize) return { alt: null, ...directSize };
	const parts = raw.split('|').map((part) => part.trim());
	const size = parts.length > 1 ? canvasImageSizeSpec(parts.at(-1) ?? '') : null;
	if (!size) return { alt: raw.trim() || null, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

export function canvasObsidianEmbedMeta(raw: string | undefined): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const meta = raw?.trim();
	if (!meta) return { alt: null, width: null, height: null };
	const parts = meta.split('|').map((part) => part.trim());
	const size = canvasImageSizeSpec(parts.at(-1) ?? '');
	if (!size) return { alt: meta, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

export function canvasTextEmbedFromMarkdownTarget(
	target: string,
	sourcePath: string | null | undefined,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	const ref = canvasTextMarkdownReference(target, sourcePath);
	return ref ? canvasTextEmbedFromReference(ref, meta) : null;
}

export function canvasTextEmbedFromTarget(
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	const ref = splitCanvasAssetReference(target);
	if (!ref.path || !isCanvasVaultRelativeAssetPath(ref.path)) return null;
	return canvasTextEmbedFromReference(ref, meta);
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

function canvasAssetReferenceHasExtension(target: string): boolean {
	const ref = splitCanvasAssetReference(target);
	return /\.[^./]+$/.test(ref.path);
}
