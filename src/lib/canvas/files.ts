import { parseWikilinkSubpath, wikilinkFragment } from '$lib/markdown/wikilinks';
import type { CanvasNode } from '$lib/types';

export interface CanvasFileOpenTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	actionLabel: string;
	subpath: string | null;
	hash: string | null;
}

export type CanvasFileAssetKind = 'image' | 'pdf' | 'audio' | 'video' | 'file';

export interface CanvasFileAssetPreview {
	kind: CanvasFileAssetKind;
	path: string;
	title: string;
	href: string;
	actionLabel: string;
}

const CANVAS_IMAGE_ASSET_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const CANVAS_PDF_ASSET_RE = /\.pdf$/i;
const CANVAS_AUDIO_ASSET_RE = /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const CANVAS_VIDEO_ASSET_RE = /\.(mp4|webm|ogv|mov|m4v)$/i;
const CANVAS_URI_RE = /^[a-z][a-z0-9+.-]*:/i;
const CANVAS_SUBPATH_MAX = 240;

export function canvasFileNodePath(node: CanvasNode): string | null {
	if (node.type !== 'file') return null;
	const filePath = node.file?.trim() ?? '';
	return filePath || null;
}

export function normalizeCanvasFileSubpath(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	if (!trimmed) return null;
	if (!trimmed.startsWith('#')) return null;
	if (trimmed.length > CANVAS_SUBPATH_MAX || trimmed.includes('\0') || /[\r\n]/.test(trimmed)) return null;
	const body = trimmed.slice(1).trim();
	if (!body) return null;
	return `#${body}`;
}

export function canvasFileNodeSubpath(node: CanvasNode): string | null {
	if (node.type !== 'file') return null;
	return normalizeCanvasFileSubpath(node.subpath);
}

export function canvasFileNodeFragment(node: CanvasNode): string | null {
	const subpath = canvasFileNodeSubpath(node);
	if (!subpath) return null;
	const fragment = wikilinkFragment(parseWikilinkSubpath(subpath.slice(1)));
	return fragment || null;
}

export function canvasFileNodeDisplayPath(node: CanvasNode): string {
	const filePath = canvasFileNodePath(node) ?? '';
	return `${filePath}${canvasFileNodeSubpath(node) ?? ''}`;
}

export function canvasFileNodeTitle(node: CanvasNode): string {
	const filePath = canvasFileNodePath(node) ?? '';
	return node.label?.trim() || filePath.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || filePath;
}

export function canvasFileOpenTarget(node: CanvasNode): CanvasFileOpenTarget | null {
	const filePath = canvasFileNodePath(node);
	if (!filePath) return null;
	const title = canvasFileNodeTitle(node);
	const subpath = canvasFileNodeSubpath(node);
	const fragment = canvasFileNodeFragment(node);
	const hash = fragment ? fragment.slice(1) : null;
	if (/\.(md|markdown)$/i.test(filePath)) {
		return { kind: 'note', path: filePath, title, actionLabel: 'Open note', subpath, hash };
	}
	if (/\.canvas$/i.test(filePath)) {
		return { kind: 'canvas', path: filePath, title, actionLabel: 'Open Canvas', subpath, hash: null };
	}
	return null;
}

export function canvasFileAssetKind(assetPath: string): CanvasFileAssetKind {
	const cleanPath = splitCanvasAssetReference(assetPath).path;
	if (CANVAS_IMAGE_ASSET_RE.test(cleanPath)) return 'image';
	if (CANVAS_PDF_ASSET_RE.test(cleanPath)) return 'pdf';
	if (CANVAS_AUDIO_ASSET_RE.test(cleanPath)) return 'audio';
	if (CANVAS_VIDEO_ASSET_RE.test(cleanPath)) return 'video';
	return 'file';
}

export function isCanvasVaultRelativeAssetPath(assetPath: string): boolean {
	const normalized = assetPath.trim().replace(/\\/g, '/');
	if (!normalized || normalized.startsWith('/') || CANVAS_URI_RE.test(normalized) || normalized.includes('\0')) {
		return false;
	}
	return !normalized.split('/').some((segment) => segment === '..');
}

export function splitCanvasAssetReference(target: string): { path: string; suffix: string } {
	const normalized = target.trim().replace(/\\/g, '/');
	const marker = normalized.search(/[?#]/);
	if (marker < 0) return { path: normalized, suffix: '' };
	return {
		path: normalized.slice(0, marker),
		suffix: normalized.slice(marker)
	};
}

export function canvasRawAssetHref(vaultId: string, assetPath: string): string | null {
	const ref = splitCanvasAssetReference(assetPath);
	if (!isCanvasVaultRelativeAssetPath(ref.path)) return null;
	const encodedPath = ref.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	return `/api/vaults/${encodeURIComponent(vaultId)}/raw/${encodedPath}${ref.suffix}`;
}

export function canvasFileAssetPreview(node: CanvasNode, vaultId: string): CanvasFileAssetPreview | null {
	const filePath = canvasFileNodePath(node);
	if (!filePath || canvasFileOpenTarget(node)) return null;
	const href = canvasRawAssetHref(vaultId, filePath);
	if (!href) return null;
	const kind = canvasFileAssetKind(filePath);
	const labels: Record<CanvasFileAssetKind, string> = {
		image: 'Open image',
		pdf: 'Open PDF',
		audio: 'Open audio',
		video: 'Open video',
		file: 'Open asset'
	};
	return {
		kind,
		path: filePath,
		title: canvasFileNodeTitle(node),
		href,
		actionLabel: labels[kind]
	};
}

export function canvasLinkNodeHref(node: CanvasNode): string | null {
	if (node.type !== 'link') return null;
	const rawUrl = node.url?.trim();
	if (!rawUrl) return null;
	try {
		const url = new URL(rawUrl);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}
