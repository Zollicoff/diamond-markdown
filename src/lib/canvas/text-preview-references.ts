import { parseWikilinkSubpath, wikilinkFragment } from '$lib/markdown/wikilinks';
import type { NoteLinkTarget } from '$lib/types';
import {
	isCanvasVaultRelativeAssetPath,
	normalizeCanvasFileSubpath,
	splitCanvasAssetReference
} from '$lib/canvas/files';
import {
	canvasMarkdownLinkDestination,
	safeDecodeCanvasMarkdownUri
} from '$lib/canvas/markdown-destinations';

export interface CanvasTextInlineTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	subpath: string | null;
	hash: string | null;
}

export interface CanvasTextMarkdownReference {
	path: string;
	suffix: string;
}

export function canvasTextTargetRouteHref(vaultId: string, target: CanvasTextInlineTarget): string {
	const encodedPath = target.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	const base = `/vault/${encodeURIComponent(vaultId)}/${target.kind === 'canvas' ? 'canvas' : 'note'}/${encodedPath}`;
	return target.hash ? `${base}#${encodeURIComponent(target.hash)}` : base;
}

export function canvasTextInternalTarget(
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

export function canvasTextInlineTargetFromWikilink(target: string, label: string | undefined): CanvasTextInlineTarget | null {
	if (target.includes('?')) return null;
	const ref = splitCanvasWikilinkTarget(target);
	if (!ref.path) return null;
	const title = label?.trim() || ref.path.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || ref.path;
	if (/\.(md|markdown)$/i.test(ref.path)) return canvasTextInternalTarget('note', ref.path, ref.suffix, title);
	if (/\.canvas$/i.test(ref.path)) return canvasTextInternalTarget('canvas', ref.path, ref.suffix, title);
	return null;
}

export function canvasTextMarkdownReference(
	rawHref: string,
	sourcePath: string | null | undefined
): CanvasTextMarkdownReference | null {
	const href = canvasMarkdownLinkDestination(rawHref);
	if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null;
	const ref = splitCanvasAssetReference(href);
	if (!ref.path) return null;
	const vaultRootPath = ref.path.startsWith('/');
	const rawPath = vaultRootPath ? ref.path.slice(1) : ref.path;
	const path = normalizeCanvasMarkdownRelativePath(
		safeDecodeCanvasMarkdownUri(rawPath),
		vaultRootPath ? null : sourcePath
	);
	return path ? { path, suffix: ref.suffix } : null;
}

export function splitCanvasWikilinkTarget(target: string): CanvasTextMarkdownReference {
	const normalized = target.trim().replace(/\\/g, '/');
	const marker = normalized.indexOf('#');
	if (marker < 0) return { path: normalized, suffix: '' };
	return {
		path: normalized.slice(0, marker),
		suffix: normalized.slice(marker)
	};
}

export function canvasNoteLinkTargetLookup(targets: NoteLinkTarget[]): Map<string, NoteLinkTarget> {
	const lookup = new Map<string, NoteLinkTarget>();
	for (const target of targets) {
		for (const key of canvasNoteLinkTargetKeys(target)) {
			lookup.set(key, target);
		}
	}
	return lookup;
}

export function canvasNoteLinkTargetFor(
	lookup: Map<string, NoteLinkTarget>,
	target: string
): { note: NoteLinkTarget | null; ref: CanvasTextMarkdownReference } {
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
