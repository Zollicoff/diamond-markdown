import path from 'node:path';
import { escAttr, escHtml } from '$lib/util/strings';

export interface ImageRenderMeta {
	target: string;
	alt: string | null;
	width: number | null;
	height: number | null;
}

export type AttachmentEmbedKind = 'audio' | 'video' | 'pdf' | 'file';

export function parseImageSizeSpec(raw: string): Pick<ImageRenderMeta, 'width' | 'height'> | null {
	const size = raw.trim().match(/^(\d{1,5})(?:\s*x\s*(\d{1,5}))?$/i);
	if (!size) return null;

	const width = Number.parseInt(size[1], 10);
	const height = size[2] ? Number.parseInt(size[2], 10) : null;
	if (!Number.isFinite(width) || width <= 0 || (height != null && (!Number.isFinite(height) || height <= 0))) {
		return null;
	}
	return { width, height };
}

export function parseObsidianEmbedMeta(raw: string | undefined): Pick<ImageRenderMeta, 'alt' | 'width' | 'height'> {
	const meta = raw?.trim();
	if (!meta) return { alt: null, width: null, height: null };

	const parts = meta.split('|').map((part) => part.trim());
	const size = parseImageSizeSpec(parts.at(-1) ?? '');
	if (!size) return { alt: meta, width: null, height: null };

	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

export function parseMarkdownImageText(text: string): Pick<ImageRenderMeta, 'alt' | 'width' | 'height'> {
	const directSize = parseImageSizeSpec(text);
	if (directSize) return { alt: null, ...directSize };

	const parts = text.split('|').map((part) => part.trim());
	const size = parts.length > 1 ? parseImageSizeSpec(parts.at(-1) ?? '') : null;
	if (!size) return { alt: text || null, width: null, height: null };

	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

export function isExternalImageHref(href: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}

function safeDecodeUri(input: string): string {
	try {
		return decodeURI(input);
	} catch {
		return input;
	}
}

export function resolveMarkdownImagePath(href: string, sourcePath: string | null): string | null {
	const trimmed = href.trim();
	if (!trimmed || isExternalImageHref(trimmed) || trimmed.startsWith('/')) return null;

	const withoutFragment = trimmed.split('#')[0].split('?')[0];
	if (!withoutFragment) return null;

	const decoded = safeDecodeUri(withoutFragment);
	const baseDir = sourcePath ? path.posix.dirname(sourcePath) : '.';
	const resolved = path.posix.normalize(path.posix.join(baseDir, decoded));
	if (!resolved || resolved === '.' || resolved === '..' || resolved.startsWith('../')) {
		return null;
	}
	return resolved;
}

const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v)$/i;
const PDF_EXT_RE = /\.pdf$/i;

export function attachmentEmbedKind(target: string): AttachmentEmbedKind | null {
	const cleanTarget = target.split('#')[0].split('?')[0];
	const ext = path.posix.extname(cleanTarget).toLowerCase();
	if (!ext || ext === '.md') return null;
	if (AUDIO_EXT_RE.test(cleanTarget)) return 'audio';
	if (VIDEO_EXT_RE.test(cleanTarget)) return 'video';
	if (PDF_EXT_RE.test(cleanTarget)) return 'pdf';
	return 'file';
}

export function embedImageAttrs(embed: ImageRenderMeta): string {
	const alt = embed.alt ?? embed.target.split('/').pop() ?? '';
	const sizeAttrs = [
		embed.width != null ? ` width="${embed.width}"` : '',
		embed.height != null ? ` height="${embed.height}"` : ''
	].join('');
	return `alt="${escAttr(alt)}" class="embed-image" loading="lazy"${sizeAttrs}`;
}

function embedSizeAttrs(embed: ImageRenderMeta): string {
	return [
		embed.width != null ? ` width="${embed.width}"` : '',
		embed.height != null ? ` height="${embed.height}"` : ''
	].join('');
}

function attachmentLabel(embed: ImageRenderMeta): string {
	return embed.alt ?? embed.target.split('/').pop() ?? embed.target;
}

export function renderAttachmentEmbedHtml(embed: ImageRenderMeta, src: string, kind: AttachmentEmbedKind): string {
	const label = attachmentLabel(embed);
	const escapedLabel = escHtml(label);
	const attrLabel = escAttr(label);
	const escapedSrc = escAttr(src);
	const sizeAttrs = embedSizeAttrs(embed);

	if (kind === 'audio') {
		return `<figure class="embed-attachment embed-audio"><audio controls preload="metadata" src="${escapedSrc}" aria-label="${attrLabel}"></audio><figcaption>${escapedLabel}</figcaption></figure>`;
	}
	if (kind === 'video') {
		return `<figure class="embed-attachment embed-video"><video controls preload="metadata" src="${escapedSrc}" title="${attrLabel}"${sizeAttrs}></video><figcaption>${escapedLabel}</figcaption></figure>`;
	}
	if (kind === 'pdf') {
		return `<a class="embed-attachment embed-pdf embed-file" href="${escapedSrc}" target="_blank" rel="noreferrer" download><span class="embed-file-label">${escapedLabel}</span></a>`;
	}
	return `<a class="embed-attachment embed-file" href="${escapedSrc}" target="_blank" rel="noreferrer" download><span class="embed-file-label">${escapedLabel}</span></a>`;
}
