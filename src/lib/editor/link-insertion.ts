import type { EditorLinkStyle, NoteLinkTarget } from '$lib/types';

export interface LinkInsertion {
	text: string;
	anchorOffset: number;
	headOffset: number;
}

export interface LinkInsertionContext {
	sourcePath?: string | null;
	newLinkFormat?: string | null;
	targets?: NoteLinkTarget[];
}

export interface LinkToolbarButton {
	icon: string;
	title: string;
}

export function linkToolbarButton(style: EditorLinkStyle): LinkToolbarButton {
	return style === 'markdown'
		? { icon: '[]()', title: 'Markdown link' }
		: { icon: '[[ ]]', title: 'Wikilink' };
}

function stripMarkdownExtension(input: string): string {
	return input.replace(/\.(?:md|markdown)$/i, '');
}

function basename(input: string): string {
	return input.split('/').pop() ?? input;
}

function dirname(input: string | null | undefined): string {
	if (!input || !input.includes('/')) return '';
	return input.split('/').slice(0, -1).join('/');
}

function normalizeKey(input: string | null | undefined): string {
	return (input ?? '').trim().toLowerCase();
}

function pathSegments(input: string): string[] {
	return input.split('/').filter(Boolean);
}

function normalizePathParts(parts: string[]): string[] {
	const out: string[] = [];
	for (const part of parts) {
		if (!part || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return out;
}

function relativePath(fromFile: string | null | undefined, toFile: string): string {
	const fromDir = normalizePathParts(pathSegments(dirname(fromFile)));
	const toParts = normalizePathParts(pathSegments(toFile));
	let shared = 0;
	while (shared < fromDir.length && shared < toParts.length && fromDir[shared] === toParts[shared]) {
		shared += 1;
	}
	const up = fromDir.slice(shared).map(() => '..');
	const down = toParts.slice(shared);
	const rel = [...up, ...down].join('/');
	return rel || basename(toFile);
}

function markdownHref(input: string): string {
	const prefixed = input.startsWith('/') ? '/' : '';
	const body = input.startsWith('/') ? input.slice(1) : input;
	return prefixed + body.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function linkTargetKeys(target: NoteLinkTarget): string[] {
	const base = basename(target.path);
	const stem = stripMarkdownExtension(base);
	return [
		target.path,
		stripMarkdownExtension(target.path),
		base,
		stem,
		target.stem,
		target.title,
		...target.aliases
	].filter((value): value is string => Boolean(value));
}

function targetForSelection(selection: string, targets: NoteLinkTarget[] | undefined): NoteLinkTarget | null {
	const key = normalizeKey(selection);
	if (!key || !targets?.length) return null;
	for (const target of targets) {
		if (linkTargetKeys(target).some((candidate) => normalizeKey(candidate) === key)) return target;
	}
	return null;
}

function linkHrefForTarget(target: NoteLinkTarget, context: LinkInsertionContext): string | null {
	const format = context.newLinkFormat;
	if (format === 'relative') return markdownHref(relativePath(context.sourcePath, target.path));
	if (format === 'absolute') return markdownHref(`/${target.path}`);
	if (format === 'shortest') {
		const relative = markdownHref(relativePath(context.sourcePath, target.path));
		const absolute = markdownHref(`/${target.path}`);
		return relative.length <= absolute.length ? relative : absolute;
	}
	return null;
}

export function linkInsertion(
	selection: string,
	style: EditorLinkStyle,
	context: LinkInsertionContext = {}
): LinkInsertion {
	if (style === 'markdown') {
		if (selection) {
			const target = targetForSelection(selection, context.targets);
			const href = target ? linkHrefForTarget(target, context) : null;
			if (href) {
				const text = `[${selection}](${href})`;
				return {
					text,
					anchorOffset: text.length,
					headOffset: text.length
				};
			}
			return {
				text: `[${selection}]()`,
				anchorOffset: selection.length + 3,
				headOffset: selection.length + 3
			};
		}
		return { text: '[]()', anchorOffset: 1, headOffset: 1 };
	}

	if (selection) {
		return {
			text: `[[${selection}]]`,
			anchorOffset: 2,
			headOffset: selection.length + 2
		};
	}
	return { text: '[[]]', anchorOffset: 2, headOffset: 2 };
}
