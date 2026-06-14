import path from 'node:path';
import { marked } from 'marked';
import { splitAssetReference } from './embed';

export interface MarkdownNoteReference {
	target: string;
	suffix: string;
}

const MARKDOWN_NOTE_EXT_RE = /\.(?:md|markdown)$/i;
const LOCAL_HREF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function safeDecodeUri(input: string): string {
	try {
		return decodeURI(input);
	} catch {
		return input;
	}
}

export function resolveMarkdownNoteReference(
	href: string | null | undefined,
	sourcePath: string | null
): MarkdownNoteReference | null {
	let trimmed = href?.trim() ?? '';
	if (!trimmed) return null;
	if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
		trimmed = trimmed.slice(1, -1).trim();
	}
	if (!trimmed || LOCAL_HREF_RE.test(trimmed) || trimmed.startsWith('/')) return null;

	const ref = splitAssetReference(trimmed);
	if (!ref.path || !MARKDOWN_NOTE_EXT_RE.test(ref.path)) return null;

	const decoded = safeDecodeUri(ref.path);
	const baseDir = sourcePath ? path.posix.dirname(sourcePath) : '.';
	const resolved = path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, decoded));
	if (!resolved || resolved === '.' || resolved === '..' || resolved.startsWith('../')) {
		return null;
	}
	return { target: resolved, suffix: ref.suffix };
}

export function markdownNoteHash(suffix: string): string {
	const hashIdx = suffix.indexOf('#');
	if (hashIdx < 0) return '';
	return suffix.slice(hashIdx);
}

export function parseMarkdownNoteLinkTargets(markdown: string, sourcePath: string | null): string[] {
	const out = new Set<string>();
	const tokens = marked.lexer(markdown, { gfm: true });

	function visit(node: unknown): void {
		if (!node) return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (typeof node !== 'object') return;

		const record = node as Record<string, unknown>;
		if (record.type === 'link' && typeof record.href === 'string') {
			const ref = resolveMarkdownNoteReference(record.href, sourcePath);
			if (ref) out.add(ref.target);
		}

		for (const key of ['tokens', 'items', 'header', 'rows', 'cells']) {
			visit(record[key]);
		}
	}

	visit(tokens);
	return [...out];
}
