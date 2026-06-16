import type { LinkRef } from '$lib/types';
import type { NoteMeta, VaultIndex } from './indexer';

export function unlinkedMentionsForNote(idx: VaultIndex, targetPath: string): LinkRef[] {
	const target = idx.notes.get(targetPath);
	if (!target) return [];
	const aliases = mentionNeedles(target);
	if (aliases.length === 0) return [];
	const linkedSources = idx.backlinks.get(targetPath) ?? new Set<string>();
	const mentions: LinkRef[] = [];

	for (const meta of idx.notes.values()) {
		if (meta.notePath === targetPath || linkedSources.has(meta.notePath)) continue;
		const doc = idx.searchDocs.get(meta.notePath);
		if (!doc || !mentionsAny(doc.text, aliases)) continue;
		mentions.push({
			path: meta.notePath,
			title: meta.title
		});
	}

	return mentions.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

function mentionNeedles(meta: NoteMeta): string[] {
	return [...new Set([meta.title, meta.stem, ...meta.aliases]
		.map((value) => value.trim())
		.filter((value) => value.length >= 2)
		.sort((a, b) => b.length - a.length))];
}

function mentionsAny(text: string, needles: string[]): boolean {
	for (const needle of needles) {
		if (mentionsText(text, needle)) return true;
	}
	return false;
}

function mentionsText(text: string, needle: string): boolean {
	const escaped = escapeRegExp(needle);
	const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, 'iu');
	return pattern.test(text);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
