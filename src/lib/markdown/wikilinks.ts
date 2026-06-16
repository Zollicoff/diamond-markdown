import { slugifyHeading } from '$lib/util/strings';

export interface WikilinkSubpath {
	heading: string | null;
	blockId: string | null;
}

export const OBSIDIAN_BLOCK_ID_RE = /^[A-Za-z0-9_-]+$/;

export function blockReferenceId(blockId: string): string {
	return `^${blockId}`;
}

export function isObsidianBlockId(value: string): boolean {
	return OBSIDIAN_BLOCK_ID_RE.test(value);
}

export function parseWikilinkSubpath(value: string | undefined): WikilinkSubpath {
	const subpath = value?.trim() ?? '';
	if (!subpath) return { heading: null, blockId: null };
	if (subpath.startsWith('^')) {
		const blockId = subpath.slice(1).trim();
		if (isObsidianBlockId(blockId)) return { heading: null, blockId };
	}
	return { heading: subpath, blockId: null };
}

export function wikilinkFragment(link: WikilinkSubpath): string {
	if (link.blockId) return `#${blockReferenceId(link.blockId)}`;
	return link.heading ? `#${slugifyHeading(link.heading)}` : '';
}
