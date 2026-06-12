import { test, expect } from '@playwright/test';
import type { NoteMeta, VaultIndex } from '../src/lib/server/indexer';
import { clampSearchLimit, searchFullTextIndex } from '../src/lib/server/search';

function emptyIndex(): VaultIndex {
	return {
		notes: new Map(),
		titleIndex: new Map(),
		linksOutRaw: new Map(),
		linksOut: new Map(),
		backlinks: new Map(),
		tagIndex: new Map(),
		searchDocs: new Map()
	};
}

function addNote(idx: VaultIndex, notePath: string, title: string, text: string, aliases: string[] = []): void {
	const stem = notePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? notePath.toLowerCase();
	const meta: NoteMeta = {
		notePath,
		title,
		aliases,
		tags: [],
		stem
	};
	const normalized = text.replace(/\s+/g, ' ').trim();
	idx.notes.set(notePath, meta);
	idx.searchDocs.set(notePath, {
		notePath,
		text: normalized,
		textLower: normalized.toLowerCase()
	});
}

test('indexed full-text search ranks title and phrase matches before loose body matches', () => {
	const idx = emptyIndex();
	addNote(idx, 'Notes/Daily.md', 'Daily', 'github sync github sync keeps remote work up to date');
	addNote(idx, 'Reference/GitHub Sync.md', 'GitHub Sync', 'Release checklist and setup notes.');
	addNote(idx, 'Archive/Sync Troubleshooting.md', 'Sync Troubleshooting', 'GitHub notes mention sync separately here.');

	const response = searchFullTextIndex(idx, 'github sync', 10);
	const spacedResponse = searchFullTextIndex(idx, 'github   sync', 10);

	expect(response.mode).toBe('full');
	expect(response.total).toBe(3);
	expect(response.limited).toBe(false);
	expect(spacedResponse.results[0].path).toBe('Reference/GitHub Sync.md');
	expect(response.results.map((hit) => hit.path)).toEqual([
		'Reference/GitHub Sync.md',
		'Notes/Daily.md',
		'Archive/Sync Troubleshooting.md'
	]);
	expect(response.results[1].snippet).toContain('github sync');
	expect(searchFullTextIndex(idx, '???', 10).total).toBe(0);
});

test('indexed full-text search reports capped result sets separately from returned rows', () => {
	const idx = emptyIndex();
	for (let i = 0; i < 40; i += 1) {
		addNote(idx, `Notes/Needle ${String(i).padStart(2, '0')}.md`, `Needle ${i}`, `needle result ${i}`);
	}

	const response = searchFullTextIndex(idx, 'needle', 7);

	expect(response.total).toBe(40);
	expect(response.limit).toBe(7);
	expect(response.limited).toBe(true);
	expect(response.results).toHaveLength(7);
	expect(clampSearchLimit('500', 50)).toBe(200);
	expect(clampSearchLimit('bad', 50)).toBe(50);
});
