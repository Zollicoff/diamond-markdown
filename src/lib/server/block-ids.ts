import { escAttr } from '$lib/util/strings';

export const OBSIDIAN_BLOCK_ID_RE = /^[A-Za-z0-9_-]+$/;

export function blockReferenceId(blockId: string): string {
	return `^${blockId}`;
}

export function isObsidianBlockId(value: string): boolean {
	return OBSIDIAN_BLOCK_ID_RE.test(value);
}

export function addObsidianBlockIds(html: string): string {
	return html.replace(
		/<(p|li)([^>]*)>([\s\S]*?)(?:\s|&nbsp;)\^([A-Za-z0-9_-]+)\s*<\/\1>/g,
		(_whole, tag: string, attrs: string, inner: string, blockId: string) => {
			const idAttr = /\sid\s*=/.test(attrs) ? '' : ` id="${escAttr(blockReferenceId(blockId))}"`;
			return `<${tag}${attrs}${idAttr}>${inner}</${tag}>`;
		}
	);
}
